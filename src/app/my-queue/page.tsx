'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useRealtimeQueue } from '@/lib/useRealtimeQueue';
import { audioAlert } from '@/lib/audioAlert';
import {
  Ticket,
  Clock,
  User,
  CheckCircle2,
  ArrowLeft,
  Activity,
  ShieldCheck,
} from 'lucide-react';

interface ActiveCheckIn {
  id: string;
  ticket_number?: number;
  location_id: string;
  location_name: string;
  created_at: string;
  gps_verified: boolean;
  position: number;
  avg_wait_minutes: number;
  status?: 'waiting' | 'serving' | 'completed' | 'cancelled';
  phone?: string;
}

export default function MyQueuePage() {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState<ActiveCheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  // Real-Time Queue Hook
  const { venues, connected, dispatchAction, lastEvent } = useRealtimeQueue(checkIn?.location_id);

  const loadActiveQueue = useCallback(async () => {
    setLoading(true);
    setActionError('');
    setSecondsSinceUpdate(0);

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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setCheckIn(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('queue_events')
        .select('id, location_id, event_type, created_at, gps_verified, locations(name, avg_service_time_minutes)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0 && data[0].event_type === 'check_in') {
        const event = data[0];
        const loc = event.locations as unknown as { name: string; avg_service_time_minutes: number } | null;
        const avgServiceTime = loc?.avg_service_time_minutes || 10;

        const loadedCheckIn: ActiveCheckIn = {
          id: event.id,
          location_id: event.location_id,
          location_name: loc?.name || 'Clinic Queue',
          created_at: event.created_at,
          gps_verified: event.gps_verified || false,
          position: 1,
          avg_wait_minutes: avgServiceTime,
          status: 'waiting',
        };

        setCheckIn(loadedCheckIn);
        localStorage.setItem('demo_active_check_in', JSON.stringify(loadedCheckIn));
      } else {
        setCheckIn(null);
      }
    } catch {
      setCheckIn(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveQueue();

    const timerInterval = setInterval(() => {
      setSecondsSinceUpdate((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [loadActiveQueue]);

  // Sync real-time updates from SSE stream
  useEffect(() => {
    if (!checkIn) return;

    const currentVenue = venues[checkIn.location_id];
    if (!currentVenue) return;

    // Check if user is currently being called in the consultation room
    const isServing =
      currentVenue.servingTicket &&
      (currentVenue.servingTicket.id === checkIn.id ||
        (checkIn.ticket_number && currentVenue.servingTicket.ticketNumber === checkIn.ticket_number));

    if (isServing) {
      if (checkIn.status !== 'serving') {
        audioAlert.playCalledRoomChime();
      }
      setCheckIn((prev) =>
        prev
          ? {
              ...prev,
              status: 'serving',
              position: 1,
              avg_wait_minutes: 0,
            }
          : null
      );
      setSecondsSinceUpdate(0);
      return;
    }

    // Check if user is in active waiting queue
    const foundPatient = currentVenue.queueList.find(
      (p) => p.id === checkIn.id || (checkIn.ticket_number && p.ticketNumber === checkIn.ticket_number)
    );

    if (foundPatient) {
      const newPos = foundPatient.position || 1;
      const newWait = foundPatient.estimatedWaitMinutes || newPos * currentVenue.avgServiceTimeMinutes;

      if (checkIn.position !== newPos) {
        if (newPos < checkIn.position) {
          audioAlert.playAdvanceChime();
        }
      }

      setCheckIn((prev) =>
        prev
          ? {
              ...prev,
              position: newPos,
              avg_wait_minutes: newWait,
              status: 'waiting',
            }
          : null
      );
      setSecondsSinceUpdate(0);
    } else if (lastEvent && (lastEvent.type === 'COMPLETE' || lastEvent.type === 'CANCEL')) {
      const p = lastEvent.payload as { completedPatient?: { id?: string } } | undefined;
      if (p?.completedPatient?.id === checkIn.id) {
        localStorage.removeItem('demo_active_check_in');
        setCheckIn(null);
      }
    }
  }, [venues, checkIn, lastEvent]);

  const handleQueueAction = async (actionType: 'check_out' | 'cancel') => {
    if (!checkIn) return;

    setSubmittingAction(true);
    setActionError('');

    try {
      if (actionType === 'check_out') {
        await dispatchAction('COMPLETE', checkIn.location_id, {
          actualDurationMinutes: checkIn.avg_wait_minutes,
        });
      } else {
        await dispatchAction('CANCEL', checkIn.location_id, {
          patientId: checkIn.id,
        });
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const endpoint = actionType === 'check_out' ? '/api/checkout' : '/api/cancel';
          await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              queue_event_id: checkIn.id,
              location_id: checkIn.location_id,
            }),
          });
        }
      } catch {
        // Fallback
      }

      localStorage.removeItem('demo_active_check_in');
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

  if (loading) {
    return (
      <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Activity size={32} className="pulse" color="#3b82f6" style={{ margin: '0 auto 12px auto' }} />
          <div>Retrieving active queue status...</div>
        </div>
      </div>
    );
  }

  if (!checkIn) {
    return (
      <>
        <header className="app-header">
          <div className="header-container">
            <Link href="/" className="brand-link">
              <ArrowLeft size={18} />
              <span>Back to Directory</span>
            </Link>
          </div>
        </header>

        <main className="page-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', color: 'var(--text-muted)' }}>
              <Ticket size={24} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              No Active Queue Ticket
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '4px' }}>
              You are not currently waiting in line. Search for a clinic in the directory or scan an on-site QR poster.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <Link href="/scan" className="btn btn-primary">
                Scan QR Code
              </Link>
              <Link href="/" className="btn btn-secondary">
                Browse Facilities
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const isServingNow = checkIn.status === 'serving';
  const isNextInLine = checkIn.position === 1 && !isServingNow;

  return (
    <>
      {/* Top Header */}
      <header className="app-header">
        <div className="header-container">
          <Link href="/" className="brand-link">
            <ArrowLeft size={18} />
            <span>Facility Directory</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                backgroundColor: connected ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                border: `1px solid ${connected ? 'var(--status-success-border)' : 'var(--status-warning-border)'}`,
                color: connected ? 'var(--status-success)' : 'var(--status-warning)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: connected ? 'var(--status-success)' : 'var(--status-warning)',
                }}
                className={connected ? 'pulse' : ''}
              />
              {connected ? 'Live Sync Active' : 'Connecting'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="page-container" style={{ maxWidth: '640px' }}>
        {actionError && (
          <div className="alert-banner alert-banner-error">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError('')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Digital Queue Pass Card */}
        <div
          className="card"
          style={{
            padding: '28px 24px',
            backgroundColor: isServingNow ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-surface)',
            borderColor: isServingNow ? 'var(--status-success-border)' : 'var(--border-default)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Facility & Time Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Healthcare Facility
              </span>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                {checkIn.location_name}
              </h1>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <Clock size={13} />
                Checked in at {new Date(checkIn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <span className="badge badge-success">
              <ShieldCheck size={12} />
              {checkIn.gps_verified ? 'GPS Verified' : 'QR Checked'}
            </span>
          </div>

          {/* Token Hero Section */}
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {isServingNow ? (
              <div style={{ padding: '12px 0' }}>
                <div style={{ display: 'inline-flex', padding: '10px 18px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)', color: 'var(--status-success)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '12px' }}>
                  ● NOW IN CONSULTATION ROOM
                </div>
                <div style={{ fontSize: '3.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  #{checkIn.ticket_number || checkIn.position}
                </div>
                <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600, marginTop: '12px' }}>
                  Please proceed inside to the consultation desk.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  The medical practitioner is ready to attend to your visit.
                </p>
              </div>
            ) : (
              <div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Assigned Queue Token
                </span>
                <div style={{ fontSize: '3.75rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1, margin: '8px 0' }}>
                  #{checkIn.ticket_number || checkIn.position}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                  <span className={`badge ${isNextInLine ? 'badge-success' : 'badge-warning'}`}>
                    <User size={12} />
                    {isNextInLine ? 'Next Patient in Line' : `Position in Line: #${checkIn.position}`}
                  </span>
                </div>

                <div style={{ marginTop: '20px', padding: '14px', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Estimated Wait</span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      ~{checkIn.avg_wait_minutes} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>mins</span>
                    </strong>
                  </div>
                  <div style={{ width: '1px', height: '32px', backgroundColor: 'var(--border-default)' }} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Patients Ahead</span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      {Math.max(0, checkIn.position - 1)}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Queue Progress Timeline Steps */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>
              Triage Stage Timeline
            </span>

            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 1 }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--status-success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                  ✓
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Check-In</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 1 }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: !isServingNow ? 'var(--brand-primary)' : 'var(--status-success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                  {isServingNow ? '✓' : '2'}
                </div>
                <span style={{ fontSize: '0.72rem', color: !isServingNow ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: !isServingNow ? 600 : 400 }}>Waiting</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 1 }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: isServingNow ? 'var(--status-success)' : 'var(--bg-surface-elevated)', border: `1px solid ${isServingNow ? 'var(--status-success)' : 'var(--border-default)'}`, color: isServingNow ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                  3
                </div>
                <span style={{ fontSize: '0.72rem', color: isServingNow ? 'var(--status-success)' : 'var(--text-muted)', fontWeight: isServingNow ? 600 : 400 }}>Consultation</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="card" style={{ gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Ticket Actions
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Confirm your checkout when finished, or release your spot if you leave.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              onClick={() => handleQueueAction('check_out')}
              className="btn btn-success"
              style={{ flex: 1 }}
              disabled={submittingAction}
            >
              <CheckCircle2 size={16} />
              <span>{submittingAction ? 'Updating...' : 'I Was Served (Check Out)'}</span>
            </button>

            <button
              onClick={() => setShowCancelConfirm(true)}
              className="btn btn-outline-danger"
              style={{ flex: 1 }}
              disabled={submittingAction}
            >
              <span>Cancel Token</span>
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '6px' }}>
            Synchronized with hospital staff station • Updated {secondsSinceUpdate}s ago
          </div>
        </div>
      </main>

      {/* Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="modal-backdrop" onClick={() => setShowCancelConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Cancel Queue Token?
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              You will forfeit your current position (#{checkIn.position}) in the waiting line. If you return later, you will need to register again.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowCancelConfirm(false)}
                disabled={submittingAction}
              >
                Keep Token
              </button>
              <button
                className="btn btn-outline-danger"
                style={{ flex: 1 }}
                onClick={() => handleQueueAction('cancel')}
                disabled={submittingAction}
              >
                {submittingAction ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
