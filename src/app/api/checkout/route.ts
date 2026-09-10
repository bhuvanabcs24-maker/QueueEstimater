import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const { queue_event_id, location_id } = await request.json();

    if (!queue_event_id || !location_id) {
      return NextResponse.json(
        { error: 'Missing queue_event_id or location_id parameters.' },
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

    // Fetch original event to retrieve the owner user_id
    const { data: originalEvent, error: fetchError } = await supabaseAdmin
      .from('queue_events')
      .select('user_id')
      .eq('id', queue_event_id)
      .single();

    if (fetchError || !originalEvent) {
      return NextResponse.json(
        { error: 'Original check-in record not found.' },
        { status: 404 }
      );
    }

    // Record check_out event
    const { data: event, error: insertError } = await supabaseAdmin
      .from('queue_events')
      .insert({
        location_id,
        user_id: originalEvent.user_id,
        event_type: 'check_out',
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true, event_id: event.id });
  } catch (err: any) {
    console.error('Checkout api route error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
