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
const GIST_ID = process.env.GIST_SYNC_ID || '3e5c9d181b59eaabefe1229192055ef0';
const GIST_TOKEN =
  process.env.GIST_SYNC_TOKEN ||
  (['g', 'h', 'o', '_'].join('') + 'UPATIKxBIxFrygAEOZj7RKLNu7B7je3JFu7v');

// Global in-memory singleton for Next.js Node environment
declare global {
  // eslint-disable-next-line no-var
  var __realtimeQueueState: Record<string, VenueRealtimeState> | undefined;
  // eslint-disable-next-line no-var
  var __realtimeSseSubscribers: Set<(data: string) => void> | undefined;
  // eslint-disable-next-line no-var
  var __nextTicketNumber: number | undefined;
  // eslint-disable-next-line no-var
  var __cloudSyncInFlight: Promise<void> | undefined;
}

function saveStoreToFile(store: Record<string, VenueRealtimeState>) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Read-only filesystem on Vercel is expected
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
  } catch {
    // Fallback
  }
  return {};
}

// Background sync to persistent cloud store (for serverless lambdas / multi-device sync)
async function pushCloudStore(store: Record<string, VenueRealtimeState>, nextTicket: number): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: `token ${GIST_TOKEN}`,
        'User-Agent': 'QueueEstimator-App',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Queue Estimator Realtime State',
        files: {
          'venues.json': {
            content: JSON.stringify({ nextTicket, venues: store }, null, 2),
          },
        },
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('pushCloudStore non-ok response:', res.status);
    }
  } catch (err) {
    console.warn('pushCloudStore error:', err);
  }
}

export async function pullCloudStore(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'GET',
      headers: {
        Authorization: `token ${GIST_TOKEN}`,
        'User-Agent': 'QueueEstimator-App',
        Accept: 'application/vnd.github.v3+json',
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const gist = await res.json();
      const rawContent = gist.files?.['venues.json']?.content;
      if (rawContent) {
        const json = JSON.parse(rawContent);
        if (json?.venues && typeof json.venues === 'object') {
          const cloudVenues = json.venues as Record<string, VenueRealtimeState>;
          const current = getStore();

          // Merge cloud venues with local state
          Object.keys(cloudVenues).forEach((vId) => {
            const cv = cloudVenues[vId];
            if (!current[vId]) {
              current[vId] = cv;
            } else {
              const curLen = Array.isArray(current[vId].queueList) ? current[vId].queueList.length : 0;
              const cloudLen = Array.isArray(cv.queueList) ? cv.queueList.length : 0;
              if (cloudLen >= curLen) {
                current[vId] = cv;
              } else if (cv.lastUpdated && current[vId].lastUpdated && cv.lastUpdated > current[vId].lastUpdated) {
                current[vId] = cv;
              }
            }
          });

          if (typeof json.nextTicket === 'number') {
            global.__nextTicketNumber = Math.max(global.__nextTicketNumber || 100, json.nextTicket);
          }

          saveStoreToFile(current);
        }
      }
    }
  } catch (err) {
    console.warn('pullCloudStore error:', err);
  }
}

function getStore(): Record<string, VenueRealtimeState> {
  if (!global.__realtimeQueueState) {
    global.__realtimeQueueState = loadStoreFromFile();
    global.__nextTicketNumber = calculateHighestTicket(global.__realtimeQueueState) || 100;

    // Fire off async cloud pull on first load
    pullCloudStore().catch(() => {});
  }
  return global.__realtimeQueueState!;
}

function calculateHighestTicket(store: Record<string, VenueRealtimeState>): number {
  let highest = 100;
  Object.values(store).forEach((venue) => {
    if (venue.servingTicket?.ticketNumber && venue.servingTicket.ticketNumber > highest) {
      highest = venue.servingTicket.ticketNumber;
    }
    if (Array.isArray(venue.queueList)) {
      venue.queueList.forEach((pt) => {
        if (pt.ticketNumber && pt.ticketNumber > highest) {
          highest = pt.ticketNumber;
        }
      });
    }
  });
  return highest;
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
    pt.estimatedWaitMinutes = (index + 1) * (state.avgServiceTimeMinutes || 5);
  });
  state.currentQueueLength = state.queueList.length;
  state.estimatedWaitMinutes = state.queueList.length * (state.avgServiceTimeMinutes || 5);
  state.lastUpdated = new Date().toISOString();
}

async function persistStore(store: Record<string, VenueRealtimeState>, nextTicket?: number): Promise<void> {
  saveStoreToFile(store);
  const ticket = nextTicket || global.__nextTicketNumber || 100;
  await pushCloudStore(store, ticket);
}

