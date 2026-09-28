'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { calculateDistance } from '../../../lib/geofence';
import { getVenueById, syncVenuesFromDatabase, registerNewVenue } from '@/lib/venueStore';
import {
  ArrowLeft,
  MapPin,
  QrCode,
  Navigation,
  Activity,
  PlusCircle,
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

function LocationDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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

    // 1. Check if venue details were passed directly in the QR code URL (Self-Hydrating QR)
    const qName = searchParams.get('name');
    if (qName) {
      const qCategory = searchParams.get('category') || searchParams.get('cat') || 'Healthcare';
      const qAddress = searchParams.get('address') || searchParams.get('addr') || 'Clinic Site';
      const qLat = parseFloat(searchParams.get('lat') || '12.9716');
      const qLng = parseFloat(searchParams.get('lng') || '77.5946');
      const qRadius = parseInt(searchParams.get('radius') || searchParams.get('rad') || '150', 10);
      const qAvg = parseInt(searchParams.get('avg') || searchParams.get('wait') || '5', 10);

      const hydratedVenue: Location = {
        id: locationId,
        name: qName,
        category: qCategory,
        address: qAddress,
        lat: qLat,
        lng: qLng,
        geofence_radius_m: qRadius,
        avg_service_time_minutes: qAvg,
      };

      // Persist to local client store and backend so it stays active
      registerNewVenue(hydratedVenue);
      setLocation(hydratedVenue);
      triggerGpsCheck(hydratedVenue);

      // Query real-time queue
      try {
        const rtRes = await fetch(`/api/realtime/events?venueId=${encodeURIComponent(locationId)}`);
        if (rtRes.ok) {
          const rtData = await rtRes.json();
          if (rtData.venue) {
            setEstimate({
              current_queue_length: rtData.venue.currentQueueLength,
              avg_wait_minutes: rtData.venue.estimatedWaitMinutes,
            });
          }
        }
      } catch {
        // Fallback
      }

      setLoading(false);
      return;
    }

    // 2. Normal lookup via local store or database
    try {
      let venue = getVenueById(locationId, userCoords?.lat, userCoords?.lng);
      if (!venue) {
        const dbVenues = await syncVenuesFromDatabase();
        venue = dbVenues.find((v) => v.id === locationId || v.id.toLowerCase() === locationId.toLowerCase()) || null;
      }

      // 3. Fallback: check /api/venues directly
      if (!venue) {
        try {
          const res = await fetch('/api/venues');
          if (res.ok) {
            const data = await res.json();
            const found = data.venues?.find((v: Location) => v.id === locationId || v.id.toLowerCase() === locationId.toLowerCase());
            if (found) {
              venue = found;
              registerNewVenue(found);
            }
          }
        } catch {
          // Ignore
        }
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
  }, [locationId, triggerGpsCheck, userCoords?.lat, userCoords?.lng, searchParams]);

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
        if (session) token = session.access_token;
      } catch {
        // Fallback
      }

      const storedUser = localStorage.getItem('demo_authenticated_name') || localStorage.getItem('user_name') || 'Guest Patient';
      const storedPhone = localStorage.getItem('demo_authenticated_phone') || localStorage.getItem('user_phone') || '';

      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          location_id: location.id,
          lat: userCoords?.lat,
          lng: userCoords?.lng,
          gps_bypass: !isGpsSuccess,
          user_name: storedUser,
          phone: storedPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to check in.');
      }

      localStorage.setItem(
        'demo_active_check_in',
        JSON.stringify({
          id: data.event_id || `evt_${Date.now()}`,
          ticket_number: data.ticket_number || 101,
          location_id: location.id,
          location_name: location.name,
          category: location.category,
          address: location.address,
          created_at: data.created_at || new Date().toISOString(),
          gps_verified: data.gps_verified ?? gpsVerified,
          position: data.position || 1,
          estimated_wait_minutes: data.estimated_wait_minutes || location.avg_service_time_minutes,
        })
      );

      router.push('/my-queue');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during check in.';
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px', lineHeight: 1.5 }}>
              The facility code <code style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{locationId}</code> is not registered on this device yet.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px', lineHeight: 1.4 }}>
              If you just created this facility, click below to activate it, or scan an updated physical QR code:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
              <Link href={`/venue/register?id=${encodeURIComponent(locationId)}`} className="btn btn-primary">
                <PlusCircle size={16} /> Register & Activate Facility
              </Link>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href="/" className="btn btn-secondary" style={{ flex: 1 }}>
                  Directory
                </Link>
                <Link href="/scan" className="btn btn-secondary" style={{ flex: 1 }}>
                  Scan Code
                </Link>
              </div>
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
            <span>Back to Directory</span>
          </Link>
          <span className="badge badge-primary">Patient Check-In</span>
        </div>
      </header>

      <main className="page-container" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-neutral">{location.category}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>• Code: {location.id}</span>
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {location.name}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={15} color="#94a3b8" />
              <span>{location.address}</span>
            </p>
          </div>

          <div className="grid-layout grid-layout-2col">
            <div className="metric-box">
              <div className="metric-label">Estimated Wait Time</div>
              <div className="metric-value" style={{ color: 'var(--brand-primary)' }}>
                ~{estimate.avg_wait_minutes} <span style={{ fontSize: '1rem', fontWeight: 500 }}>mins</span>
              </div>
              <div className="metric-subtext">Pacing: {location.avg_service_time_minutes} min/patient</div>
            </div>

            <div className="metric-box">
              <div className="metric-label">Patients in Queue</div>
              <div className="metric-value">
                {estimate.current_queue_length}
              </div>
              <div className="metric-subtext">Live queue status</div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Navigation size={18} color="#3b82f6" />
                <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>Geofence Security Verification</span>
              </div>
              {gpsStatus === 'success' && (
                <span className={`badge ${withinGeofence ? 'badge-success' : 'badge-danger'}`}>
                  {withinGeofence ? 'Within Perimeter' : 'Too Far'}
                </span>
              )}
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {gpsStatus === 'loading' && 'Acquiring GPS coordinates for on-site proximity validation...'}
              {gpsStatus === 'success' && withinGeofence && (
                <span>GPS confirmed on-site (~{Math.round(distanceToLocation || 0)}m away, perimeter is {location.geofence_radius_m}m).</span>
              )}
              {gpsStatus === 'success' && !withinGeofence && (
                <span style={{ color: 'var(--status-danger)' }}>
                  You are {Math.round(distanceToLocation || 0)}m away. You must be within {location.geofence_radius_m}m to check in.
                </span>
              )}
              {gpsStatus === 'denied' && (
                <span style={{ color: 'var(--status-warning)' }}>
                  Location permissions denied. GPS validation will use default proximity check-in.
                </span>
              )}
              {gpsStatus === 'error' && (
                <span>Unable to fetch GPS hardware coordinates. Proceeding with standard verification.</span>
              )}
            </div>
          </div>

          {error && (
            <div
              className="card"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                borderColor: 'var(--status-danger-border)',
                color: 'var(--status-danger)',
                fontSize: '0.85rem',
                padding: '14px 18px',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {hasExistingCheckIn ? (
              <button
                id="view-ticket-btn"
                onClick={() => router.push('/my-queue')}
                className="btn btn-secondary"
                style={{ padding: '14px', fontSize: '1rem' }}
              >
                {ctaText}
              </button>
            ) : (
              <button
                id="check-in-btn"
                onClick={handleCheckIn}
                disabled={submittingCheckIn || isGpsLoading || isGpsRestricted}
                className="btn btn-primary"
                style={{ padding: '14px', fontSize: '1rem' }}
              >
                {ctaText}
              </button>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
              <Link
                href={`/location/${location.id}/qr`}
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                }}
              >
                <QrCode size={14} />
                <span>View & Print On-Site QR Check-In Sign</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default function LocationDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Activity size={32} className="pulse" color="#3b82f6" style={{ margin: '0 auto 12px auto' }} />
            <div>Loading facility information...</div>
          </div>
        </div>
      }
    >
      <LocationDetailInner />
    </Suspense>
  );
}
