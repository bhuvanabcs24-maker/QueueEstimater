'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  QrCode,
  Play,
  CheckCircle2,
  RefreshCw,
  Stethoscope,
  Bell,
  Activity,
} from 'lucide-react';
import { getVenueById, Venue } from '@/lib/venueStore';
import { useRealtimeQueue } from '@/lib/useRealtimeQueue';

export default function AdminDashboardPage({ params }: { params: { locationId: string } }) {
  const { locationId } = params;
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Connect to live real-time queue stream
  const { venues, connected, lastEvent, dispatchAction } = useRealtimeQueue(locationId);

  const realtimeVenue = venues[locationId];

  useEffect(() => {
    // Check doctor authorization
    const isAuth = sessionStorage.getItem(`doctor_auth_${locationId}`);
    if (!isAuth) {
      router.push('/doctor');
      return;
    }

    const v = getVenueById(locationId);
    setVenue(v);
  }, [locationId, router]);

  // Show notification toast when events occur
  useEffect(() => {
    if (lastEvent && lastEvent.venueId === locationId) {
      if (lastEvent.type === 'CHECK_IN') {
        const pt = lastEvent.payload?.newPatient as { ticketNumber?: number; name?: string } | undefined;
        if (pt) {
          setToastMessage(`New Patient Registered: Token #${pt.ticketNumber} (${pt.name})`);
          const timer = setTimeout(() => setToastMessage(null), 4000);
          return () => clearTimeout(timer);
        }
      } else if (lastEvent.type === 'CANCEL') {
        const pt = lastEvent.payload?.cancelledPatient as { ticketNumber?: number; name?: string } | undefined;
        if (pt) {
          setToastMessage(`Patient Cancelled Token #${pt.ticketNumber}`);
          const timer = setTimeout(() => setToastMessage(null), 3000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [lastEvent, locationId]);

  const queueList = realtimeVenue ? realtimeVenue.queueList : [];
  const servingTicket = realtimeVenue ? realtimeVenue.servingTicket : null;
  const totalServed = realtimeVenue ? realtimeVenue.totalServed : (venue?.total_served || 12);
  const avgServiceMins = realtimeVenue ? realtimeVenue.avgServiceTimeMinutes : (venue?.avg_service_time_minutes || 8);

  const handleCallNextPatient = async () => {
    setActionLoading(true);
    try {
      await dispatchAction('CALL_NEXT', locationId);
    } catch (e) {
      console.error('Call next error:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteConsultation = async () => {
    if (!servingTicket && queueList.length === 0) return;
    setActionLoading(true);
    try {
      await dispatchAction('COMPLETE', locationId, {
        actualDurationMinutes: avgServiceMins,
      });
    } catch (e) {
      console.error('Complete error:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetQueue = async () => {
    if (confirm('Are you sure you want to reset the waiting queue counter for this session?')) {
      setActionLoading(true);
      try {
        await dispatchAction('RESET', locationId);
      } catch (e) {
        console.error('Reset error:', e);
      } finally {
        setActionLoading(false);
      }
    }
  };

  if (!venue) {
    return (
      <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Activity size={32} className="pulse" color="#3b82f6" style={{ margin: '0 auto 12px auto' }} />
          <div>Loading clinical triage workstation...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Top Workstation Header */}
      <header className="app-header">
        <div className="header-container">
          <Link href="/" className="brand-link">
            <ArrowLeft size={18} />
            <span>Exit Workstation</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              {connected ? 'Live Station Sync' : 'Connecting'}
            </span>

            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Stethoscope size={13} />
              Staff Station
            </span>
          </div>
        </div>
      </header>

      {/* Main Workstation Container */}
      <main className="page-container" style={{ maxWidth: '840px' }}>
        {/* Toast Alert */}
        {toastMessage && (
          <div className="alert-banner alert-banner-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={16} />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Facility Info Card */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Assigned Facility
              </span>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                {venue.name}
              </h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {venue.category} • {venue.address}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', backgroundColor: 'var(--bg-surface-elevated)', padding: '10px 16px', borderRadius: 'var(--radius-md)' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Avg Service Time</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{avgServiceMins} min/pt</strong>
              </div>
              <div style={{ width: '1px', backgroundColor: 'var(--border-default)' }} />
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Total Attended</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{totalServed} patients</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Now Serving / Consultation Desk Card */}
        <div
          className="card"
          style={{
            padding: '24px',
            backgroundColor: servingTicket ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-surface)',
            borderColor: servingTicket ? 'var(--status-success-border)' : 'var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: servingTicket ? 'var(--status-success)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Consultation Room Status
            </span>
            {servingTicket && (
              <span className="badge badge-success">Active Session</span>
            )}
          </div>

          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            {servingTicket ? (
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                  Current Patient Token
                </span>
                <div style={{ fontSize: '3.5rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1, margin: '6px 0' }}>
                  #{servingTicket.ticketNumber}
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {servingTicket.name}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {servingTicket.phone} • Arrived at {servingTicket.checkinTime}
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                Consultation room is currently vacant. Click below to call the next patient.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCompleteConsultation}
              className="btn btn-success"
              style={{ flex: 1, padding: '12px' }}
              disabled={actionLoading || (!servingTicket && queueList.length === 0)}
            >
              <CheckCircle2 size={16} />
              <span>{actionLoading ? 'Updating...' : 'Complete & Call Next'}</span>
            </button>

            <button
              onClick={handleCallNextPatient}
              className="btn btn-secondary"
              style={{ flex: 1, padding: '12px' }}
              disabled={actionLoading || queueList.length === 0}
            >
              <Play size={16} />
              <span>{actionLoading ? 'Calling...' : 'Skip / Call Next'}</span>
            </button>
          </div>
        </div>

        {/* Patient Waiting Queue List */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={16} color="#60a5fa" />
              <span>Waiting Patient Queue ({queueList.length})</span>
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Est. Queue Duration: ~{queueList.length * avgServiceMins} mins
            </span>
          </div>

          {queueList.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No patients currently waiting in line. New check-ins will appear here in real time.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {queueList.map((pt, idx) => (
                <div
                  key={pt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: idx === 0 ? 'var(--bg-surface-elevated)' : 'transparent',
                    border: '1px solid',
                    borderColor: idx === 0 ? 'var(--brand-primary-subtle)' : 'var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: idx === 0 ? 'var(--brand-primary)' : 'var(--bg-surface-subtle)',
                        color: idx === 0 ? '#ffffff' : 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                      }}
                    >
                      #{pt.ticketNumber}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                          {pt.name}
                        </span>
                        {idx === 0 && (
                          <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                            Next in Line
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {pt.phone} • Registered at {pt.checkinTime} • Est. wait: ~{pt.estimatedWaitMinutes || (idx + 1) * avgServiceMins}m
                      </div>
                    </div>
                  </div>

                  <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                    {pt.gpsVerified ? 'GPS Verified' : 'QR Scan'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Management Controls Card */}
        <div className="card" style={{ padding: '16px 24px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Station Administration</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Print physical desk posters or reset queue counts.</div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href={`/location/${locationId}/qr`} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem' }}>
              <QrCode size={14} />
              <span>Print QR Poster</span>
            </Link>

            <button
              onClick={handleResetQueue}
              className="btn btn-outline-danger"
              disabled={actionLoading}
              style={{ padding: '8px 14px', fontSize: '0.82rem' }}
            >
              <RefreshCw size={14} />
              <span>Reset Counter</span>
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
