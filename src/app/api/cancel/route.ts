import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getAuthenticatedUser } from '../../../lib/auth';
import { cancelPatientSpot } from '../../../lib/realtimeStore';

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const { queue_event_id, location_id } = body;

    if (!location_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: location_id.' },
        { status: 400 }
      );
    }

    const targetId = queue_event_id || user?.id || '';

    // 1. Instantly update Realtime Store & Broadcast to all SSE listeners
    const { venueState, cancelledPatient } = await cancelPatientSpot(location_id, targetId);

    // 2. Best-effort Supabase insert
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin && user) {
      try {
        await Promise.race([
          supabaseAdmin.from('queue_events').insert({
            location_id,
            user_id: user.id,
            event_type: 'cancel',
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), 2000)),
        ]);
      } catch (sbErr) {
        console.warn('Supabase cancel insert skipped:', sbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Queue entry successfully cancelled.',
      cancelled_patient: cancelledPatient,
      venue_state: venueState,
    });
  } catch (err: unknown) {
    console.error('Cancel API route error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected server error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
