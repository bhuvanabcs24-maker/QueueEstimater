import { NextResponse } from 'next/server';
import { getAllVenuesState, upsertVenueRegistration, deleteVenueState } from '@/lib/realtimeStore';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const realtimeState = getAllVenuesState();
    const venuesList = Object.values(realtimeState).map((v) => ({
      id: v.venueId,
      name: v.name,
      category: v.category,
      address: v.address,
      lat: v.lat,
      lng: v.lng,
      geofence_radius_m: v.geofenceRadiusM,
      avg_service_time_minutes: v.avgServiceTimeMinutes,
      current_queue_length: v.currentQueueLength,
      total_served: v.totalServed,
      created_at: v.lastUpdated,
      is_custom: true,
    }));

    // If Supabase is configured, attempt to merge with database locations
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      try {
        const { data: dbLocations } = await Promise.race([
          supabaseAdmin.from('locations').select('*'),
          new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 1500)),
        ]);

        if (dbLocations && Array.isArray(dbLocations)) {
          const map = new Map<string, typeof venuesList[0]>();
          venuesList.forEach((v) => map.set(v.id, v));

          dbLocations.forEach((dbLoc) => {
            const venueId = dbLoc.id;
            const existing = map.get(venueId);
            const merged = {
              id: venueId,
              name: dbLoc.name || 'Clinical Facility',
              category: dbLoc.category || 'Healthcare',
              address: dbLoc.address || 'Medical Counter',
              lat: Number(dbLoc.lat || 12.9716),
              lng: Number(dbLoc.lng || 77.5946),
              geofence_radius_m: Number(dbLoc.geofence_radius_m || 150),
              avg_service_time_minutes: Number(dbLoc.avg_service_time_mins || 5),
              current_queue_length: existing ? existing.current_queue_length : 0,
              total_served: existing ? existing.total_served : 0,
              created_at: dbLoc.created_at || new Date().toISOString(),
              is_custom: true,
            };

            // Register in real-time server store if not already present
            if (!existing) {
              upsertVenueRegistration({
                id: merged.id,
                name: merged.name,
                category: merged.category,
                address: merged.address,
                lat: merged.lat,
                lng: merged.lng,
                geofence_radius_m: merged.geofence_radius_m,
                avg_service_time_minutes: merged.avg_service_time_minutes,
              });
            }

            map.set(venueId, merged);
          });

          return NextResponse.json({ venues: Array.from(map.values()) });
        }
      } catch (err) {
        console.warn('Database venue fetch fallback notice:', err);
      }
    }

    return NextResponse.json({ venues: venuesList });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch venues';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, category, address, lat, lng, geofence_radius_m, avg_service_time_minutes } = body;

    if (!name || !address || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'Missing required venue properties (name, address, lat, lng).' },
        { status: 400 }
      );
    }

    const newId = body.id || `venue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullVenue = {
      id: newId,
      name: name.trim(),
      category: category || 'Healthcare',
      address: address.trim(),
      lat: Number(lat),
      lng: Number(lng),
      geofence_radius_m: Number(geofence_radius_m || 150),
      avg_service_time_minutes: Number(avg_service_time_minutes || 5),
    };

    // 1. Save into in-memory real-time store
    upsertVenueRegistration(fullVenue);

    // 2. Best-effort insert into Supabase
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      try {
        await Promise.race([
          supabaseAdmin.from('locations').upsert({
            id: fullVenue.id,
            name: fullVenue.name,
            category: fullVenue.category,
            address: fullVenue.address,
            lat: fullVenue.lat,
            lng: fullVenue.lng,
            geofence_radius_m: fullVenue.geofence_radius_m,
            avg_service_time_mins: fullVenue.avg_service_time_minutes,
          }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (sbErr) {
        console.warn('Supabase venue upsert notice:', sbErr);
      }
    }

    return NextResponse.json({ success: true, venue: fullVenue });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to register venue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing venue id parameter' }, { status: 400 });
    }

    // 1. Delete from realtime store and disk
    deleteVenueState(id);

    // 2. Best-effort delete from Supabase
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      try {
        await Promise.race([
          supabaseAdmin.from('locations').delete().eq('id', id),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn('Supabase delete notice:', err);
      }
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete venue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

