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

export const INITIAL_VENUES: Venue[] = [
  {
    id: 'mock-clinic-a',
    name: 'General Medicine Clinic A',
    category: 'Clinic',
    address: 'Medical Plaza, Counter A',
    lat: 37.7749,
    lng: -122.4194,
    geofence_radius_m: 200,
    avg_service_time_minutes: 10,
    current_queue_length: 3,
  },
  {
    id: 'mock-lab-b',
    name: 'Express Lab Services',
    category: 'Laboratory',
    address: 'Diagnostic Wing, Counter 12',
    lat: 37.7752,
    lng: -122.4189,
    geofence_radius_m: 150,
    avg_service_time_minutes: 6,
    current_queue_length: 1,
  },
  {
    id: 'mock-peds-c',
    name: 'Pediatric Outpatient Clinic',
    category: 'Pediatrics',
    address: 'Children Block, Floor 2',
    lat: 37.7745,
    lng: -122.4201,
    geofence_radius_m: 150,
    avg_service_time_minutes: 12,
    current_queue_length: 5,
  },
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'City Health Clinic - Counter 1',
    category: 'Healthcare',
    address: '123 Main St, Central City',
    lat: 12.9716,
    lng: 77.5946,
    geofence_radius_m: 200,
    avg_service_time_minutes: 5,
    current_queue_length: 4,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Campus Administrative Desk',
    category: 'Education',
    address: 'Block B, University Center',
    lat: 12.972,
    lng: 77.595,
    geofence_radius_m: 150,
    avg_service_time_minutes: 4,
    current_queue_length: 2,
  },
];

const STORAGE_KEY = 'registered_venues_v1';

export function getAllVenues(): Venue[] {
  let custom: Venue[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) custom = JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }
  }

  const map = new Map<string, Venue>();
  INITIAL_VENUES.forEach((v) => map.set(v.id, v));
  custom.forEach((v) => map.set(v.id, { ...v, is_custom: true }));

  return Array.from(map.values());
}

/**
 * Dynamically resolves all venues relative to user's real-time GPS coordinates
 * so sample venues appear in the immediate walking vicinity (100m - 900m)
 */
export function getVenuesNearGps(userLat?: number, userLng?: number): Venue[] {
  const all = getAllVenues();

  if (typeof userLat !== 'number' || typeof userLng !== 'number') {
    return all;
  }

  // Offsets for demo sample venues to place them realistically near user's GPS
  const offsets: Record<string, { lat: number; lng: number }> = {
    'mock-clinic-a': { lat: 0.0012, lng: 0.001 }, // ~150m
    'mock-lab-b': { lat: -0.002, lng: 0.0015 }, // ~260m
    'mock-peds-c': { lat: 0.0035, lng: -0.0025 }, // ~500m
    '11111111-1111-1111-1111-111111111111': { lat: -0.0045, lng: -0.003 }, // ~650m
    '22222222-2222-2222-2222-222222222222': { lat: 0.006, lng: 0.004 }, // ~900m
  };

  const processed = all.map((v) => {
    let lat = v.lat;
    let lng = v.lng;

    // If it's a sample venue and custom GPS is available, anchor around user GPS
    if (!v.is_custom && offsets[v.id]) {
      lat = userLat + offsets[v.id].lat;
      lng = userLng + offsets[v.id].lng;
    }

    const dist = calculateDistance(userLat, userLng, lat, lng);

    return {
      ...v,
      lat,
      lng,
      distance_meters: Math.round(dist),
    };
  });

  return processed.sort((a, b) => (a.distance_meters || 0) - (b.distance_meters || 0));
}

export function getVenueById(id: string, userLat?: number, userLng?: number): Venue {
  const all = getVenuesNearGps(userLat, userLng);
  const found = all.find((v) => v.id === id || v.id.toLowerCase() === id.toLowerCase());

  if (found) return found;

  const formattedTitle = id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const fallbackLat = typeof userLat === 'number' ? userLat : 12.9716;
  const fallbackLng = typeof userLng === 'number' ? userLng : 77.5946;

  return {
    id,
    name: formattedTitle.length > 20 ? `Venue (${id.substring(0, 8)})` : formattedTitle,
    category: 'Venue Counter',
    address: 'Mapped QR Location Site',
    lat: fallbackLat,
    lng: fallbackLng,
    geofence_radius_m: 150,
    avg_service_time_minutes: 5,
    current_queue_length: 2,
  };
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
    const existing = getAllVenues().filter((v) => v.is_custom);
    existing.push(fullVenue);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }

  if (isSupabaseConfigured) {
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
      .then(({ error }) => {
        if (error) console.warn('Supabase venue insert notice:', error.message);
      });
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
    const updatedAvg = Math.round(((v.avg_service_time_minutes * (totalServed - 1) + durationMinutes) / totalServed) * 10) / 10;

    v.avg_service_time_minutes = Math.max(1, updatedAvg);
    v.total_served = totalServed;
    v.current_queue_length = Math.max(0, (v.current_queue_length || 1) - 1);

    venues[index] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(venues));
  }
}
