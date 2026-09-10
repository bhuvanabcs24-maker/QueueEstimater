'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

interface ActiveCheckIn {
  id: string;
  location_id: string;
  location_name: string;
  created_at: string;
  gps_verified: boolean;
  position: number;
  avg_wait_minutes: number;
}

export default function MyQueuePage() {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState<ActiveCheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  const refreshQueueStatus = useCallback(async (currentCheckIn?: ActiveCheckIn | null) => {
    const active = currentCheckIn || checkIn;
    if (!active) return;

    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
      !process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (isPlaceholder || active.id.startsWith('demo-')) {
      setSecondsSinceUpdate(0);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Query latest events per user at this location to count active users ahead
      const { data: eventsData, error: eventsError } = await supabase
        .from('queue_events')
        .select('user_id, event_type, created_at')
        .eq('location_id', active.location_id)
        .order('created_at', { ascending: true });

      if (eventsError || !eventsData) return;

      // Determine active users and their check-in times
      const userLatestEvent = new Map<string, { event_type: string; checkin_time: string }>();
      for (const ev of eventsData) {
        if (ev.event_type === 'check_in') {
          userLatestEvent.set(ev.user_id, { event_type: 'check_in', checkin_time: ev.created_at });
        } else {
          userLatestEvent.set(ev.user_id, { event_type: ev.event_type, checkin_time: '' });
        }
      }

      // Count active users checked in prior to our check-in
      let peopleAhead = 0;
      userLatestEvent.forEach((val, uid) => {
        if (uid !== session.user.id && val.event_type === 'check_in' && val.checkin_time < active.created_at) {
          peopleAhead++;
        }
      });

      const newPosition = peopleAhead + 1;

      // Fetch location average service time
      const { data: locData } = await supabase
        .from('locations')
        .select('avg_service_time_minutes')
        .eq('id', active.location_id)
        .single();

      const serviceTime = locData?.avg_service_time_minutes || 10;

      setCheckIn((prev) => prev ? {
        ...prev,
        position: newPosition,
        avg_wait_minutes: newPosition * serviceTime
      } : null);

      setSecondsSinceUpdate(0);
    } catch (err) {
      console.warn('Silent refresh error:', err);
    }
  }, [checkIn]);

  const loadActiveQueue = useCallback(async () => {
    setLoading(true);
    setActionError('');
    setSecondsSinceUpdate(0);

    // 1. Check local storage first (Demo / simulation mode)
    const demoCheckIn = localStorage.getItem('demo_active_check_in');
    if (demoCheckIn) {
      try {
        const parsed = JSON.parse(demoCheckIn);
        setCheckIn(parsed);
        setLoading(false);
        return;
      } catch {
        localStorage.removeItem('demo_active_check_in');
      }
    }

    // 2. Fetch session and query active queue from Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('queue_events')
        .select('id, location_id, event_type, created_at, gps_verified, locations(name, avg_service_time_minutes)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0 && data[0].event_type === 'check_in') {
        const event = data[0];
        const loc = event.locations as unknown as { name: string; avg_service_time_minutes: number } | null;
        const avgServiceTime = loc?.avg_service_time_minutes || 10;

        const loadedCheckIn: ActiveCheckIn = {
          id: event.id,
          location_id: event.location_id,
          location_name: loc?.name || 'Clinic Queue',
          created_at: event.created_at,
          gps_verified: event.gps_verified || false,
          position: 1, // Will be updated by refreshQueueStatus
          avg_wait_minutes: avgServiceTime
        };

        setCheckIn(loadedCheckIn);
        refreshQueueStatus(loadedCheckIn);
      } else {
        setCheckIn(null);
      }
    } catch (err) {
      console.warn('Error loading active queue:', err);
      setCheckIn(null);
    } finally {
      setLoading(false);
    }
  }, [router, refreshQueueStatus]);

  useEffect(() => {
    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
      !process.env.NEXT_PUBLIC_SUPABASE_URL;
    setIsDemoMode(isPlaceholder);

    loadActiveQueue();

    // 20-second polling refresh for wait times
    const refreshInterval = setInterval(() => {
      refreshQueueStatus();
    }, 20000);

    // Visual timer for "Last updated X seconds ago"
    const timerInterval = setInterval(() => {
      setSecondsSinceUpdate((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(timerInterval);
    };
  }, [loadActiveQueue, refreshQueueStatus]);

  const handleQueueAction = async (actionType: 'check_out' | 'cancel') => {
    if (!checkIn) return;

    setSubmittingAction(true);
    setActionError('');

    try {
      const isPlaceholder = 
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
        !process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (isPlaceholder || checkIn.id.startsWith('demo-')) {
        // Simulation action cleanup
        setTimeout(() => {
          localStorage.removeItem('demo_active_check_in');
          setCheckIn(null);
          setSubmittingAction(false);
          setShowCancelConfirm(false);
          router.push('/');
        }, 600);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Your session expired. Please log in again.');
      }

      // Call secure API Route with auth token
      const endpoint = actionType === 'check_out' ? '/api/checkout' : '/api/cancel';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          queue_event_id: checkIn.id,
          location_id: checkIn.location_id,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || `Failed to perform ${actionType === 'check_out' ? 'checkout' : 'cancellation'}.`);
      }

      setCheckIn(null);
      setShowCancelConfirm(false);
      router.push('/');
    } catch (err: unknown) {
      console.error(`Error performing ${actionType}:`, err);
      const message = err instanceof Error ? err.message : 'Action failed. Please try again.';
      setActionError(message);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Demo simulation to advance queue
  const simulateQueueAdvance = () => {
    if (!checkIn) return;

    if (checkIn.position <= 1) {
      handleQueueAction('check_out');
    } else {
      const newPos = checkIn.position - 1;
      const updatedCheckIn = {
        ...checkIn,
        position: newPos,
        avg_wait_minutes: newPos * 10
      };
      localStorage.setItem('demo_active_check_in', JSON.stringify(updatedCheckIn));
      setCheckIn(updatedCheckIn);
      setSecondsSinceUpdate(0);
    }
  };

  if (loading) {
    return (
      <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="skeleton" style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '16px' }} />
        <div className="skeleton" style={{ width: '220px', height: '24px', marginBottom: '8px' }} />
        <div className="skeleton" style={{ width: '100px', height: '16px' }} />
      </div>
    );
  }

  if (!checkIn) {
    return (
      <>
        <header className="app-header glass">
          <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
            <div className="brand-icon">⏳</div>
            <span>QWait</span>
          </Link>
        </header>
        <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>📭</div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800 }}>No Active Check-In</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px', maxWidth: '280px', lineHeight: '1.4' }}>
            You are not currently in any waiting line. Search for a clinic or scan a location QR code to check in.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px', width: '100%', maxWidth: '280px' }}>
            <Link href="/scan" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              📷 Scan QR Code
            </Link>
            <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              Browse Available Facilities
            </Link>
          </div>
        </div>
      </>
    );
  }

  const isNextInLine = checkIn.position === 1;

  return (
    <>
      {/* Header */}
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">⏳</div>
          <span>QWait</span>
        </Link>
        <span className="badge badge-success">Live Track</span>
      </header>

      {/* Main Content */}
      <div className="app-content">
        {actionError && (
          <div className="notification-banner notification-banner-error">
            <span>{actionError}</span>
            <button 
              onClick={() => setActionError('')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', minHeight: 'auto', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent)', border: '1px solid rgba(16,185,129,0.25)', marginBottom: '8px' }}>
            {checkIn.gps_verified ? '🛡️ GPS & QR Verified' : '⚠️ QR Scan Check-In'}
          </span>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>{checkIn.location_name}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '4px' }}>
            Checked in at {new Date(checkIn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Live Wait Countdown Hero */}
        <div className="card glass estimate-display">
          {isNextInLine ? (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🔔</div>
              <span className="badge badge-success" style={{ fontSize: '0.9rem', padding: '6px 14px', marginBottom: '8px' }}>
                🎉 You are Next in Line!
              </span>
              <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600, marginTop: '8px' }}>
                Please proceed towards the check-in desk or triage room.
              </p>
            </div>
          ) : (
            <>
              <span className="form-label" style={{ fontSize: '0.8rem' }}>Estimated Remaining Wait</span>
              <div className="estimate-number">
                {checkIn.avg_wait_minutes}
                <span className="estimate-unit" style={{ display: 'block', fontSize: '1rem', marginTop: '4px' }}>minutes</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="badge badge-warning" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                  👤 Position in Line: #{checkIn.position}
                </span>
              </div>
            </>
          )}

          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '16px' }}>
            Live status refreshes automatically (updated {secondsSinceUpdate}s ago)
          </p>
        </div>

        {/* Queue Management Actions */}
        <div className="card glass" style={{ gap: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Queue Status Controls</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-8px', lineHeight: '1.35' }}>
            Update your status when called so the wait times stay accurate for people behind you.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <button
              id="served-btn"
              onClick={() => handleQueueAction('check_out')}
              className="btn btn-primary"
              disabled={submittingAction}
            >
              {submittingAction ? 'Updating...' : "✅ I've Been Served (Check Out)"}
            </button>
            <button
              id="cancel-btn"
              onClick={() => setShowCancelConfirm(true)}
              className="btn btn-outline-danger"
              disabled={submittingAction}
            >
              🛑 Leave Queue (Cancel Spot)
            </button>
          </div>
        </div>

        {/* Demo Simulation Controls for Examiner Testing */}
        {isDemoMode && (
          <div className="card glass" style={{ border: '1px dashed var(--warning)', background: 'rgba(251, 191, 36, 0.03)', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--warning)' }}>
                🧪 Academic Viva Sandbox
              </h3>
              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Demo Feature</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
              Test how the live tracker reacts when the queue progresses without needing multiple physical devices.
            </p>
            <button
              id="simulate-advance-btn"
              onClick={simulateQueueAdvance}
              className="btn btn-secondary"
              style={{ 
                padding: '8px 12px', 
                fontSize: '0.8rem', 
                border: '1px solid rgba(251, 191, 36, 0.4)', 
                color: 'var(--warning)', 
                background: 'rgba(251, 191, 36, 0.08)' 
              }}
            >
              ⏩ Advance Queue (Move 1 spot forward)
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Leaving Queue */}
      {showCancelConfirm && (
        <div className="modal-backdrop" onClick={() => setShowCancelConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Leave Queue?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.4' }}>
              Are you sure you want to cancel your position? You will lose spot #{checkIn.position} and will need to re-scan to join again.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowCancelConfirm(false)}
                disabled={submittingAction}
              >
                Keep Spot
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={() => handleQueueAction('cancel')}
                disabled={submittingAction}
              >
                {submittingAction ? 'Leaving...' : 'Yes, Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
