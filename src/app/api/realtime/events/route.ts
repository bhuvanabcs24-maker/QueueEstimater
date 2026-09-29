import { NextResponse } from 'next/server';
import {
  getAllVenuesState,
  getVenueState,
  checkInPatient,
  callNextPatient,
  completeConsultation,
  cancelPatientSpot,
  resetVenueQueue,
  upsertVenueRegistration,
  pullCloudStore,
} from '@/lib/realtimeStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get('venueId');

  await pullCloudStore();

  if (venueId) {
    const venue = getVenueState(venueId);
    return NextResponse.json({ success: true, venue });
  }

  const all = getAllVenuesState();
  return NextResponse.json({ success: true, venues: all });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, venueId, payload } = body;

    if (!action || !venueId) {
      return NextResponse.json(
        { error: 'Missing required parameters: action and venueId.' },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case 'CHECK_IN': {
        const { venueState, newPatient } = await checkInPatient(venueId, {
          name: payload?.name,
          phone: payload?.phone,
          userId: payload?.userId,
          gpsVerified: payload?.gpsVerified,
        });
        result = { venueState, newPatient };
        break;
      }

      case 'CALL_NEXT': {
        const { venueState, calledPatient } = await callNextPatient(venueId);
        result = { venueState, calledPatient };
        break;
      }

      case 'COMPLETE': {
        const { venueState, completedPatient } = await completeConsultation(
          venueId,
          payload?.actualDurationMinutes
        );
        result = { venueState, completedPatient };
        break;
      }

      case 'CANCEL': {
        const patientId = payload?.patientId || payload?.userId;
        const { venueState, cancelledPatient } = await cancelPatientSpot(venueId, patientId);
        result = { venueState, cancelledPatient };
        break;
      }

      case 'RESET': {
        const venueState = await resetVenueQueue(venueId);
        result = { venueState };
        break;
      }

      case 'REGISTER_VENUE': {
        const venueState = await upsertVenueRegistration(payload);
        result = { venueState };
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action type: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    console.error('Realtime events API error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
