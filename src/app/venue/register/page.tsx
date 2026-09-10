'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Navigation, ArrowLeft, PlusCircle, Search } from 'lucide-react';
import { registerNewVenue } from '@/lib/venueStore';

export default function RegisterVenuePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Healthcare');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | ''>(12.9716);
  const [lng, setLng] = useState<number | ''>(77.5946);
  const [radius, setRadius] = useState(150);
  const [avgServiceMins, setAvgServiceMins] = useState(5);
  const [loadingGps, setLoadingGps] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('📍 Coordinates are pre-filled by default. Tap "Use My Location" or type an address to change them.');

  const geocodeAddress = async (queryAddress: string) => {
    if (!queryAddress.trim()) return false;
    setGeocoding(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryAddress)}`);
      const data = await res.json();

      if (data && data.length > 0) {
        const foundLat = Number(parseFloat(data[0].lat).toFixed(6));
        const foundLng = Number(parseFloat(data[0].lon).toFixed(6));
        setLat(foundLat);
        setLng(foundLng);
        setInfoMsg(`📍 Auto-filled coordinates from address: (${foundLat}, ${foundLng})`);
        setGeocoding(false);
        return true;
      }
    } catch (err) {
      console.warn('Geocoding error:', err);
    }

    setGeocoding(false);
    return false;
  };

  const handleGetCurrentLocation = () => {
    setLoadingGps(true);
    setErrorMsg('');
    setInfoMsg('');

    const success = (pos: GeolocationPosition) => {
      setLat(Number(pos.coords.latitude.toFixed(6)));
      setLng(Number(pos.coords.longitude.toFixed(6)));
      setLoadingGps(false);
      setInfoMsg('📍 Real-time GPS coordinates acquired successfully!');
    };

    const failure = async (err: GeolocationPositionError) => {
      console.warn('High accuracy GPS failed, trying low accuracy / address geocoding...', err);

      navigator.geolocation.getCurrentPosition(
        success,
        async () => {
          setLoadingGps(false);

          // Attempt Address Geocoding first
          const geocoded = await geocodeAddress(address);
          if (!geocoded) {
            // Default fallback coordinates so registration is never blocked
            const fallbackLat = 14.5492;
            const fallbackLng = 75.1481;
            setLat(fallbackLat);
            setLng(fallbackLng);
            setInfoMsg('⚠️ GPS timed out indoors. Auto-filled standard venue coordinates so you can save.');
          }
        },
        { enableHighAccuracy: false, timeout: 3000 }
      );
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(success, failure, { enableHighAccuracy: true, timeout: 4000 });
    } else {
      failure({ code: 2, message: 'Geolocation unsupported', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLat = lat !== '' ? Number(lat) : 14.5492;
    const finalLng = lng !== '' ? Number(lng) : 75.1481;

    if (!name.trim() || !address.trim()) {
      setErrorMsg('Please enter the Venue Name and Physical Address.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const newVenue = registerNewVenue({
        name: name.trim(),
        category,
        address: address.trim(),
        lat: finalLat,
        lng: finalLng,
        geofence_radius_m: Number(radius),
        avg_service_time_minutes: Number(avgServiceMins),
      });

      router.push(`/location/${newVenue.id}/qr`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setErrorMsg(msg);
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="app-header glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
        <Link href="/" className="btn btn-secondary" style={{ width: 'auto', padding: '8px 12px', fontSize: '0.85rem', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Home
        </Link>
        <span className="badge badge-success">Register Venue</span>
      </header>

      <div className="app-content" style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', margin: '12px 0 20px 0' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              margin: '0 auto 12px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1',
            }}
          >
            <PlusCircle size={28} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>Register New Venue</h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem', marginTop: '4px' }}>
            Map a clinic, hospital desk, or service counter and generate an instant check-in QR poster.
          </p>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444', marginBottom: '16px', textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#10b981', marginBottom: '16px', textAlign: 'center' }}>
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card glass" style={{ padding: '24px', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Venue / Counter Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Sarvodaya Clinic - Counter 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', outline: 'none' }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', outline: 'none' }}
            >
              <option value="Healthcare">Healthcare / Clinic</option>
              <option value="Laboratory">Diagnostic Laboratory</option>
              <option value="Pharmacy">Pharmacy Counter</option>
              <option value="Education">Campus / College Desk</option>
              <option value="Public Service">Government / Public Counter</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Physical Address *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="e.g. Main Road, Anavatti"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => address && geocodeAddress(address)}
                style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', outline: 'none' }}
                required
              />
              <button
                type="button"
                onClick={() => geocodeAddress(address)}
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '10px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                disabled={geocoding || !address.trim()}
              >
                {geocoding ? 'Finding...' : <><Search size={14} /> Find Lat/Lng</>}
              </button>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={16} color="#6366f1" /> GPS Coordinates
              </span>
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8' }}
                disabled={loadingGps}
              >
                {loadingGps ? 'Detecting GPS...' : <><Navigation size={14} /> Use My Location</>}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 14.5492"
                  value={lat}
                  onChange={(e) => setLat(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 75.1481"
                  value={lng}
                  onChange={(e) => setLng(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                Geofence Radius (m)
              </label>
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                style={{ width: '100%', padding: '12px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
              >
                <option value={50}>50m (Strict Room)</option>
                <option value={150}>150m (Standard Clinic)</option>
                <option value={300}>300m (Hospital Building)</option>
                <option value={500}>500m (Campus Wide)</option>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                Avg Service Mins/pt
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={avgServiceMins}
                onChange={(e) => setAvgServiceMins(Number(e.target.value))}
                style={{ width: '100%', padding: '12px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: '14px', fontSize: '1rem', marginTop: '8px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            disabled={submitting}
          >
            {submitting ? 'Saving Venue...' : 'Save Venue & Generate QR Poster 🚀'}
          </button>
        </form>
      </div>
    </>
  );
}
