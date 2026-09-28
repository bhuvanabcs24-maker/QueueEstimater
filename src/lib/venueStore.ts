import { supabase, isSupabaseConfigured } from './supabase';
import { calculateDistance } from './geofence';

export interface Venue {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  avg_service_time_minutes: number;
  current_queue_length?: number;
  total_served?: number;
  created_at?: string;
  distance_meters?: number;
  is_custom?: boolean;
}

// Zero mock/sample venues - only real facilities added in database or newly registered
export const INITIAL_VENUES: Venue[] = [];

const STORAGE_KEY = 'registered_venues_v1';

// Legacy mock IDs to cleanse from user storage
const MOCK_IDS = new Set([
  'mock-clinic-a',
  'mock-lab-b',
  'mock-peds-c',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
]);

export function getAllVenues(): Venue[] {
  let custom: Venue[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Strictly filter out any sample/mock venues from previous sessions
          custom = parsed.filter(
            (v: Venue) =>
              v &&
              v.id &&
              !MOCK_IDS.has(v.id) &&
              !v.id.startsWith('mock-') &&
              !v.name.includes('Mock')
          );

          // Update storage if any mock items were cleansed
          if (custom.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
          }
        }
      }
    } catch (e) {
      console.error('Error reading registered venues:', e);
    }
  }

  const map = new Map<string, Venue>();
  custom.forEach((v) => map.set(v.id, { ...v, is_custom: true }));

  return Array.from(map.values());
}

/**
 * Resolves all real venues with real physical distance to user GPS.
 * No fake offsets or mock locations.
 */
export function getVenuesNearGps(userLat?: number, userLng?: number): Venue[] {
  const all = getAllVenues();

  if (typeof userLat !== 'number' || typeof userLng !== 'number') {
    return all;
  }

  const processed = all.map((v) => {
    const dist = calculateDistance(userLat, userLng, v.lat, v.lng);
    return {
      ...v,
      distance_meters: Math.round(dist),
    };
  });

  return processed.sort((a, b) => (a.distance_meters || 0) - (b.distance_meters || 0));
}

export function getVenueById(id: string, userLat?: number, userLng?: number): Venue | null {
  const all = getVenuesNearGps(userLat, userLng);
  const found = all.find((v) => v.id === id || v.id.toLowerCase() === id.toLowerCase());

  if (found) return found;

  // Check sessionStorage or fallback
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list: Venue[] = JSON.parse(raw);
        const item = list.find((v) => v.id === id || v.id.toLowerCase() === id.toLowerCase());
        if (item) return item;
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Fetch latest real registered venues from server database and sync locally
 */
export async function syncVenuesFromDatabase(): Promise<Venue[]> {
  try {
    const res = await fetch('/api/venues');
    if (!res.ok) return getAllVenues();
    const data = await res.json();
    if (data && Array.isArray(data.venues)) {
      const serverVenues: Venue[] = data.venues.filter(
        (v: Venue) => v && v.id && !MOCK_IDS.has(v.id) && !v.id.startsWith('mock-')
      );

      if (typeof window !== 'undefined') {
        const local = getAllVenues();
        const map = new Map<string, Venue>();
        local.forEach((v) => map.set(v.id, v));
        serverVenues.forEach((v) => map.set(v.id, { ...v, is_custom: true }));
        const merged = Array.from(map.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      }
      return serverVenues;
    }
  } catch (err) {
    console.warn('Venue database sync fallback:', err);
  }
  return getAllVenues();
}

export function registerNewVenue(venue: Omit<Venue, 'id'> & { id?: string }): Venue {
  const newId = venue.id || `venue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullVenue: Venue = {
    ...venue,
    id: newId,
    current_queue_length: 0,
    total_served: 0,
    created_at: new Date().toISOString(),
    is_custom: true,
  };

  if (typeof window !== 'undefined') {
    const existing = getAllVenues().filter((v) => v.is_custom && !MOCK_IDS.has(v.id) && v.id !== fullVenue.id);
    existing.push(fullVenue);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }

  // Sync with real-time server & database via /api/venues
  if (typeof window !== 'undefined') {
    fetch('/api/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullVenue),
    }).catch(() => {});

    // Also broadcast SSE event
    fetch('/api/realtime/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REGISTER_VENUE',
        venueId: fullVenue.id,
        payload: {
          id: fullVenue.id,
          name: fullVenue.name,
          category: fullVenue.category,
          address: fullVenue.address,
          lat: fullVenue.lat,
          lng: fullVenue.lng,
          geofence_radius_m: fullVenue.geofence_radius_m,
          avg_service_time_minutes: fullVenue.avg_service_time_minutes,
        },
      }),
    }).catch(() => {});
  }

  if (isSupabaseConfigured) {
    try {
      supabase
        .from('locations')
        .insert({
          id: fullVenue.id,
          name: fullVenue.name,
          category: fullVenue.category,
          address: fullVenue.address,
          lat: fullVenue.lat,
          lng: fullVenue.lng,
          geofence_radius_m: fullVenue.geofence_radius_m,
          avg_service_time_mins: fullVenue.avg_service_time_minutes,
        })
        .then(
          ({ error }) => {
            if (error) console.warn('Supabase venue insert notice:', error.message);
          },
          () => {}
        );
    } catch {
      // Ignore
    }
  }

  return fullVenue;
}

export function recordUserServed(locationId: string, durationMinutes: number) {
  if (typeof window === 'undefined') return;
  const venues = getAllVenues();
  const index = venues.findIndex((v) => v.id === locationId);
  if (index !== -1) {
    const v = venues[index];
    const totalServed = (v.total_served || 0) + 1;
    const updatedAvg =
      Math.round(((v.avg_service_time_minutes * (totalServed - 1) + durationMinutes) / totalServed) * 10) / 10;

    v.avg_service_time_minutes = Math.max(1, updatedAvg);
    v.total_served = totalServed;
    v.current_queue_length = Math.max(0, (v.current_queue_length || 1) - 1);

    venues[index] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(venues));
  }
}

export async function deleteVenue(id: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    const list = getAllVenues().filter((v) => v.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

    try {
      await fetch(`/api/venues?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Delete venue API notice:', err);
    }
  }

  if (isSupabaseConfigured) {
    try {
      supabase.from('locations').delete().eq('id', id).then(() => {});
    } catch {
      // Ignore
    }
  }

  return true;
}
