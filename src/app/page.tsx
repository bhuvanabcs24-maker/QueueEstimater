'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculateDistance } from '@/lib/geofence';
import { getVenuesNearGps, syncVenuesFromDatabase, Venue } from '@/lib/venueStore';
import dynamic from 'next/dynamic';
import HeaderNav from '@/components/HeaderNav';
import { useRealtimeQueue } from '@/lib/useRealtimeQueue';
import {
  Search,
  MapPin,
  Clock,
  Users,
  QrCode,
  Plus,
  Navigation,
  Activity,
  ArrowRight,
  Building2,
  Stethoscope,
  FlaskConical,
  Baby,
} from 'lucide-react';

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
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<{ id: string; location_name?: string; position?: number } | null>(null);

  // Connect to live real-time queue stream
  const { venues: realtimeVenues } = useRealtimeQueue();

  const fetchLocations = useCallback((lat?: number, lng?: number) => {
    setLoading(true);
    try {
      const nearVenues: Venue[] = getVenuesNearGps(lat, lng);
      const venueMap = new Map<string, Venue>();
      nearVenues.forEach((v) => venueMap.set(v.id, v));

      // Also merge any venues received from real-time store / cloud
      if (realtimeVenues && typeof realtimeVenues === 'object') {
        Object.values(realtimeVenues).forEach((rt) => {
          if (!rt || !rt.venueId) return;
          const existing = venueMap.get(rt.venueId);
          const queueLength = Array.isArray(rt.queueList) ? rt.queueList.length : (rt.currentQueueLength || 0);

          if (existing) {
            existing.name = rt.name || existing.name;
            existing.current_queue_length = queueLength;
            existing.avg_service_time_minutes = rt.avgServiceTimeMinutes || existing.avg_service_time_minutes;
          } else {
            const dist =
              typeof lat === 'number' && typeof lng === 'number'
                ? Math.round(calculateDistance(lat, lng, rt.lat, rt.lng))
                : undefined;
            venueMap.set(rt.venueId, {
              id: rt.venueId,
              name: rt.name,
              category: rt.category || 'Healthcare',
              address: rt.address || 'Medical Facility',
              lat: rt.lat,
              lng: rt.lng,
              geofence_radius_m: rt.geofenceRadiusM || 150,
              avg_service_time_minutes: rt.avgServiceTimeMinutes || 5,
              current_queue_length: queueLength,
              total_served: rt.totalServed || 0,
              distance_meters: dist,
              is_custom: true,
            });
          }
        });
      }

      const allVenues = Array.from(venueMap.values());
      if (typeof lat === 'number' && typeof lng === 'number') {
        allVenues.sort((a, b) => (a.distance_meters || 0) - (b.distance_meters || 0));
      }

      const mapped: Location[] = allVenues.map((v) => {
        const rt = realtimeVenues[v.id];
        const queueLen = rt
          ? (Array.isArray(rt.queueList) ? rt.queueList.length : (rt.currentQueueLength || 0))
          : (v.current_queue_length ?? 0);
        const waitMins = rt
          ? (rt.estimatedWaitMinutes || Math.round(queueLen * (rt.avgServiceTimeMinutes || 5)))
          : Math.round(queueLen * (v.avg_service_time_minutes || 5));

        return {
          id: v.id,
          name: v.name,
          address: v.address,
          category: v.category,
          lat: v.lat,
          lng: v.lng,
          distance: v.distance_meters,
          estimate: {
            current_queue_length: queueLen,
            avg_wait_minutes: waitMins,
          },
        };
      });
      setLocations(mapped);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [realtimeVenues]);

  useEffect(() => {
    const checkUserSession = async () => {
      const demoCheckIn = localStorage.getItem('demo_active_check_in');
      if (demoCheckIn) {
        try {
          const parsed = JSON.parse(demoCheckIn);
          setActiveCheckIn({
            id: parsed.id,
            location_name: parsed.location_name,
            position: parsed.position,
          });
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
                location_name: locName || 'Clinic Queue',
              });
            }
          }
        } catch {
          // Ignore
        }
      }
    };

    checkUserSession();
    requestGPS();

    // Pull real database locations initially and on periodic sync
    syncVenuesFromDatabase().then(() => {
      fetchLocations(userLocation?.lat, userLocation?.lng);
    });

    const syncInterval = setInterval(() => {
      syncVenuesFromDatabase();
    }, 4500);

    return () => clearInterval(syncInterval);
  }, [fetchLocations, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    fetchLocations(userLocation?.lat, userLocation?.lng);
  }, [userLocation, fetchLocations]);

  const requestGPS = () => {
    if (!navigator.geolocation) return;

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
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

    if (selectedCategory !== 'All') {
      list = list.filter((loc) => loc.category.toLowerCase().includes(selectedCategory.toLowerCase()));
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

  const getCategoryIcon = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes('lab')) return <FlaskConical size={14} />;
    if (c.includes('ped')) return <Baby size={14} />;
    if (c.includes('clinic')) return <Stethoscope size={14} />;
    return <Building2 size={14} />;
  };

  const getWaitBadge = (minutes: number) => {
    if (minutes === 0) {
      return <span className="badge badge-success">No Wait</span>;
    }
    if (minutes < 20) {
      return <span className="badge badge-success">~{minutes}m Wait (Low)</span>;
    }
    if (minutes < 40) {
      return <span className="badge badge-warning">~{minutes}m Wait (Moderate)</span>;
    }
    return <span className="badge badge-danger">~{minutes}m Wait (Busy)</span>;
  };

  const filteredLocations = getProcessedLocations();

  return (
    <>
      {/* Standard App Header */}
      <header className="app-header">
        <div className="header-container">
          <Link href="/" className="brand-link">
            <div className="brand-symbol">
              <Activity size={20} />
            </div>
            <div>
              <span style={{ fontWeight: 800 }}>CareQueue</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', fontWeight: 500 }}>
                Hospital & Clinic Triage
              </span>
            </div>
          </Link>
          <HeaderNav />
        </div>
      </header>

      {/* Main Page Container */}
      <main className="page-container">
        {/* Active Ticket Banner */}
        {activeCheckIn && (
          <Link
            href="/my-queue"
            className="alert-banner alert-banner-info"
            style={{ textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '6px', background: 'rgba(14, 165, 233, 0.2)', borderRadius: '6px' }}>
                <Clock size={18} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>
                  Active Queue Spot: {activeCheckIn.location_name || 'Clinic Waiting Line'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Tap here to open live triage countdown and status
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>View Ticket</span>
              <ArrowRight size={15} />
            </div>
          </Link>
        )}

        {/* Directory Header Hero */}
        <div className="page-header">
          <h1 className="page-title">Outpatient Care & Queue Directory</h1>
          <p className="page-subtitle">
            View live department wait estimates, check in on-site via QR code, or join virtual waiting lines.
          </p>
        </div>

        {/* Search & Actions Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
              <Search
                size={18}
                color="#64748b"
                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                id="search-input"
                type="text"
                placeholder="Search by facility name, specialty, or address..."
                className="input-field"
                style={{ paddingLeft: '40px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={requestGPS}
                className="btn btn-secondary"
                disabled={gpsLoading}
                title="Sort by nearest GPS location"
              >
                <Navigation size={15} />
                <span>{gpsLoading ? 'Locating...' : userLocation ? 'GPS Enabled' : 'Near Me'}</span>
              </button>

              <Link href="/venue/register" className="btn btn-secondary">
                <Plus size={15} />
                <span>Add Facility</span>
              </Link>

              <Link href="/scan" className="btn btn-primary">
                <QrCode size={15} />
                <span>Scan QR</span>
              </Link>
            </div>
          </div>

          {/* Category Tabs */}
          {locations.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {['All', ...Array.from(new Set(locations.map((loc) => loc.category).filter(Boolean)))].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid',
                    borderColor: selectedCategory === cat ? 'var(--brand-primary)' : 'var(--border-default)',
                    backgroundColor: selectedCategory === cat ? 'var(--brand-primary-subtle)' : 'var(--bg-surface)',
                    color: selectedCategory === cat ? '#93c5fd' : 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Interactive Map View */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={15} color="#3b82f6" />
              <span>Facility Geographic Overview</span>
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {filteredLocations.length} locations mapped
            </span>
          </div>

          <VenueMap
            venues={locations.map((loc) => ({
              id: loc.id,
              name: loc.name,
              category: loc.category,
              address: loc.address,
              lat: loc.lat,
              lng: loc.lng,
              geofence_radius_m: 150,
              avg_service_time_minutes: 5,
              current_queue_length: loc.estimate?.current_queue_length || 0,
              distance_meters: loc.distance,
            }))}
            userLat={userLocation?.lat}
            userLng={userLocation?.lng}
          />
        </div>

        {/* Facilities Directory Listing */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Available Service Locations
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Live updates synced
            </span>
          </div>

          {loading ? (
            <div className="grid-layout grid-layout-2col">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="card" style={{ height: '130px', opacity: 0.6 }}>
                  <div style={{ height: '20px', width: '60%', background: 'var(--bg-surface-elevated)', borderRadius: '4px' }} />
                  <div style={{ height: '14px', width: '40%', background: 'var(--bg-surface-elevated)', borderRadius: '4px' }} />
                  <div style={{ height: '24px', width: '25%', background: 'var(--bg-surface-elevated)', borderRadius: '4px', marginTop: 'auto' }} />
                </div>
              ))}
            </div>
          ) : locations.length === 0 ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Building2 size={36} color="var(--primary)" style={{ opacity: 0.8 }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                No Facilities Registered Yet
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.5 }}>
                All mock demo clinics have been cleared. Only verified facilities from your database or newly registered on-site appear here.
              </p>
              <Link href="/venue/register" className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px', marginTop: '6px' }}>
                <Plus size={16} /> Register First Facility
              </Link>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No service facilities found matching &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div className="grid-layout grid-layout-2col">
              {filteredLocations.map((loc) => (
                <Link
                  key={loc.id}
                  href={`/location/${loc.id}`}
                  className="card card-interactive"
                  style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {loc.name}
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {loc.address}
                        </p>
                      </div>
                      <span className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {getCategoryIcon(loc.category)}
                        <span>{loc.category}</span>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', marginTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getWaitBadge(loc.estimate?.avg_wait_minutes || 0)}
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Users size={12} />
                        <span>{loc.estimate?.current_queue_length || 0} waiting</span>
                      </span>
                    </div>

                    {loc.distance !== undefined && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <MapPin size={12} />
                        <span>
                          {loc.distance < 1000
                            ? `${Math.round(loc.distance)}m away`
                            : `${(loc.distance / 1000).toFixed(1)}km away`}
                        </span>
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
