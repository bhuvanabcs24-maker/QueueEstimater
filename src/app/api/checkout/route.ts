import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getAuthenticatedUser } from '../../../lib/auth';
import { completeConsultation, cancelPatientSpot } from '../../../lib/realtimeStore';

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const { queue_event_id, location_id, duration_minutes } = body;

    if (!location_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: location_id.' },
        { status: 400 }
      );
    }

    // 1. Instantly update Realtime Store & Broadcast to all SSE listeners
    const { venueState, completedPatient } = completeConsultation(
      location_id,
      duration_minutes ? Number(duration_minutes) : undefined
    );

    // Also cancel or complete in case specific event was provided
    if (queue_event_id) {
      cancelPatientSpot(location_id, queue_event_id);
    }

    // 2. Best-effort Supabase insert if available
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin && user) {
      try {
        await Promise.race([
          supabaseAdmin.from('queue_events').insert({
            location_id,
            user_id: user.id,
            event_type: 'check_out',
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), 2000)),
        ]);
      } catch (sbErr) {
        console.warn('Supabase checkout skipped:', sbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Checkout recorded successfully. Live queue updated!',
      completed_patient: completedPatient,
      venue_state: venueState,
    });
  } catch (err: unknown) {
    console.error('Checkout API route error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected server error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
