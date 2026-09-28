export interface QueuePatient {
  id: string;
  ticketNumber: number;
  name: string;
  phone: string;
  checkinTime: string;
  gpsVerified: boolean;
  userId?: string;
  status: 'waiting' | 'serving' | 'completed' | 'cancelled';
  position?: number;
  estimatedWaitMinutes?: number;
}

export interface VenueRealtimeState {
  venueId: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  geofenceRadiusM: number;
  avgServiceTimeMinutes: number;
  queueList: QueuePatient[];
  servingTicket: QueuePatient | null;
  totalServed: number;
  currentQueueLength: number;
  estimatedWaitMinutes: number;
  lastUpdated: string;
}

export interface RealtimeEvent {
  type: 'CHECK_IN' | 'CALL_NEXT' | 'COMPLETE' | 'CANCEL' | 'RESET' | 'VENUE_UPDATE' | 'INIT' | 'REGISTER_VENUE';
  venueId?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'venues.json');

function saveStoreToFile(store: Record<string, VenueRealtimeState>) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist venues to file:', err);
  }
}

function loadStoreFromFile(): Record<string, VenueRealtimeState> {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.warn('Could not read venues from file:', err);
  }
  return {};
}

// Global in-memory singleton for Next.js Node environment
declare global {
  // eslint-disable-next-line no-var
  var __realtimeQueueState: Record<string, VenueRealtimeState> | undefined;
  // eslint-disable-next-line no-var
  var __realtimeSseSubscribers: Set<(data: string) => void> | undefined;
  // eslint-disable-next-line no-var
  var __nextTicketNumber: number | undefined;
}

// Real-time venue store starts clean - only real database or registered venues appear
function getStore(): Record<string, VenueRealtimeState> {
  if (!global.__realtimeQueueState) {
    global.__realtimeQueueState = loadStoreFromFile();
    global.__nextTicketNumber = 100;
  }
  return global.__realtimeQueueState!;
}

function getSubscribers(): Set<(data: string) => void> {
  if (!global.__realtimeSseSubscribers) {
    global.__realtimeSseSubscribers = new Set();
  }
  return global.__realtimeSseSubscribers!;
}

export function subscribeRealtimeSse(send: (data: string) => void): () => void {
  const subs = getSubscribers();
  subs.add(send);
  return () => {
    subs.delete(send);
  };
}

export function broadcastRealtimeEvent(event: RealtimeEvent) {
  const subs = getSubscribers();
  const serialized = `data: ${JSON.stringify(event)}\n\n`;
  subs.forEach((send) => {
    try {
      send(serialized);
    } catch {
      subs.delete(send);
    }
  });
}

function recalculatePositions(state: VenueRealtimeState) {
  state.queueList.forEach((pt, index) => {
    pt.position = index + 1;
    pt.estimatedWaitMinutes = (index + 1) * state.avgServiceTimeMinutes;
  });
  state.currentQueueLength = state.queueList.length;
  state.estimatedWaitMinutes = state.queueList.length * state.avgServiceTimeMinutes;
  state.lastUpdated = new Date().toISOString();
}

export function getVenueState(venueId: string): VenueRealtimeState {
  const store = getStore();
  if (store[venueId]) {
    return store[venueId];
  }

  // Create an on-demand venue if it's a registered custom venue
  const formattedTitle = venueId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const newVenue: VenueRealtimeState = {
    venueId,
    name: formattedTitle.length > 25 ? `Venue (${venueId.substring(0, 8)})` : formattedTitle,
    category: 'Venue Counter',
    address: 'Mapped QR Location Site',
    lat: 12.9716,
    lng: 77.5946,
    geofenceRadiusM: 150,
    avgServiceTimeMinutes: 5,
    queueList: [],
    servingTicket: null,
    totalServed: 0,
    currentQueueLength: 0,
    estimatedWaitMinutes: 0,
    lastUpdated: new Date().toISOString(),
  };

  store[venueId] = newVenue;
  return newVenue;
}

export function getAllVenuesState(): Record<string, VenueRealtimeState> {
  return getStore();
}