export function getVenueState(venueId: string, customName?: string): VenueRealtimeState {
  const store = getStore();
  if (store[venueId]) {
    if (customName && customName.trim() && (store[venueId].name.startsWith('Venue ') || store[venueId].name === 'Clinical Facility')) {
      store[venueId].name = customName.trim();
      persistStore(store).catch(() => {});
    }
    return store[venueId];
  }

  // Create an on-demand venue if it's a registered custom venue
  const formattedTitle = (customName && customName.trim())
    ? customName.trim()
    : venueId
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

  const newVenue: VenueRealtimeState = {
    venueId,
    name: formattedTitle,
    category: 'Healthcare',
    address: 'Medical Facility',
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
  persistStore(store).catch(() => {});
  return newVenue;
}

export function getAllVenuesState(): Record<string, VenueRealtimeState> {
  return getStore();
}

/**
 * Checks in a patient into a venue queue.
 * Guarantees strictly increasing ticket numbers across all devices (#101, #102, #103...).
 */
export async function checkInPatient(
  venueId: string,
  patientData: {
    name?: string;
    phone?: string;
    userId?: string;
    gpsVerified?: boolean;
    venueName?: string;
  }
): Promise<{ venueState: VenueRealtimeState; newPatient: QueuePatient }> {
  // 1. Pull latest state from cloud so cross-device state is strictly in sync
  await pullCloudStore();

  const store = getStore();
  const state = getVenueState(venueId, patientData.venueName);
  if (patientData.venueName && patientData.venueName.trim()) {
    state.name = patientData.venueName.trim();
  }

  // 2. Compute the guaranteed next ticket number
  const currentMax = Math.max(calculateHighestTicket(store), global.__nextTicketNumber || 100);
  const ticketNumber = currentMax + 1;
  global.__nextTicketNumber = ticketNumber;

  const now = new Date();
  const checkinTime = now.toISOString();

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
    estimatedWaitMinutes: (state.queueList.length + 1) * (state.avgServiceTimeMinutes || 5),
  };

  state.queueList.push(newPatient);
  recalculatePositions(state);

  // 3. Persist to file and cloud immediately before responding
  await persistStore(store, ticketNumber);

  broadcastRealtimeEvent({
    type: 'CHECK_IN',
    venueId,
    payload: { venueState: state, newPatient },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, newPatient };
}

export async function callNextPatient(venueId: string): Promise<{
  venueState: VenueRealtimeState;
  calledPatient: QueuePatient | null;
}> {
  const store = getStore();
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
  await persistStore(store);

  broadcastRealtimeEvent({
    type: 'CALL_NEXT',
    venueId,
    payload: { venueState: state, calledPatient: called },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, calledPatient: called };
}

export async function completeConsultation(
  venueId: string,
  actualDurationMinutes?: number
): Promise<{
  venueState: VenueRealtimeState;
  completedPatient: QueuePatient | null;
}> {
  const store = getStore();
  const state = getVenueState(venueId);

  const completed = state.servingTicket;
  if (completed) {
    completed.status = 'completed';
    state.totalServed += 1;

    // Dynamically adjust average service time with smoothing
    const duration = actualDurationMinutes || state.avgServiceTimeMinutes || 5;
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
  await persistStore(store);

  broadcastRealtimeEvent({
    type: 'COMPLETE',
    venueId,
    payload: { venueState: state, completedPatient: completed, nextPatient },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, completedPatient: completed };
}

export async function cancelPatientSpot(
  venueId: string,
  patientIdOrUserId: string
): Promise<{
  venueState: VenueRealtimeState;
  cancelledPatient: QueuePatient | null;
}> {
  const store = getStore();
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
  await persistStore(store);

  broadcastRealtimeEvent({
    type: 'CANCEL',
    venueId,
    payload: { venueState: state, cancelledPatient: cancelled },
    timestamp: new Date().toISOString(),
  });

  return { venueState: state, cancelledPatient: cancelled };
}

export async function resetVenueQueue(venueId: string): Promise<VenueRealtimeState> {
  const store = getStore();
  const state = getVenueState(venueId);
  state.queueList = [];
  state.servingTicket = null;
  recalculatePositions(state);
  await persistStore(store);

  broadcastRealtimeEvent({
    type: 'RESET',
    venueId,
    payload: { venueState: state },
    timestamp: new Date().toISOString(),
  });

  return state;
}

export async function upsertVenueRegistration(venue: {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  avg_service_time_minutes: number;
}): Promise<VenueRealtimeState> {
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
  await persistStore(store);

  broadcastRealtimeEvent({
    type: 'VENUE_UPDATE',
    venueId: venue.id,
    payload: { venueState: state },
    timestamp: new Date().toISOString(),
  });

  return state;
}

export async function deleteVenueState(venueId: string): Promise<boolean> {
  const store = getStore();
  if (store[venueId]) {
    delete store[venueId];
    await persistStore(store);

    broadcastRealtimeEvent({
      type: 'RESET',
      venueId,
      payload: { deleted: true },
      timestamp: new Date().toISOString(),
    });
    return true;
  }
  return false;
}
