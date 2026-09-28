'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { calculateDistance } from '../../../lib/geofence';
import { getVenueById, syncVenuesFromDatabase } from '@/lib/venueStore';
import {
  ArrowLeft,
  MapPin,
  QrCode,
  Navigation,
  Activity,
} from 'lucide-react';

interface Location {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  avg_service_time_minutes: number;
  current_queue_length?: number;
}

interface LocationEstimate {
  current_queue_length: number;
  avg_wait_minutes: number;
}

export default function LocationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = (params?.id as string) || '';

  const [location, setLocation] = useState<Location | null>(null);
  const [estimate, setEstimate] = useState<LocationEstimate>({ current_queue_length: 0, avg_wait_minutes: 0 });
  const [loading, setLoading] = useState(true);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'denied' | 'error'>('idle');
  const [distanceToLocation, setDistanceToLocation] = useState<number | null>(null);
  const [withinGeofence, setWithinGeofence] = useState(false);

  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingCheckIn, setHasExistingCheckIn] = useState(false);

  const triggerGpsCheck = useCallback((loc: Location) => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const uLat = position.coords.latitude;
        const uLng = position.coords.longitude;
        setUserCoords({ lat: uLat, lng: uLng });
        setGpsStatus('success');

        const dist = calculateDistance(uLat, uLng, loc.lat, loc.lng);
        setDistanceToLocation(dist);
        setWithinGeofence(dist <= loc.geofence_radius_m);
      },
      (geoError) => {
        setGpsStatus(geoError.code === geoError.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const checkAuthAndLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    setHasExistingCheckIn(false);

    const demoPhone = localStorage.getItem('demo_authenticated_phone') || localStorage.getItem('user_phone');
    if (demoPhone) {
      setIsLoggedIn(true);
      const demoCheckIn = localStorage.getItem('demo_active_check_in');
      if (demoCheckIn) {
        try {
          const parsed = JSON.parse(demoCheckIn);
          if (parsed.location_id === locationId) {
            setHasExistingCheckIn(true);
          }
        } catch {
          // Ignore
        }
      }
    } else {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setIsLoggedIn(true);
        }
      } catch {
        // Fallback
      }
    }

    // Load venue details
    try {
      let venue = getVenueById(locationId, userCoords?.lat, userCoords?.lng);
      if (!venue) {
        const dbVenues = await syncVenuesFromDatabase();
        venue = dbVenues.find((v) => v.id === locationId || v.id.toLowerCase() === locationId.toLowerCase()) || null;
      }

      if (!venue) {
        setLocation(null);
        setError('This facility is not registered in the database.');
        setLoading(false);
        return;
      }

      setLocation(venue);

      // Query real-time endpoint for current queue counts
      const rtRes = await fetch(`/api/realtime/events?venueId=${encodeURIComponent(locationId)}`).catch(() => null);
      if (rtRes && rtRes.ok) {
        const rtData = await rtRes.json();
        if (rtData.venue) {
          setEstimate({
            current_queue_length: rtData.venue.currentQueueLength,
            avg_wait_minutes: rtData.venue.estimatedWaitMinutes,
          });
        } else {
          setEstimate({
            current_queue_length: venue.current_queue_length ?? 0,
            avg_wait_minutes: Math.round((venue.current_queue_length ?? 0) * venue.avg_service_time_minutes),
          });
        }
      } else {
        setEstimate({
          current_queue_length: venue.current_queue_length ?? 0,
          avg_wait_minutes: Math.round((venue.current_queue_length ?? 0) * venue.avg_service_time_minutes),
        });
      }

      triggerGpsCheck(venue);
    } catch {
      setError('Unable to load facility details.');
    } finally {
      setLoading(false);
    }
  }, [locationId, triggerGpsCheck, userCoords?.lat, userCoords?.lng]);

  useEffect(() => {
    checkAuthAndLoad();
  }, [checkAuthAndLoad]);

  const handleCheckIn = async () => {
    if (!isLoggedIn) {
      router.push(`/login`);
      return;
    }

    if (!location) return;

    setSubmittingCheckIn(true);
    setError('');

    try {
      const isGpsSuccess = gpsStatus === 'success';
      const gpsVerified = isGpsSuccess && withinGeofence;

      if (isGpsSuccess && !withinGeofence) {
        throw new Error(
          `Geofence verification failed. You are ${Math.round(distanceToLocation || 0)}m away, but must be within ${location.geofence_radius_m}m.`
        );
      }

      let token = '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || '';
      } catch {
        // Fallback
      }

      const clientName =
        (typeof window !== 'undefined' &&
          (localStorage.getItem('demo_authenticated_name') || localStorage.getItem('user_name'))) ||
        'Patient Walk-In';
      const clientPhone =
        (typeof window !== 'undefined' &&
          (localStorage.getItem('demo_authenticated_phone') || localStorage.getItem('user_phone'))) ||
        '+91 Client';

      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          location_id: location.id,
          user_name: clientName,
          phone: clientPhone,
          lat: userCoords?.lat ?? null,
          lng: userCoords?.lng ?? null,
          gps_bypass: gpsStatus === 'denied' || gpsStatus === 'error',
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setHasExistingCheckIn(true);
        }
        throw new Error(resData.error || 'Check-in request was rejected.');
      }

      const activeTicket = {
        id: resData.event_id || `pt_${Date.now()}`,
        ticket_number: resData.ticket_number,
        location_id: location.id,
        location_name: location.name,
        created_at: new Date().toISOString(),
        gps_verified: resData.gps_verified ?? gpsVerified,
        position: resData.position || 1,
        avg_wait_minutes: resData.estimated_wait_minutes || location.avg_service_time_minutes,
        status: 'waiting',
      };

      localStorage.setItem('demo_active_check_in', JSON.stringify(activeTicket));
      router.push('/my-queue');
    } catch (err: unknown) {
      console.error('Check-in error:', err);
      const message = err instanceof Error ? err.message : 'Check-in failed. Please try again.';
      setError(message);
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Activity size={32} className="pulse" color="#3b82f6" style={{ margin: '0 auto 12px auto' }} />
          <div>Loading department information...</div>
        </div>
      </div>
    );
  }

  if (!location) {
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
          <div className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '36px 24px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Facility Not Found</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px' }}>
              The requested facility code does not match any active outpatient location.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <Link href="/" className="btn btn-secondary" style={{ flex: 1 }}>
                Directory
              </Link>
              <Link href="/scan" className="btn btn-primary" style={{ flex: 1 }}>
                Scan Code
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const isGpsRestricted = gpsStatus === 'success' && !withinGeofence;
  const isGpsLoading = gpsStatus === 'loading';

  let ctaText = 'Check In to Waiting Line';
  if (!isLoggedIn) ctaText = 'Sign In to Check In';
  else if (hasExistingCheckIn) ctaText = 'View Active Ticket in My Queue';
  else if (submittingCheckIn) ctaText = 'Registering Check-In...';
  else if (isGpsLoading) ctaText = 'Verifying Location...';
  else if (isGpsRestricted) ctaText = 'Outside Verification Perimeter';

  return (
    <>
      <header className="app-header">
        <div className="header-container">
          <Link href="/" className="brand-link">
            <ArrowLeft size={18} />
            <span>Facility Directory</span>
          </Link>
          <span className="badge badge-neutral">{location.category}</span>
        </div>
      </header>

      <main className="page-container" style={{ maxWidth: '640px' }}>
        {/* Facility Header Card */}
        <div className="card" style={{ padding: '24px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Service Department
            </span>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              {location.name}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              <MapPin size={14} color="#64748b" />
              <span>{location.address}</span>
            </p>
          </div>

          {/* Wait Time Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', backgroundColor: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Estimated Wait</span>
              <strong style={{ fontSize: '1.35rem', color: 'var(--text-primary)' }}>
                ~{estimate.avg_wait_minutes} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>min</span>
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Waiting Patients</span>
              <strong style={{ fontSize: '1.35rem', color: 'var(--text-primary)' }}>
                {estimate.current_queue_length}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Avg Service Rate</span>
              <strong style={{ fontSize: '1.35rem', color: 'var(--text-primary)' }}>
                {location.avg_service_time_minutes} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>m/pt</span>
              </strong>
            </div>
          </div>
        </div>

        {/* Physical Geofence Verification Status */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Navigation size={15} color="#3b82f6" />
              <span>Perimeter Verification</span>
            </span>

            {gpsStatus === 'success' && (
              <span className={`badge ${withinGeofence ? 'badge-success' : 'badge-danger'}`}>
                {withinGeofence ? 'Within Perimeter' : 'Outside Boundary'}
              </span>
            )}
          </div>

          {gpsStatus === 'loading' && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Acquiring high-accuracy location reading...
            </div>
          )}

          {gpsStatus === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Distance to Clinic:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{Math.round(distanceToLocation || 0)} meters</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Allowed Radius:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{location.geofence_radius_m} meters</strong>
              </div>

              <div style={{ fontSize: '0.78rem', color: withinGeofence ? 'var(--status-success)' : 'var(--status-danger)', marginTop: '4px' }}>
                {withinGeofence
                  ? 'Physical presence verified. You are eligible to register in the queue.'
                  : `You are ${Math.round((distanceToLocation || 0) - location.geofence_radius_m)}m outside the check-in boundary.`}
              </div>
            </div>
          )}

          {(gpsStatus === 'denied' || gpsStatus === 'error') && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Location permissions unavailable. QR scan confirmation will be used to authorize check-in.
            </div>
          )}
        </div>

        {error && (
          <div className="alert-banner alert-banner-error">
            <span>{error}</span>
          </div>
        )}

        {hasExistingCheckIn && (
          <div className="alert-banner alert-banner-info">
            <span>You already have an active check-in ticket at this location.</span>
          </div>
        )}

        {/* Check In Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {hasExistingCheckIn ? (
            <Link href="/my-queue" className="btn btn-primary" style={{ padding: '13px' }}>
              <span>View My Active Ticket</span>
            </Link>
          ) : (
            <button
              onClick={handleCheckIn}
              className="btn btn-primary"
              style={{ padding: '13px' }}
              disabled={submittingCheckIn || isGpsLoading || (isLoggedIn && isGpsRestricted)}
            >
              <span>{ctaText}</span>
            </button>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/" className="btn btn-secondary" style={{ flex: 1 }}>
              Back to Directory
            </Link>
            <Link href={`/location/${locationId}/qr`} className="btn btn-secondary" style={{ flex: 1 }}>
              <QrCode size={14} />
              <span>Desk QR Poster</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
