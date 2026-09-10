'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculateDistance } from '@/lib/geofence';
import { getVenuesNearGps, Venue } from '@/lib/venueStore';
import dynamic from 'next/dynamic';
import HeaderNav from '@/components/HeaderNav';

const VenueMap = dynamic(() => import('@/components/VenueMap'), { ssr: false });

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
  distance?: number;
  estimate?: LocationEstimate;
}

export default function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<{ id: string; location_name?: string; locations?: { name?: string } } | null>(null);

  useEffect(() => {
    // Check if there is an active checkin
    const checkUserSession = async () => {
      const demoCheckIn = localStorage.getItem('demo_active_check_in');
      if (demoCheckIn) {
        try {
          setActiveCheckIn(JSON.parse(demoCheckIn));
        } catch {
          localStorage.removeItem('demo_active_check_in');
        }
      } else {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data } = await supabase
              .from('queue_events')
              .select('id, location_id, event_type, created_at, locations(name)')
              .eq('user_id', session.user.id)
              .order('created_at', { ascending: false })
              .limit(1);

            if (data && data.length > 0 && data[0].event_type === 'check_in') {
              const rawLoc = data[0].locations as unknown as { name?: string } | { name?: string }[];
              const locName = Array.isArray(rawLoc) ? rawLoc[0]?.name : rawLoc?.name;
              setActiveCheckIn({
                id: data[0].id,
                location_name: locName || 'Clinic Queue'
              });
            }
          }
        } catch {
          // Ignore error
        }
      }
    };

    checkUserSession();
    fetchLocations();
    requestGPS();
  }, []);

  useEffect(() => {
    if (userLocation) {
      fetchLocations(userLocation.lat, userLocation.lng);
    }
  }, [userLocation]);

  const fetchLocations = (lat?: number, lng?: number) => {
    setLoading(true);
    try {
      const nearVenues: Venue[] = getVenuesNearGps(lat, lng);
      const mapped: Location[] = nearVenues.map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        category: v.category,
        lat: v.lat,
        lng: v.lng,
        distance: v.distance_meters,
        estimate: {
          current_queue_length: v.current_queue_length ?? 2,
          avg_wait_minutes: Math.round((v.current_queue_length ?? 2) * v.avg_service_time_minutes),
        },
      }));
      setLocations(mapped);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const requestGPS = () => {
    if (!navigator.geolocation) return;

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setGpsLoading(false);
      },
      (error) => {
        console.warn('GPS location unavailable:', error.message || error);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const getProcessedLocations = () => {
    let list = [...locations];

    if (userLocation) {
      list = list.map((loc) => {
        const distM = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
        return { ...loc, distance: distM };
      });
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
        <HeaderNav />
      </header>

      {/* Main Content */}
      <div className="app-content">
        {/* Active Queue Tracker Header Card */}
        {activeCheckIn && (
          <Link 
            href="/my-queue" 
            className="card glass card-interactive" 
            style={{ 
              border: '1px solid var(--accent)', 
              background: 'var(--accent-glow)', 
              textDecoration: 'none' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-success" style={{ marginBottom: '8px' }}>Active Check-In</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
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

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link 
              href="/venue/register" 
              className="btn btn-secondary" 
              style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem', textDecoration: 'none' }}
            >
              ➕ Register New Venue
            </Link>
            {!userLocation && (
              <button 
                id="gps-permission-btn"
                onClick={requestGPS} 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                disabled={gpsLoading}
              >
                {gpsLoading ? 'Detecting GPS...' : '📍 Show Nearest (GPS)'}
              </button>
            )}
          </div>
        </div>

        {/* Interactive Map View */}
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📍 Interactive Venue Map
            </h3>
          </div>
          <VenueMap 
            venues={getVenuesNearGps(userLocation?.lat, userLocation?.lng)} 
            userLat={userLocation?.lat} 
            userLng={userLocation?.lng} 
          />
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
              [1, 2, 3].map((n) => (
                <div key={n} className="card glass" style={{ height: '110px' }}>
                  <div className="skeleton" style={{ width: '60%', height: '18px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ width: '40%', height: '14px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ width: '25%', height: '20px' }} />
                </div>
              ))
            ) : filteredLocations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)' }}>
                No locations match &quot;{searchQuery}&quot;
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
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{loc.name}</h4>
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
        <Link href="/scan" className="btn btn-primary" id="scan-qr-cta" style={{ textDecoration: 'none' }}>
          📷 Scan QR to Check In
        </Link>
      </div>
    </>
  );
}
