'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { calculateDistance } from '../lib/geofence';

interface LocationEstimate {
  current_queue_length: number;
  avg_wait_minutes: number;
}

interface Location {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  distance?: number; // Calculated dynamic distance in meters
  estimate?: LocationEstimate;
}

const MOCK_LOCATIONS: Location[] = [
  { id: 'mock-clinic-a', name: 'General Medicine Clinic A', address: '100 Medical Plaza, Suite 4', category: 'Clinic', lat: 37.7749, lng: -122.4194, estimate: { current_queue_length: 2, avg_wait_minutes: 24 } },
  { id: 'mock-lab-b', name: 'Express Lab Services', address: '100 Medical Plaza, Suite 12', category: 'Laboratory', lat: 37.7752, lng: -122.4189, estimate: { current_queue_length: 0, avg_wait_minutes: 0 } },
  { id: 'mock-peds-c', name: 'Pediatric Outpatient Clinic', address: '102 Medical Plaza, Floor 2', category: 'Pediatrics', lat: 37.7745, lng: -122.4201, estimate: { current_queue_length: 5, avg_wait_minutes: 75 } }
];

export default function LandingPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<any>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);

  useEffect(() => {
    // Determine if user is logged in
    const checkUserSession = async () => {
      // Check local storage for demo auth
      const demoPhone = localStorage.getItem('demo_authenticated_phone');
      if (demoPhone) {
        setUserPhone(demoPhone);
        // Check if there is an active checkin in local storage
        const demoCheckIn = localStorage.getItem('demo_active_check_in');
        if (demoCheckIn) {
          setActiveCheckIn(JSON.parse(demoCheckIn));
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserPhone(session.user.phone || 'Verified User');
          // Query active checkin for this user
          const { data } = await supabase
            .from('queue_events')
            .select('*, locations(*)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (data && data.length > 0 && data[0].event_type === 'check_in') {
            setActiveCheckIn(data[0]);
          }
        }
      }
    };

    checkUserSession();
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      if (isPlaceholder) {
        setLocations(MOCK_LOCATIONS);
        setLoading(false);
        return;
      }

      // Fetch official locations from database
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*');

      if (locError) throw locError;

      // Fetch corresponding estimates
      const { data: estData } = await supabase
        .from('location_estimates')
        .select('*');

      const mappedLocations: Location[] = (locData || []).map((loc) => {
        const est = estData?.find((e) => e.location_id === loc.id);
        return {
          id: loc.id,
          name: loc.name,
          address: loc.address || '',
          category: loc.category || '',
          lat: loc.lat,
          lng: loc.lng,
          estimate: est ? {
            current_queue_length: est.current_queue_length || 0,
            avg_wait_minutes: est.avg_wait_minutes || 0
          } : {
            current_queue_length: 0,
            avg_wait_minutes: 0
          }
        };
      });

      setLocations(mappedLocations.length > 0 ? mappedLocations : MOCK_LOCATIONS);
    } catch (err) {
      console.error('Error fetching locations, using mock data:', err);
      setLocations(MOCK_LOCATIONS);
    } finally {
      setLoading(false);
    }
  };

  // Ask for GPS coordinates to calculate proximity
  const requestGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setGpsLoading(false);
      },
      (error) => {
        console.error('GPS error:', error);
        setGpsLoading(false);
        alert('Could not retrieve GPS coordinates. Listing locations by default.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Recalculate distances and sort when GPS coordinates are retrieved
  const getProcessedLocations = () => {
    let list = [...locations];

    if (userLocation) {
      list = list.map((loc) => {
        const distM = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
        return { ...loc, distance: distM };
      });
      // Sort by proximity
      list.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (loc) => 
          loc.name.toLowerCase().includes(q) || 
          loc.address.toLowerCase().includes(q) ||
          loc.category.toLowerCase().includes(q)
      );
    }

    return list;
  };

  const handleLogout = async () => {
    localStorage.removeItem('demo_authenticated_phone');
    localStorage.removeItem('demo_active_check_in');
    await supabase.auth.signOut();
    window.location.reload();
  };

  const getWaitBadge = (minutes: number) => {
    if (minutes === 0) return <span className="badge badge-success">🟢 No Queue</span>;
    if (minutes < 20) return <span className="badge badge-success">🟢 ~{minutes} min wait</span>;
    if (minutes < 45) return <span className="badge badge-warning">🟡 ~{minutes} min wait</span>;
    return <span className="badge badge-danger">🔴 ~{minutes} min wait</span>;
  };

  const filteredLocations = getProcessedLocations();

  return (
    <>
      {/* App Header */}
      <header className="app-header glass">
        <div className="brand">
          <div className="brand-icon">⏳</div>
          <span>QWait Estimator</span>
        </div>
        {userPhone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{userPhone}</span>
            <button 
              onClick={handleLogout} 
              style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Log out
            </button>
          </div>
        ) : (
          <Link href="/login" className="badge" style={{ background: 'var(--accent)', color: '#0d0f12', fontWeight: 'bold' }}>
            Log In
          </Link>
        )}
      </header>

      {/* Main Content */}
      <div className="app-content">
        {/* Active Queue Tracker Header Card */}
        {activeCheckIn && (
          <Link href="/my-queue" className="card glass card-interactive" style={{ border: '1px solid var(--accent)', background: 'var(--accent-glow)', textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-success" style={{ marginBottom: '8px' }}>Active Check-In</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>
                  {activeCheckIn.locations?.name || activeCheckIn.location_name || 'Clinic Queue'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Tap to open live tracker countdown
                </p>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '1.5rem' }}>➡️</div>
            </div>
          </Link>
        )}

        {/* Hero search area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Know your wait before you stand in line
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
            Find a clinic or scan a QR code at the site to check in.
          </p>
        </div>

        {/* Search & Location Permission buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            id="search-input"
            type="text"
            placeholder="Search by clinic name or address..."
            className="input-field"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {!userLocation && (
            <button 
              id="gps-permission-btn"
              onClick={requestGPS} 
              className="btn btn-secondary" 
              style={{ padding: '10px 16px', fontSize: '0.85rem' }}
              disabled={gpsLoading}
            >
              {gpsLoading ? 'Detecting GPS...' : '📍 Show Nearest (Request GPS)'}
            </button>
          )}
        </div>

        {/* Locations List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {userLocation ? 'Sorted by Proximity' : 'Available Locations'}
            </h3>
            {userLocation && (
              <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>GPS Enabled</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading ? (
              // Skeletal loaders
              [1, 2, 3].map((n) => (
                <div key={n} className="card glass" style={{ height: '110px' }}>
                  <div className="skeleton" style={{ width: '60%', height: '18px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ width: '40%', height: '14px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ width: '25%', height: '20px' }} />
                </div>
              ))
            ) : filteredLocations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)' }}>
                No locations match "{searchQuery}"
              </div>
            ) : (
              filteredLocations.map((loc) => (
                <Link 
                  key={loc.id} 
                  href={`/location/${loc.id}`}
                  className="card glass card-interactive"
                  style={{ textDecoration: 'none' }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#fff' }}>{loc.name}</h4>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                        {loc.category}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {loc.address}
                    </p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                      {getWaitBadge(loc.estimate?.avg_wait_minutes || 0)}
                      
                      {loc.distance !== undefined && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {loc.distance < 1000 
                            ? `${Math.round(loc.distance)}m away` 
                            : `${(loc.distance / 1000).toFixed(1)}km away`}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Camera Scanner CTA */}
      <div className="sticky-bottom">
        <Link href="/scan" className="btn btn-primary" id="scan-qr-cta">
          📷 Scan QR to Check In
        </Link>
      </div>
    </>
  );
}
