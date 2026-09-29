import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { calculateDistance } from '../../../lib/geofence';
import { getAuthenticatedUser } from '../../../lib/auth';
import { checkInPatient, getVenueState, pullCloudStore } from '../../../lib/realtimeStore';

export async function POST(request: Request) {
  try {
    await pullCloudStore();
    const body = await request.json().catch(() => ({}));
    const { location_id, location_name, lat, lng, gps_bypass, user_name, phone } = body;

    if (!location_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: location_id.' },
        { status: 400 }
      );
    }

    // Attempt to authenticate user if token is provided
    const user = await getAuthenticatedUser(request);
    const userId = user ? user.id : (body.user_id || `demo-user-${Math.random().toString(36).substring(2, 8)}`);

    // Fetch venue configuration from Realtime Store
    const venue = getVenueState(location_id, location_name);
    if (location_name && typeof location_name === 'string' && location_name.trim()) {
      venue.name = location_name.trim();
    }

    // Geospatial Verification
    let gpsVerified = false;
    let distanceMeters: number | null = null;

    if (typeof lat === 'number' && typeof lng === 'number' && venue) {
      distanceMeters = calculateDistance(lat, lng, venue.lat, venue.lng);
      // Adaptive 50m tolerance buffer for mobile indoor GPS variance
      const effectiveRadius = (venue.geofenceRadiusM || 150) + 50;
      gpsVerified = distanceMeters <= effectiveRadius;
    }

    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !gpsVerified &&
      !gps_bypass &&
      venue
    ) {
      return NextResponse.json(
        {
          error: `Geofence validation failed. You are ${Math.round(distanceMeters || 0)}m away, but must be within ${venue.geofenceRadiusM}m of ${venue.name}.`,
          distance_meters: Math.round(distanceMeters || 0),
          allowed_radius_meters: venue.geofenceRadiusM,
        },
        { status: 403 }
      );
    }

    const isVerifiedCheckIn = gpsVerified || Boolean(gps_bypass);

    // 1. Instantly register in the Realtime Store & Broadcast to all SSE listeners
    const { venueState, newPatient } = await checkInPatient(location_id, {
      name: user_name || (user?.user_metadata?.full_name ? user.user_metadata.full_name : `Patient #${venue.queueList.length + 105}`),
      phone: phone || user?.phone || '+91 Client',
      userId,
      gpsVerified: isVerifiedCheckIn,
      venueName: location_name,
    });

    // 2. Best-effort write to Supabase if configured and reachable
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      try {
        await Promise.race([
          supabaseAdmin.from('queue_events').insert({
            location_id,
            user_id: user?.id || null,
            event_type: 'check_in',
            gps_lat: typeof lat === 'number' ? lat : null,
            gps_lng: typeof lng === 'number' ? lng : null,
            gps_verified: isVerifiedCheckIn,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), 2000)),
        ]);
      } catch (sbErr) {
        // Fallback to in-app realtime engine safely
        console.warn('Supabase queue_event insert skipped (using in-app realtime engine):', sbErr);
      }
    }

    return NextResponse.json({
      success: true,
      event_id: newPatient.id,
      ticket_number: newPatient.ticketNumber,
      location_name: venueState.name,
      gps_verified: newPatient.gpsVerified,
      created_at: newPatient.checkinTime,
      position: newPatient.position,
      estimated_wait_minutes: newPatient.estimatedWaitMinutes,
      avg_wait_minutes: newPatient.estimatedWaitMinutes,
      venue_state: venueState,
    });
  } catch (err: unknown) {
    console.error('Checkin API route error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected server error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
