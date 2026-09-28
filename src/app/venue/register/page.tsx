'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Navigation, ArrowLeft, Building2, Search, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [infoMsg, setInfoMsg] = useState('Standard facility coordinates loaded. You can click "Detect My Location" or search an address.');

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
        setInfoMsg(`Geocoded coordinates from address: (${foundLat}, ${foundLng})`);
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
      setInfoMsg('Real-time GPS coordinates acquired successfully.');
    };

    const failure = async (err: GeolocationPositionError) => {
      console.warn('High accuracy GPS failed, trying fallback...', err);

      navigator.geolocation.getCurrentPosition(
        success,
        async () => {
          setLoadingGps(false);

          const geocoded = await geocodeAddress(address);
          if (!geocoded) {
            const fallbackLat = 14.5492;
            const fallbackLng = 75.1481;
            setLat(fallbackLat);
            setLng(fallbackLng);
            setInfoMsg('GPS timed out indoors. Pre-filled standard facility coordinates.');
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
      setErrorMsg('Please enter both the facility name and physical address.');
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
    <div className="page-container" style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <Link href="/" className="btn btn-secondary" style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Directory
        </Link>
        <span className="badge badge-primary">
          <Building2 size={13} /> Facility Onboarding
        </span>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
          Register Service Counter / Clinic
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Create a new triage queue counter, configure geofencing constraints, and generate a printable QR poster.
        </p>
      </div>

      {errorMsg && (
        <div
          className="card"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.3)',
            background: 'rgba(239, 68, 68, 0.05)',
            color: 'var(--danger)',
            fontSize: '0.85rem',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {infoMsg && (
        <div
          className="card"
          style={{
            borderColor: 'rgba(16, 185, 129, 0.3)',
            background: 'rgba(16, 185, 129, 0.05)',
            color: 'var(--success)',
            fontSize: '0.85rem',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} /> {infoMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="form-group">
          <label className="form-label">Facility / Counter Name *</label>
          <input
            type="text"
            placeholder="e.g. City Care Center - Room 102"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field"
            style={{ appearance: 'auto' }}
          >
            <option value="Healthcare">Healthcare / Outpatient Clinic</option>
            <option value="Laboratory">Diagnostic Pathology Lab</option>
            <option value="Pharmacy">Hospital Pharmacy Counter</option>
            <option value="Education">Campus / Student Desk</option>
            <option value="Public Service">Public Service Counter</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Physical Address *</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. 100 Hospital Way, Medical District"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => address && geocodeAddress(address)}
              className="input-field"
              style={{ flex: 1 }}
              required
            />
            <button
              type="button"
              onClick={() => geocodeAddress(address)}
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0.65rem 1rem', fontSize: '0.825rem', whiteSpace: 'nowrap' }}
              disabled={geocoding || !address.trim()}
            >
              <Search size={14} /> {geocoding ? 'Locating...' : 'Locate'}
            </button>
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--border-default)',
            background: 'var(--bg-page)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={15} color="var(--primary)" /> GPS Coordinates
            </span>
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              disabled={loadingGps}
            >
              <Navigation size={13} /> {loadingGps ? 'Reading GPS...' : 'Detect My Location'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="12.9716"
                value={lat}
                onChange={(e) => setLat(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field"
                style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="77.5946"
                value={lng}
                onChange={(e) => setLng(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field"
                style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Geofence Radius</label>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="input-field"
              style={{ appearance: 'auto' }}
            >
              <option value={50}>50 meters (Room boundary)</option>
              <option value={150}>150 meters (Standard clinic)</option>
              <option value={300}>300 meters (Hospital campus)</option>
              <option value={500}>500 meters (District zone)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Pacing (Mins/Patient)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={avgServiceMins}
              onChange={(e) => setAvgServiceMins(Number(e.target.value))}
              className="input-field"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', marginTop: '0.5rem' }}
          disabled={submitting}
        >
          {submitting ? 'Registering Facility...' : 'Register Facility & Generate Poster'}
        </button>
      </form>
    </div>
  );
}
