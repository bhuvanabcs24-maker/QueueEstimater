'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { calculateDistance } from '../../../lib/geofence';

interface Location {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  avg_service_time_minutes: number;
}

interface LocationEstimate {
  current_queue_length: number;
  avg_wait_minutes: number;
}

const MOCK_LOCATIONS: Location[] = [
  { id: 'mock-clinic-a', name: 'General Medicine Clinic A', address: '100 Medical Plaza, Suite 4', category: 'Clinic', lat: 37.7749, lng: -122.4194, geofence_radius_m: 200, avg_service_time_minutes: 12 },
  { id: 'mock-lab-b', name: 'Express Lab Services', address: '100 Medical Plaza, Suite 12', category: 'Laboratory', lat: 37.7752, lng: -122.4189, geofence_radius_m: 100, avg_service_time_minutes: 8 },
  { id: 'mock-peds-c', name: 'Pediatric Outpatient Clinic', address: '102 Medical Plaza, Floor 2', category: 'Pediatrics', lat: 37.7745, lng: -122.4201, geofence_radius_m: 150, avg_service_time_minutes: 15 }
];

export default function LocationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = (params?.id as string) || '';

  const [location, setLocation] = useState<Location | null>(null);
  const [estimate, setEstimate] = useState<LocationEstimate>({ current_queue_length: 0, avg_wait_minutes: 0 });
  const [loading, setLoading] = useState(true);
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Geolocation state
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'denied' | 'error'>('idle');
  const [distanceToLocation, setDistanceToLocation] = useState<number | null>(null);
  const [withinGeofence, setWithinGeofence] = useState(false);
  
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingCheckIn, setHasExistingCheckIn] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Perform GPS Geofencing lookup
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
        console.warn('GPS location access denied or error:', geoError);
        setGpsStatus(geoError.code === geoError.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const checkAuthAndLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    setHasExistingCheckIn(false);

    // Check auth
    const demoPhone = localStorage.getItem('demo_authenticated_phone');
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
          // Ignore parse errors
        }
      }
    } else {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setIsLoggedIn(true);
          // Check if user already has an active checkin
          const { data } = await supabase
            .from('queue_events')
            .select('location_id, event_type')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (data && data.length > 0 && data[0].event_type === 'check_in' && data[0].location_id === locationId) {
            setHasExistingCheckIn(true);
          }
        }
      } catch {
        // Fallback for session lookup
      }
    }

    // Load Location Details
    try {
      const isPlaceholder = 
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
        !process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      if (isPlaceholder || locationId.startsWith('mock-')) {
        const mockLoc = MOCK_LOCATIONS.find((l) => l.id === locationId) || MOCK_LOCATIONS[0];
        setLocation(mockLoc);
        
        // Mock estimate from defaults
        const currentQueue = mockLoc.id === 'mock-clinic-a' ? 2 : mockLoc.id === 'mock-peds-c' ? 5 : 0;
        setEstimate({
          current_queue_length: currentQueue,
          avg_wait_minutes: currentQueue * mockLoc.avg_service_time_minutes
        });
        
        setLoading(false);
        triggerGpsCheck(mockLoc);
        return;
      }

      // Fetch location details from database
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single();

      if (locError) {
        const mockLoc = MOCK_LOCATIONS.find((l) => l.id === locationId);
        if (mockLoc) {
          setLocation(mockLoc);
          setEstimate({
            current_queue_length: 2,
            avg_wait_minutes: 2 * mockLoc.avg_service_time_minutes
          });
          triggerGpsCheck(mockLoc);
          setLoading(false);
          return;
        }
        throw locError;
      }

      setLocation(locData);

      // Fetch active estimates
      const { data: estData } = await supabase
        .from('location_estimates')
        .select('*')
        .eq('location_id', locationId)
        .single();

      if (estData) {
        setEstimate({
          current_queue_length: estData.current_queue_length || 0,
          avg_wait_minutes: Number(estData.avg_wait_minutes) || 0
        });
      } else {
        setEstimate({ current_queue_length: 0, avg_wait_minutes: 0 });
      }

      triggerGpsCheck(locData);
    } catch (err: unknown) {
      console.warn('Error loading location from database:', err);
      const fallbackMock = MOCK_LOCATIONS.find(l => l.id === locationId);
      if (fallbackMock) {
        setLocation(fallbackMock);
        setEstimate({ current_queue_length: 3, avg_wait_minutes: 36 });
        triggerGpsCheck(fallbackMock);
      } else {
        setLocation(null);
      }
    } finally {
      setLoading(false);
    }
  }, [locationId, triggerGpsCheck]);

  useEffect(() => {
    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
      !process.env.NEXT_PUBLIC_SUPABASE_URL;
    setIsDemoMode(isPlaceholder);

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
      const isPlaceholder = 
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
        !process.env.NEXT_PUBLIC_SUPABASE_URL;

      const isGpsSuccess = gpsStatus === 'success';
      const gpsVerified = isGpsSuccess && withinGeofence;

      // Geofence enforcement: If GPS was acquired and user is outside geofence, reject
      if (isGpsSuccess && !withinGeofence) {
        throw new Error(
          `Geofence verification failed. You are ${Math.round(distanceToLocation || 0)}m away, but must be within ${location.geofence_radius_m}m.`
        );
      }

      // Simulation mode
      if (isPlaceholder || locationId.startsWith('mock-')) {
        setTimeout(() => {
          const newCheckIn = {
            id: 'demo-checkin-id-' + Math.random().toString(36).substring(2, 10),
            location_id: location.id,
            location_name: location.name,
            created_at: new Date().toISOString(),
            event_type: 'check_in',
            gps_verified: gpsVerified || gpsStatus === 'denied',
            position: estimate.current_queue_length + 1,
            avg_wait_minutes: (estimate.current_queue_length + 1) * location.avg_service_time_minutes
          };
          localStorage.setItem('demo_active_check_in', JSON.stringify(newCheckIn));
          setSubmittingCheckIn(false);
          router.push('/my-queue');
        }, 800);
        return;
      }

      // Secure Server Check-In API Route with Authorization header
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Authentication session expired. Please log in again.');
      }

      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          location_id: location.id,
          lat: userCoords?.lat ?? null,
          lng: userCoords?.lng ?? null,
          gps_bypass: gpsStatus === 'denied' || gpsStatus === 'error'
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setHasExistingCheckIn(true);
        }
        throw new Error(resData.error || 'Server rejected check-in.');
      }

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
      <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="skeleton" style={{ width: '80px', height: '80px', borderRadius: '50%', marginBottom: '16px' }} />
        <div className="skeleton" style={{ width: '200px', height: '24px', marginBottom: '8px' }} />
        <div className="skeleton" style={{ width: '150px', height: '16px' }} />
      </div>
    );
  }

  if (!location) {
    return (
      <>
        <header className="app-header glass">
          <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
            <div className="brand-icon">⬅️</div>
            <span>Home</span>
          </Link>
        </header>
        <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔍</div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Facility Not Found</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px', maxWidth: '300px', lineHeight: '1.4' }}>
            The scanned QR code or ID does not match any registered service location.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px', width: '100%', maxWidth: '280px' }}>
            <Link href="/scan" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              📷 Scan Another QR Code
            </Link>
            <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              Browse Available Facilities
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Determine button state and label
  const isGpsRestricted = gpsStatus === 'success' && !withinGeofence;
  const isGpsLoading = gpsStatus === 'loading';
  const isGpsDenied = gpsStatus === 'denied' || gpsStatus === 'error';

  let ctaText = 'Check In to Queue';
  if (!isLoggedIn) ctaText = 'Log In to Check In';
  else if (hasExistingCheckIn) ctaText = 'View Active Spot in My Queue';
  else if (submittingCheckIn) ctaText = 'Checking In...';
  else if (isGpsLoading) ctaText = 'Locating via GPS...';
  else if (isGpsRestricted) ctaText = 'Out of Geofence Range';
  else if (isGpsDenied) ctaText = 'Check In (QR Fallback Mode)';

  // Percentage within geofence for progress bar
  const distance = distanceToLocation ?? 0;
  const allowed = location.geofence_radius_m;
  const ratio = Math.min(100, Math.max(0, Math.round((allowed / (distance || 1)) * 100)));

  return (
    <>
      {/* Header */}
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">⬅️</div>
          <span>Back</span>
        </Link>
        <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
          {location.category}
        </span>
      </header>

      {/* Main Content */}
      <div className="app-content">
        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.025em' }}>
            {location.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px', lineHeight: '1.4' }}>
            📍 {location.address}
          </p>
        </div>

        {isDemoMode && (
          <div className="notification-banner notification-banner-warning">
            <span>ℹ️ <strong>Demo Simulation Mode:</strong> Testing with local sample facility data.</span>
          </div>
        )}

        {/* Wait Estimate Hero Display */}
        <div className="card glass estimate-display">
          <span className="form-label" style={{ fontSize: '0.8rem' }}>Current Estimated Wait</span>
          <div className="estimate-number">
            {estimate.avg_wait_minutes}
            <span className="estimate-unit" style={{ display: 'block', fontSize: '1rem', marginTop: '4px' }}>minutes</span>
          </div>
          <span className="badge badge-success">
            👥 {estimate.current_queue_length} {estimate.current_queue_length === 1 ? 'person' : 'people'} currently in line
          </span>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '12px' }}>
            ~{location.avg_service_time_minutes} min average service time per patient
          </p>
        </div>

        {/* GPS Geofence Verification Status Card */}
        <div className="card glass" style={{ padding: '18px', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Geofence Verification</h2>
            {gpsStatus === 'success' && (
              <span className={`badge ${withinGeofence ? 'badge-success' : 'badge-danger'}`}>
                {withinGeofence ? 'Within Perimeter' : 'Outside Perimeter'}
              </span>
            )}
          </div>
          
          {gpsStatus === 'loading' && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              🛰️ Acquiring high-accuracy GPS coordinates...
            </div>
          )}

          {gpsStatus === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Distance to Facility:</span>
                <strong>{Math.round(distanceToLocation || 0)} meters</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Allowed Boundary:</span>
                <strong>{location.geofence_radius_m} meters</strong>
              </div>

              {/* Progress bar visual */}
              <div className="distance-bar-container">
                <div 
                  className="distance-bar-fill" 
                  style={{ 
                    width: withinGeofence ? '100%' : `${ratio}%`, 
                    backgroundColor: withinGeofence ? 'var(--accent)' : 'var(--danger)' 
                  }} 
                />
              </div>

              <div style={{ fontSize: '0.8rem', color: withinGeofence ? 'var(--accent)' : 'var(--danger)', marginTop: '4px' }}>
                {withinGeofence 
                  ? '✅ Physical presence confirmed. You are eligible to check in.' 
                  : `❌ You are ${Math.round((distanceToLocation || 0) - location.geofence_radius_m)}m outside the check-in boundary.`}
              </div>
            </div>
          )}

          {isGpsDenied && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ color: 'var(--warning)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚠️ Location services unavailable or permission denied.
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: '1.35' }}>
                Because you scanned the physical on-site QR code, <strong>QR-Only Fallback</strong> will allow you to join the queue without GPS blocking.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="notification-banner notification-banner-error">
            <span>{error}</span>
          </div>
        )}

        {/* Existing check-in notification */}
        {hasExistingCheckIn && (
          <div className="notification-banner notification-banner-info">
            <span>
              You already have an active check-in at this location. Tap below to track your place.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          {hasExistingCheckIn ? (
            <Link href="/my-queue" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              🚀 Open My Active Queue
            </Link>
          ) : (
            <button
              id="checkin-btn"
              onClick={handleCheckIn}
              className="btn btn-primary"
              disabled={
                submittingCheckIn || 
                isGpsLoading || 
                (isLoggedIn && isGpsRestricted)
              }
            >
              {ctaText}
            </button>
          )}

          {isGpsRestricted && !hasExistingCheckIn && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', lineHeight: '1.4' }}>
              ⚠️ You must be physically at the location to check in. If you are on-site, try refreshing your browser to acquire an updated GPS reading.
            </p>
          )}

          <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Back to Directory
          </Link>
        </div>
      </div>
    </>
  );
}
