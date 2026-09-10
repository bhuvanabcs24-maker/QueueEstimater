import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getAuthenticatedUser } from '../../../lib/auth';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user from session token
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid authentication session is required to cancel a queue entry.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { queue_event_id, location_id } = body;

    if (!queue_event_id || !location_id) {
      return NextResponse.json(
        { error: 'Missing required parameters: queue_event_id or location_id.' },
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

    // 2. Fetch original check-in event to verify existence and ownership
    const { data: originalEvent, error: fetchError } = await supabaseAdmin
      .from('queue_events')
      .select('id, user_id, location_id, event_type')
      .eq('id', queue_event_id)
      .single();

    if (fetchError || !originalEvent) {
      return NextResponse.json(
        { error: 'Original check-in record was not found.' },
        { status: 404 }
      );
    }

    // 3. Security: Prevent users from cancelling another user's queue entry
    if (originalEvent.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to cancel another user’s queue entry.' },
        { status: 403 }
      );
    }

    // 4. Check whether the entry is already cancelled or checked out
    const { data: latestEvents } = await supabaseAdmin
      .from('queue_events')
      .select('event_type')
      .eq('location_id', location_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (latestEvents && latestEvents.length > 0 && latestEvents[0].event_type !== 'check_in') {
      return NextResponse.json(
        {
          error: `Queue entry is already marked as ${latestEvents[0].event_type === 'cancel' ? 'cancelled' : 'completed'}.`
        },
        { status: 400 }
      );
    }

    // 5. Record cancel event with verified user.id
    const { data: event, error: insertError } = await supabaseAdmin
      .from('queue_events')
      .insert({
        location_id,
        user_id: user.id,
        event_type: 'cancel',
      })
      .select('id, location_id, user_id, event_type, created_at')
      .single();

    if (insertError) {
      console.error('Cancel insertion error:', insertError);
      return NextResponse.json(
        { error: 'Failed to record cancellation. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      event_id: event.id,
      message: 'Queue entry successfully cancelled.'
    });
  } catch (err: unknown) {
    console.error('Cancel API route error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected server error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
