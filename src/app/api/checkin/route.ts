import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { calculateDistance } from '../../../lib/geofence';

export async function POST(request: Request) {
  try {
    const { location_id, lat, lng, user_id, gps_bypass } = await request.json();

    if (!location_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing location_id or user_id parameters.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database service is not configured.' },
        { status: 500 }
      );
    }

    // 1. Fetch location coordinates and geofence boundary from DB
    const { data: location, error: locError } = await supabaseAdmin
      .from('locations')
      .select('lat, lng, geofence_radius_m')
      .eq('id', location_id)
      .single();

    if (locError || !location) {
      return NextResponse.json(
        { error: 'Target location not found.' },
        { status: 404 }
      );
    }

    let gpsVerified = false;
    let distanceMeters: number | null = null;

    if (lat !== null && lng !== null) {
      // Calculate distance using Haversine helper
      distanceMeters = calculateDistance(lat, lng, location.lat, location.lng);
      gpsVerified = distanceMeters <= location.geofence_radius_m;
    }

    // 2. Reject check-in if GPS was successfully loaded but coordinates are outside geofence boundary
    // and no bypass was requested (Bypass is only allowed when GPS permission is denied entirely on phone)
    if (lat !== null && lng !== null && !gpsVerified && !gps_bypass) {
      return NextResponse.json(
        { 
          error: 'Geofence verification failed.',
          distance: Math.round(distanceMeters || 0),
          allowed: location.geofence_radius_m
        },
        { status: 400 }
      );
    }

    // 3. Write check_in event using admin credentials
    const { data: event, error: eventError } = await supabaseAdmin
      .from('queue_events')
      .insert({
        location_id,
        user_id,
        event_type: 'check_in',
        gps_lat: lat,
        gps_lng: lng,
        gps_verified: gpsVerified || gps_bypass
      })
      .select()
      .single();

    if (eventError) {
      throw eventError;
    }

    return NextResponse.json({
      success: true,
      event_id: event.id,
      gps_verified: event.gps_verified
    });
  } catch (err: any) {
    console.error('Checkin api route error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
