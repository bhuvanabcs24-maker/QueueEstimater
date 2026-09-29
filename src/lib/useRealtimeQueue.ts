'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { VenueRealtimeState, RealtimeEvent } from './realtimeStore';
import { audioAlert } from './audioAlert';

export function useRealtimeQueue(targetVenueId?: string) {
  const [venues, setVenues] = useState<Record<string, VenueRealtimeState>>({});
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const prevPositionRef = useRef<number | null>(null);
  const prevServingRef = useRef<boolean>(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Initial fetch from REST API
  const fetchCurrentState = useCallback(async () => {
    try {
      const url = targetVenueId
        ? `/api/realtime/events?venueId=${encodeURIComponent(targetVenueId)}`
        : '/api/realtime/events';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.venues) {
          setVenues(data.venues);
        } else if (data.venue) {
          setVenues((prev) => ({ ...prev, [data.venue.venueId]: data.venue }));
        }
      }
    } catch (e) {
      console.warn('Initial realtime state fetch notice:', e);
    }
  }, [targetVenueId]);

  // Handle incoming real-time event
  const processRealtimeEvent = useCallback((event: RealtimeEvent) => {
    setLastEvent(event);

    const payload = event.payload as {
      venues?: Record<string, VenueRealtimeState>;
      venueState?: VenueRealtimeState;
      completedPatient?: { id?: string };
      cancelledPatient?: { id?: string };
    } | undefined;

    if (event.type === 'INIT' && payload?.venues) {
      setVenues(payload.venues);
      return;
    }

    if (event.venueId && payload?.venueState) {
      setVenues((prev) => ({
        ...prev,
        [event.venueId!]: payload.venueState!,
      }));
    }

    // Check if the current user has an active check-in in local storage
    if (typeof window !== 'undefined') {
      try {
        const storedCheckin = localStorage.getItem('demo_active_check_in');
        if (storedCheckin) {
          const activeCheckin = JSON.parse(storedCheckin);

          if (event.venueId === activeCheckin.location_id) {
            const vState = payload?.venueState;
            if (vState) {
              // 1. Is user in the active queue?
              const foundInQueue = vState.queueList.find(
                (p) => p.id === activeCheckin.id || p.phone === activeCheckin.phone
              );

              // 2. Is user currently in the consultation room?
              const isServing =
                vState.servingTicket &&
                (vState.servingTicket.id === activeCheckin.id ||
                  vState.servingTicket.phone === activeCheckin.phone);

              if (isServing) {
                if (!prevServingRef.current) {
                  audioAlert.playCalledRoomChime();
                  prevServingRef.current = true;
                }
                const updated = {
                  ...activeCheckin,
                  position: 1,
                  status: 'serving',
                  avg_wait_minutes: 0,
                };
                localStorage.setItem('demo_active_check_in', JSON.stringify(updated));
              } else if (foundInQueue) {
                const newPos = foundInQueue.position || 1;
                if (prevPositionRef.current !== null && newPos < prevPositionRef.current) {
                  audioAlert.playAdvanceChime();
                }
                prevPositionRef.current = newPos;

                const updated = {
                  ...activeCheckin,
                  position: newPos,
                  status: 'waiting',
                  avg_wait_minutes: foundInQueue.estimatedWaitMinutes || newPos * vState.avgServiceTimeMinutes,
                };
                localStorage.setItem('demo_active_check_in', JSON.stringify(updated));
              } else if (event.type === 'COMPLETE' || event.type === 'CANCEL') {
                // If user was completed or cancelled
                if (
                  payload?.completedPatient?.id === activeCheckin.id ||
                  payload?.cancelledPatient?.id === activeCheckin.id
                ) {
                  localStorage.removeItem('demo_active_check_in');
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Process realtime user check error:', err);
      }
    }
  }, []);

  // Connect to SSE stream
  useEffect(() => {
    fetchCurrentState();

    // Setup cross-tab BroadcastChannel for zero-latency local communication
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('qwait_realtime_channel');
        broadcastChannelRef.current = bc;
        bc.onmessage = (msgEv) => {
          if (msgEv.data) {
            processRealtimeEvent(msgEv.data);
          }
        };
      } catch (bcErr) {
        console.warn('BroadcastChannel notice:', bcErr);
      }
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/realtime/stream');

        eventSource.onopen = () => {
          setConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data: RealtimeEvent = JSON.parse(event.data);
            processRealtimeEvent(data);
          } catch {
            // Ignore keepalive or malformed data
          }
        };

        eventSource.onerror = () => {
          setConnected(false);
          eventSource?.close();
          // Exponential backoff reconnect
          const delay = Math.min(10000, 1000 * Math.pow(1.5, reconnectCount));
          reconnectTimeout = setTimeout(() => {
            setReconnectCount((c) => c + 1);
            connectSSE();
          }, delay);
        };
      } catch (err) {
        console.warn('SSE connection error:', err);
        setConnected(false);
      }
    };

    connectSSE();

    // Background heartbeat poll (every 3.5s) to guarantee multi-device sync on serverless platforms
    const pollInterval = setInterval(() => {
      fetchCurrentState();
    }, 3500);

    return () => {
      clearInterval(pollInterval);
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, [fetchCurrentState, processRealtimeEvent, reconnectCount]);

  // Dispatch an action to server & broadcast
  const dispatchAction = useCallback(
    async (
      action: 'CHECK_IN' | 'CALL_NEXT' | 'COMPLETE' | 'CANCEL' | 'RESET' | 'REGISTER_VENUE',
      venueId: string,
      payload?: Record<string, unknown>
    ) => {
      try {
        const res = await fetch('/api/realtime/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, venueId, payload }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.venueState) {
            const eventPayload: RealtimeEvent = {
              type: action,
              venueId,
              payload: data,
              timestamp: new Date().toISOString(),
            };

            processRealtimeEvent(eventPayload);

            // Also broadcast locally across open tabs
            if (broadcastChannelRef.current) {
              try {
                broadcastChannelRef.current.postMessage(eventPayload);
              } catch {
                // Ignore channel post errors
              }
            }
          }
          return data;
        }
      } catch (err) {
        console.error('Dispatch realtime action error:', err);
        throw err;
      }
    },
    [processRealtimeEvent]
  );

  const getVenue = useCallback(
    (venueId: string): VenueRealtimeState | null => {
      return venues[venueId] || null;
    },
    [venues]
  );

  return {
    venues,
    connected,
    lastEvent,
    dispatchAction,
    getVenue,
    refetchState: fetchCurrentState,
  };
}
