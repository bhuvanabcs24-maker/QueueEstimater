'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, QrCode, Play, CheckCircle2, RefreshCw, Stethoscope, ShieldCheck } from 'lucide-react';
import { getVenueById, Venue, recordUserServed } from '@/lib/venueStore';

interface PatientInQueue {
  id: string;
  ticketNumber: number;
  name: string;
  phone: string;
  checkinTime: string;
  gpsVerified: boolean;
}

export default function AdminDashboardPage({ params }: { params: { locationId: string } }) {
  const { locationId } = params;
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);

  const [queueList, setQueueList] = useState<PatientInQueue[]>([
    { id: 'p1', ticketNumber: 101, name: 'Rahul Sharma', phone: '+91 98765 43210', checkinTime: '10:14 AM', gpsVerified: true },
    { id: 'p2', ticketNumber: 102, name: 'Priya Patel', phone: '+91 98123 45678', checkinTime: '10:18 AM', gpsVerified: true },
    { id: 'p3', ticketNumber: 103, name: 'Amit Kumar', phone: '+91 99887 76655', checkinTime: '10:22 AM', gpsVerified: true },
    { id: 'p4', ticketNumber: 104, name: 'Ananya Roy', phone: '+91 97654 32109', checkinTime: '10:25 AM', gpsVerified: true },
  ]);

  const [servingTicket, setServingTicket] = useState<PatientInQueue | null>({
    id: 'p0',
    ticketNumber: 100,
    name: 'Suresh Verma',
    phone: '+91 98989 89898',
    checkinTime: '10:05 AM',
    gpsVerified: true,
  });

  const [totalServed, setTotalServed] = useState(12);

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

  const handleCallNextPatient = () => {
    if (queueList.length > 0) {
      const nextPatient = queueList[0];
      setServingTicket(nextPatient);
      setQueueList(queueList.slice(1));
    } else {
      setServingTicket(null);
    }
  };

  const handleCompleteConsultation = () => {
    if (servingTicket) {
      setTotalServed((prev) => prev + 1);
      // Record service completion to recalculate wait times dynamically
      recordUserServed(locationId, venue?.avg_service_time_minutes || 8);
      handleCallNextPatient();
    }
  };

  const handleResetQueue = () => {
    if (confirm('Are you sure you want to reset the queue counter for today?')) {
      setQueueList([]);
      setServingTicket(null);
    }
  };

  if (!venue) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Loading Doctor Dashboard...</div>;
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Exit Portal
        </Link>
        <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '4px 10px', borderRadius: '9999px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Stethoscope size={14} /> DOCTOR PORTAL
        </span>
      </div>

      {/* Clinic Header */}
      <div className="card glass" style={{ padding: '20px', gap: '8px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{venue.name}</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)' }}>
          {venue.category} • {venue.address}
        </p>
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.8rem', color: '#cbd5e1' }}>
          <span>⏱️ Avg Time: <strong>{venue.avg_service_time_minutes} mins/pt</strong></span>
          <span>✅ Total Served Today: <strong>{totalServed} patients</strong></span>
        </div>
      </div>

      {/* Currently Serving Box */}
      <div className="card glass" style={{ padding: '24px', border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.08)', textAlign: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          🟢 CURRENTLY IN CONSULTATION ROOM
        </span>

        {servingTicket ? (
          <div>
            <div style={{ fontSize: '3.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              #{servingTicket.ticketNumber}
            </div>
            <b style={{ fontSize: '1.1rem', color: '#10b981', display: 'block' }}>{servingTicket.name}</b>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{servingTicket.phone} • Arrived {servingTicket.checkinTime}</span>
          </div>
        ) : (
          <div style={{ fontSize: '1.2rem', color: '#94a3b8', padding: '16px 0' }}>No patient currently in room</div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            onClick={handleCompleteConsultation}
            className="btn btn-primary"
            style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 6px 20px rgba(16, 185, 129, 0.3)' }}
          >
            <CheckCircle2 size={18} /> Complete & Call Next
          </button>
          <button
            onClick={handleCallNextPatient}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '14px' }}
          >
            <Play size={18} /> Skip / Call Next
          </button>
        </div>
      </div>

      {/* Patient Waiting Queue List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={16} color="#6366f1" /> Waiting Patient Queue ({queueList.length})
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#10b981' }}>~{queueList.length * (venue.avg_service_time_minutes || 8)} min total wait</span>
        </div>

        {queueList.length === 0 ? (
          <div className="card glass" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            No patients currently waiting in line.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {queueList.map((pt, idx) => (
              <div
                key={pt.id}
                className="card glass"
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: idx === 0 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.03)',
                  border: idx === 0 ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <b style={{ fontSize: '1rem', color: '#fff' }}>#{pt.ticketNumber}</b>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1' }}>{pt.name}</span>
                    {idx === 0 && <span style={{ fontSize: '0.65rem', background: '#6366f1', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>NEXT IN LINE</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                    {pt.phone} • Checked in at {pt.checkinTime}
                  </div>
                </div>

                <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '9999px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} /> GPS Verified
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Doctor Action Controls */}
      <div className="card glass" style={{ padding: '16px', gap: '12px' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Doctor Management Controls
        </h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href={`/location/${locationId}/qr`} className="btn btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.8rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <QrCode size={16} /> Print QR Poster
          </Link>
          <button onClick={handleResetQueue} className="btn btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <RefreshCw size={16} /> Reset Queue
          </button>
        </div>
      </div>
    </div>
  );
}
