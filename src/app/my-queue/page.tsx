'use client';

import React, { useState, useEffect } from 'react';
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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  useEffect(() => {
    const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;
    setIsDemoMode(isPlaceholder);

    loadActiveQueue();

    // Set up a 20-second polling refresh for wait times
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
  }, []);

  const loadActiveQueue = async () => {
    setLoading(true);
    setSecondsSinceUpdate(0);

    const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;

    // 1. Check local storage first (Demo auth / simulation mode)
    const demoCheckIn = localStorage.getItem('demo_active_check_in');
    if (demoCheckIn) {
      setCheckIn(JSON.parse(demoCheckIn));
      setLoading(false);
      return;
    }

    // 2. Fetch session and query active queue from Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // Not logged in, redirect to home
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('queue_events')
        .select('*, locations(name, avg_service_time_minutes)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0 && data[0].event_type === 'check_in') {
        const event = data[0];
        
        // Count how many people are ahead of us who checked in BEFORE us at this location
        const { count } = await supabase
          .from('queue_events')
          .select('id', { count: 'exact', head: true })
          .eq('location_id', event.location_id)
          .eq('event_type', 'check_in')
          .lt('created_at', event.created_at);

        // Fetch how many checks out/cancels happened for people before us to get net position
        // For simplicity in pilot, position = people ahead who haven't checked out yet.
        // We will retrieve estimates or run count.
        const position = (count || 0) + 1;
        const avgServiceTime = event.locations?.avg_service_time_minutes || 10;

        setCheckIn({
          id: event.id,
          location_id: event.location_id,
          location_name: event.locations?.name || 'Clinic Queue',
          created_at: event.created_at,
          gps_verified: event.gps_verified || false,
          position: position,
          avg_wait_minutes: position * avgServiceTime
        });
      } else {
        setCheckIn(null);
      }
    } catch (err) {
      console.error('Error loading active queue, using demo mock:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshQueueStatus = async () => {
    const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (isPlaceholder) {
      // Mock refresh does not change position unless advanced manually in simulation
      setSecondsSinceUpdate(0);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !checkIn) return;

      const { count } = await supabase
        .from('queue_events')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', checkIn.location_id)
        .eq('event_type', 'check_in')
        .lt('created_at', checkIn.created_at);

      const position = (count || 0) + 1;
      
      // Get location details
      const { data: locData } = await supabase
        .from('locations')
        .select('avg_service_time_minutes')
        .eq('id', checkIn.location_id)
        .single();

      const avgServiceTime = locData?.avg_service_time_minutes || 10;

      setCheckIn((prev) => prev ? {
        ...prev,
        position: position,
        avg_wait_minutes: position * avgServiceTime
      } : null);
      
      setSecondsSinceUpdate(0);
    } catch (err) {
      console.warn('Silent refresh failed:', err);
    }
  };

  const handleQueueAction = async (actionType: 'check_out' | 'cancel') => {
    if (!checkIn) return;

    setSubmittingAction(true);
    try {
      const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (isPlaceholder || checkIn.id.startsWith('demo-')) {
        // Simulation action cleanup
        setTimeout(() => {
          localStorage.removeItem('demo_active_check_in');
          setCheckIn(null);
          setSubmittingAction(false);
          router.push('/');
        }, 800);
        return;
      }

      // Call API Route
      const endpoint = actionType === 'check_out' ? '/api/checkout' : '/api/cancel';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queue_event_id: checkIn.id,
          location_id: checkIn.location_id,
        }),
      });

      if (!response.ok) {
        throw new Error('Action failed on server');
      }

      setCheckIn(null);
      router.push('/');
    } catch (err) {
      console.error(`Error performing ${actionType}:`, err);
      alert(`Action failed. Please try again.`);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Simulation controls to advance queue for demo testing
  const simulateQueueAdvance = () => {
    if (!checkIn) return;

    if (checkIn.position <= 1) {
      // Served!
      alert('🎉 You have reached the front of the queue! Checking out...');
      handleQueueAction('check_out');
    } else {
      const newPos = checkIn.position - 1;
      const updatedCheckIn = {
        ...checkIn,
        position: newPos,
        avg_wait_minutes: newPos * 10 // Simulating 10 mins service time
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
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📭</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>No Active Check-In</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px', maxWidth: '280px', lineHeight: '1.4' }}>
            You are not checked in to any active queue. Scan a clinic QR code to get started.
          </p>
          <Link href="/" className="btn btn-primary" style={{ marginTop: '24px', width: 'auto' }}>
            Go to Home Screen
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">⏳</div>
          <span>My Active Queue</span>
        </Link>
        <span className="badge badge-success">Live Track</span>
      </header>

      {/* Main Content */}
      <div className="app-content">
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: '8px' }}>
            {checkIn.gps_verified ? '🛡️ GPS & QR Verified' : '⚠️ QR Only Check-In'}
          </span>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>{checkIn.location_name}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>
            Checked in at {new Date(checkIn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Live Wait Countdown Hero */}
        <div className="card glass estimate-display">
          <span className="form-label" style={{ fontSize: '0.8rem' }}>Estimated Remaining Wait</span>
          <div className="estimate-number">
            {checkIn.avg_wait_minutes}
            <span className="estimate-unit" style={{ display: 'block', fontSize: '1rem', marginTop: '4px' }}>minutes</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-warning" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
              👤 Queue Position: #{checkIn.position}
            </span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '16px' }}>
            Autoupdating in background every 20 seconds. (Updated {secondsSinceUpdate}s ago)
          </p>
        </div>

        {/* Action Options */}
        <div className="card glass" style={{ gap: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700' }}>Queue Management</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-8px', lineHeight: '1.3' }}>
            Please update your status so others behind you get an accurate wait estimate.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <button
              id="served-btn"
              onClick={() => handleQueueAction('check_out')}
              className="btn btn-primary"
              disabled={submittingAction}
            >
              ✅ I've Been Served (Check Out)
            </button>
            <button
              id="cancel-btn"
              onClick={() => handleQueueAction('cancel')}
              className="btn btn-secondary"
              style={{ color: 'var(--danger)', borderColor: 'rgba(248, 113, 113, 0.2)' }}
              disabled={submittingAction}
            >
              🛑 Leave Queue (Cancel Check-In)
            </button>
          </div>
        </div>

        {/* Simulation Sandbox Control for Pilot Review */}
        {isDemoMode && (
          <div className="card glass" style={{ border: '1px dashed var(--warning)', background: 'rgba(251, 191, 36, 0.03)', gap: '8px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--warning)' }}>🛠️ Clinic Pilot Sandbox Controls</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
              Simulate the queue progressing without leaving your seat. Tapping below will serve the person in front of you.
            </p>
            <button
              id="simulate-advance-btn"
              onClick={simulateQueueAdvance}
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.8rem', width: 'auto', border: '1px solid var(--warning)', color: 'var(--warning)', background: 'rgba(251, 191, 36, 0.05)' }}
            >
              👤 Advance Queue (Move position forward)
            </button>
          </div>
        )}
      </div>
    </>
  );
}
