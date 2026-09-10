'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { calculateDistance, isWithinGeofence } from '../../../lib/geofence';

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
  const locationId = params.id as string;

  const [location, setLocation] = useState<Location | null>(null);
  const [estimate, setEstimate] = useState<LocationEstimate>({ current_queue_length: 0, avg_wait_minutes: 0 });
  const [loading, setLoading] = useState(true);
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Geolocation state
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'denied' | 'error'>('idle');
  const [distanceToLocation, setDistanceToLocation] = useState<number | null>(null);
  const [withinGeofence, setWithinGeofence] = useState(false);
  
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [error, setError] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // Check if Supabase keys are placeholders
    const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;
    setIsDemoMode(isPlaceholder);

    // Initialize Auth & Location details
    checkAuthAndLoad();
  }, [locationId]);

  const checkAuthAndLoad = async () => {
    setLoading(true);
    setError('');

    // Check auth
    const demoPhone = localStorage.getItem('demo_authenticated_phone');
    if (demoPhone) {
      setIsLoggedIn(true);
      setUserPhone(demoPhone);
      setUserId('demo-user-id');
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
        setUserPhone(session.user.phone || 'Verified User');
        setUserId(session.user.id);
      }
    }

    // Load Location Details
    try {
      const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      if (isPlaceholder) {
        const mockLoc = MOCK_LOCATIONS.find((l) => l.id === locationId) || MOCK_LOCATIONS[0];
        setLocation(mockLoc);
        
        // Mock estimate from local storage or defaults
        const storedDemoCheckIn = localStorage.getItem('demo_active_check_in');
        let currentQueue = mockLoc.id === 'mock-clinic-a' ? 2 : mockLoc.id === 'mock-peds-c' ? 5 : 0;
        
        if (storedDemoCheckIn) {
          const checkIn = JSON.parse(storedDemoCheckIn);
          if (checkIn.location_id === mockLoc.id) {
            currentQueue += 1;
          }
        }
        
        setEstimate({
          current_queue_length: currentQueue,
          avg_wait_minutes: currentQueue * mockLoc.avg_service_time_minutes
        });
        
        setLoading(false);
        // Start GPS tracking
        triggerGpsCheck(mockLoc);
        return;
      }

      // Fetch location details
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single();

      if (locError) {
        // Fallback to mock if ID is a mock ID
        if (locationId.startsWith('mock-')) {
          const mockLoc = MOCK_LOCATIONS.find((l) => l.id === locationId) || MOCK_LOCATIONS[0];
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

      // Start GPS checking for this location
      triggerGpsCheck(locData);
    } catch (err: any) {
      console.error('Error loading location, using mock fallback:', err);
      const mockLoc = MOCK_LOCATIONS[0];
      setLocation(mockLoc);
      setEstimate({ current_queue_length: 3, avg_wait_minutes: 36 });
      triggerGpsCheck(mockLoc);
    } finally {
      setLoading(false);
    }
  };

  // Perform GPS Geofencing lookup
  const triggerGpsCheck = (loc: Location) => {
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
      (error) => {
        console.warn('GPS location access denied or error:', error);
        setGpsStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCheckIn = async () => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/location/${locationId}`);
      return;
    }

    if (!location) return;

    setSubmittingCheckIn(true);
    setError('');

    try {
      const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;

      // Geofence check: if gps is success and user is outside, prevent check-in
      const isGpsSuccess = gpsStatus === 'success';
      const gpsVerified = isGpsSuccess && withinGeofence;

      if (isGpsSuccess && !withinGeofence) {
        throw new Error(`Geofence validation failed. You are ${Math.round(distanceToLocation || 0)}m away, but must be within ${location.geofence_radius_m}m.`);
      }

      if (isPlaceholder || locationId.startsWith('mock-')) {
        // Simulation mode checkin mock
        setTimeout(() => {
          const newCheckIn = {
            id: 'demo-checkin-id-' + Math.random().toString(36).substr(2, 9),
            location_id: location.id,
            location_name: location.name,
            created_at: new Date().toISOString(),
            event_type: 'check_in',
            gps_verified: gpsVerified || gpsStatus === 'denied', // Allow QR bypass check-in
            position: estimate.current_queue_length + 1,
            avg_wait_minutes: (estimate.current_queue_length + 1) * location.avg_service_time_minutes
          };
          localStorage.setItem('demo_active_check_in', JSON.stringify(newCheckIn));
          setSubmittingCheckIn(false);
          router.push('/my-queue');
        }, 1200);
        return;
      }

      // Secure Server Check-In API Route trigger
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location_id: location.id,
          lat: userCoords?.lat || null,
          lng: userCoords?.lng || null,
          user_id: userId,
          gps_bypass: gpsStatus === 'denied' || gpsStatus === 'error' // QR bypass fallback
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Server rejected check-in.');
      }

      router.push('/my-queue');
    } catch (err: any) {
      console.error('Check-in failed:', err);
      setError(err.message || 'Check-in failed. Please try again.');
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
      <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Location not found.</p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: '16px' }}>Back to Home</Link>
      </div>
    );
  }

  // Determine button state and label
  const isGpsRestricted = gpsStatus === 'success' && !withinGeofence;
  const isGpsLoading = gpsStatus === 'loading';
  const isGpsDenied = gpsStatus === 'denied' || gpsStatus === 'error';

  let ctaText = 'Check In Here';
  if (!isLoggedIn) ctaText = 'Log In to Check In';
  else if (submittingCheckIn) ctaText = 'Checking In...';
  else if (isGpsLoading) ctaText = 'Locating via GPS...';
  else if (isGpsRestricted) ctaText = 'Out of GPS Geofence Range';
  else if (isGpsDenied) ctaText = 'Check In (QR Fallback Mode)';

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
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.025em' }}>{location.name}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px', lineHeight: '1.4' }}>
            📍 {location.address}
          </p>
        </div>

        {/* Wait Estimate Hero Display */}
        <div className="card glass estimate-display">
          <span className="form-label" style={{ fontSize: '0.8rem' }}>Estimated Wait Time</span>
          <div className="estimate-number">
            {estimate.avg_wait_minutes}
            <span className="estimate-unit" style={{ display: 'block', fontSize: '1rem', marginTop: '4px' }}>minutes</span>
          </div>
          <span className="badge badge-success">
            👥 {estimate.current_queue_length} {estimate.current_queue_length === 1 ? 'person' : 'people'} in queue
          </span>
        </div>

        {/* GPS Verification Status Card */}
        <div className="card glass" style={{ padding: '16px', gap: '10px', fontSize: '0.85rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fff' }}>Geofence Verification</h3>
          
          {gpsStatus === 'loading' && (
            <div style={{ color: 'var(--text-secondary)' }}>
              🛰️ Accessing device location...
            </div>
          )}

          {gpsStatus === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Distance to Clinic:</span>
                <strong style={{ marginLeft: 'auto' }}>{Math.round(distanceToLocation || 0)} meters</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Allowed Boundary:</span>
                <strong style={{ marginLeft: 'auto' }}>{location.geofence_radius_m} meters</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: withinGeofence ? 'var(--accent)' : 'var(--danger)' }}>
                {withinGeofence ? '✅ Position verified! Within boundary.' : '❌ You are outside the check-in geofence boundary.'}
              </div>
            </div>
          )}

          {isGpsDenied && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚠️ GPS location access blocked or unavailable.
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.3' }}>
                Since you scanned the QR code, we will allow you to bypass GPS checking using <strong>QR-Only Fallback</strong>. Your check-in will be marked as unverified but you will not be blocked.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div 
            style={{ 
              background: 'var(--danger-glow)', 
              border: '1px solid rgba(248, 113, 113, 0.2)', 
              padding: '12px', 
              borderRadius: 'var(--radius-sm)', 
              fontSize: '0.85rem', 
              color: 'var(--danger)', 
              textAlign: 'center' 
            }}
          >
            {error}
          </div>
        )}

        {/* Check In Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
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

          {isGpsRestricted && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', lineHeight: '1.4' }}>
              ⚠️ To check in, you must walk closer to the facility. If you are already at the clinic, try reloading the page to refresh your GPS reading.
            </p>
          )}

          <Link href="/" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </div>
    </>
  );
}