export function checkInPatient(
  venueId: string,
  patientData: {
    name?: string;
    phone?: string;
    userId?: string;
    gpsVerified?: boolean;
  }
): { venueState: VenueRealtimeState; newPatient: QueuePatient } {
  const state = getVenueState(venueId);

  global.__nextTicketNumber = (global.__nextTicketNumber || 105) + 1;
  const ticketNumber = global.__nextTicketNumber;

  const now = new Date();
  const checkinTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newPatient: QueuePatient = {
    id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ticketNumber,
    name: patientData.name || `Patient #${ticketNumber}`,
    phone: patientData.phone || '+91 Client',
    checkinTime,
    gpsVerified: patientData.gpsVerified ?? true,
    userId: patientData.userId,
    status: 'waiting',
    position: state.queueList.length + 1,
    estimatedWaitMinutes: (state.queueList.length + 1) * state.avgServiceTimeMinutes,
  };

  state.queueList.push(newPatient);
  recalculatePositions(state);

  broadcastRealtimeEvent({
    type: 'CHECK_IN',
    venueId,
    payload: { venueState: state, newPatient },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, newPatient };
}

export function callNextPatient(venueId: string): {
  venueState: VenueRealtimeState;
  calledPatient: QueuePatient | null;
} {
  const state = getVenueState(venueId);

  let called: QueuePatient | null = null;
  if (state.queueList.length > 0) {
    called = state.queueList.shift()!;
    called.status = 'serving';
    state.servingTicket = called;
  } else {
    state.servingTicket = null;
  }

  recalculatePositions(state);

  broadcastRealtimeEvent({
    type: 'CALL_NEXT',
    venueId,
    payload: { venueState: state, calledPatient: called },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, calledPatient: called };
}

export function completeConsultation(
  venueId: string,
  actualDurationMinutes?: number
): {
  venueState: VenueRealtimeState;
  completedPatient: QueuePatient | null;
} {
  const state = getVenueState(venueId);

  const completed = state.servingTicket;
  if (completed) {
    completed.status = 'completed';
    state.totalServed += 1;

    // Dynamically adjust average service time with smoothing
    const duration = actualDurationMinutes || state.avgServiceTimeMinutes;
    const total = state.totalServed;
    const smoothed = Math.round(((state.avgServiceTimeMinutes * (total - 1) + duration) / total) * 10) / 10;
    state.avgServiceTimeMinutes = Math.max(1, smoothed);
  }

  // Auto-call the next patient in line
  let nextPatient: QueuePatient | null = null;
  if (state.queueList.length > 0) {
    nextPatient = state.queueList.shift()!;
    nextPatient.status = 'serving';
    state.servingTicket = nextPatient;
  } else {
    state.servingTicket = null;
  }

  recalculatePositions(state);

  broadcastRealtimeEvent({
    type: 'COMPLETE',
    venueId,
    payload: { venueState: state, completedPatient: completed, nextPatient },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, completedPatient: completed };
}

export function cancelPatientSpot(
  venueId: string,
  patientIdOrUserId: string
): {
  venueState: VenueRealtimeState;
  cancelledPatient: QueuePatient | null;
} {
  const state = getVenueState(venueId);

  const index = state.queueList.findIndex(
    (pt) => pt.id === patientIdOrUserId || pt.userId === patientIdOrUserId
  );

  let cancelled: QueuePatient | null = null;
  if (index !== -1) {
    cancelled = state.queueList.splice(index, 1)[0];
    cancelled.status = 'cancelled';
  } else if (state.servingTicket && (state.servingTicket.id === patientIdOrUserId || state.servingTicket.userId === patientIdOrUserId)) {
    cancelled = state.servingTicket;
    state.servingTicket = null;
  }

  recalculatePositions(state);

  broadcastRealtimeEvent({
    type: 'CANCEL',
    venueId,
    payload: { venueState: state, cancelledPatient: cancelled },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, cancelledPatient: cancelled };
}

export function resetVenueQueue(venueId: string): VenueRealtimeState {
  const state = getVenueState(venueId);
  state.queueList = [];
  state.servingTicket = null;
  recalculatePositions(state);

  broadcastRealtimeEvent({
    type: 'RESET',
    venueId,
    payload: { venueState: state },
    timestamp: new Date().toISOString(),
  });

  return state;
}

export function upsertVenueRegistration(venue: {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  avg_service_time_minutes: number;
}): VenueRealtimeState {
  const store = getStore();
  const existing = store[venue.id];

  const state: VenueRealtimeState = {
    venueId: venue.id,
    name: venue.name,
    category: venue.category,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    geofenceRadiusM: venue.geofence_radius_m,
    avgServiceTimeMinutes: venue.avg_service_time_minutes,
    queueList: existing ? existing.queueList : [],
    servingTicket: existing ? existing.servingTicket : null,
    totalServed: existing ? existing.totalServed : 0,
    currentQueueLength: existing ? existing.currentQueueLength : 0,
    estimatedWaitMinutes: existing ? existing.estimatedWaitMinutes : 0,
    lastUpdated: new Date().toISOString(),
  };

  store[venue.id] = state;
  recalculatePositions(state);
  saveStoreToFile(store);

  broadcastRealtimeEvent({
    type: 'VENUE_UPDATE',
    venueId: venue.id,
    payload: { venueState: state },
    timestamp: new Date().toISOString(),
  });

  return state;
}
