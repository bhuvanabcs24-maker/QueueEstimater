import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { calculateDistance } from '../../../lib/geofence';
import { getAuthenticatedUser } from '../../../lib/auth';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user from session token (never trust client-supplied user_id)
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid authentication session is required to check in.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { location_id, lat, lng, gps_bypass } = body;

    if (!location_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: location_id.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database service is currently unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // 2. Fetch location coordinates and geofence boundary from DB
    const { data: location, error: locError } = await supabaseAdmin
      .from('locations')
      .select('id, name, lat, lng, geofence_radius_m, avg_service_time_minutes')
      .eq('id', location_id)
      .single();

    if (locError || !location) {
      return NextResponse.json(
        { error: 'Specified location was not found or is no longer active.' },
        { status: 404 }
      );
    }

    // 3. Prevent duplicate active check-ins:
    // Check user's most recent queue event at this location
    const { data: recentEvents, error: recentError } = await supabaseAdmin
      .from('queue_events')
      .select('id, event_type, created_at')
      .eq('location_id', location_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!recentError && recentEvents && recentEvents.length > 0) {
      const latest = recentEvents[0];
      if (latest.event_type === 'check_in') {
        return NextResponse.json(
          {
            error: `You already have an active check-in at ${location.name}. Please check out or cancel your current spot before re-joining.`,
            existing_event_id: latest.id,
            checked_in_at: latest.created_at
          },
          { status: 409 } // 409 Conflict
        );
      }
    }

    // 4. Geospatial Verification (Haversine distance calculation)
    let gpsVerified = false;
    let distanceMeters: number | null = null;

    if (typeof lat === 'number' && typeof lng === 'number') {
      distanceMeters = calculateDistance(lat, lng, location.lat, location.lng);
      gpsVerified = distanceMeters <= location.geofence_radius_m;
    }

    // Reject check-in if GPS coordinates were provided but fall outside geofence boundary
    // and no bypass was authorized (e.g. verified QR camera scan on device with denied GPS permission)
    if (typeof lat === 'number' && typeof lng === 'number' && !gpsVerified && !gps_bypass) {
      return NextResponse.json(
        {
          error: `Geofence validation failed. You are ${Math.round(distanceMeters || 0)}m away, but must be within ${location.geofence_radius_m}m of ${location.name}.`,
          distance_meters: Math.round(distanceMeters || 0),
          allowed_radius_meters: location.geofence_radius_m
        },
        { status: 403 } // 403 Forbidden
      );
    }

    // 5. Insert check_in event bound strictly to verified user.id
    const isVerifiedCheckIn = gpsVerified || Boolean(gps_bypass);
    const { data: event, error: eventError } = await supabaseAdmin
      .from('queue_events')
      .insert({
        location_id: location.id,
        user_id: user.id,
        event_type: 'check_in',
        gps_lat: typeof lat === 'number' ? lat : null,
        gps_lng: typeof lng === 'number' ? lng : null,
        gps_verified: isVerifiedCheckIn
      })
      .select('id, location_id, user_id, event_type, gps_verified, created_at')
      .single();

    if (eventError) {
      console.error('Checkin event insertion error:', eventError);
      return NextResponse.json(
        { error: 'Failed to record check-in. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      event_id: event.id,
      location_name: location.name,
      gps_verified: event.gps_verified,
      created_at: event.created_at
    });
  } catch (err: unknown) {
    console.error('Checkin API route error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected server error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
