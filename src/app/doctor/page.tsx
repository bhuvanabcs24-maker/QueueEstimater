'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Stethoscope, Lock, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';
import { getAllVenues, Venue } from '@/lib/venueStore';

export default function DoctorLoginPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const list = getAllVenues();
    setVenues(list);
    if (list.length > 0) {
      setSelectedVenueId(list[0].id);
    }
  }, []);

  const handleDoctorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedVenueId) {
      setError('Please select your clinic or venue.');
      return;
    }

    // Special doctor access passcode (Default PIN: 7788 or DOCTOR123)
    const validPasscodes = ['7788', 'DOCTOR123', 'DOC2026', '1234'];
    if (!validPasscodes.includes(passcode.trim())) {
      setError('Invalid Doctor Special Passcode. Try passcode: 7788');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      sessionStorage.setItem(`doctor_auth_${selectedVenueId}`, 'true');
      router.push(`/admin/${selectedVenueId}`);
    }, 600);
  };

  return (
    <div className="app-content" style={{ justifyContent: 'center', minHeight: '80vh', padding: '16px' }}>
      <div className="card glass" style={{ padding: '32px 24px', gap: '24px', maxWidth: '440px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1',
            }}
          >
            <Stethoscope size={30} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '6px' }}>
            Doctor & Staff Portal
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem', lineHeight: '1.4' }}>
            Enter your special passcode to manage patient queues, call next numbers, and adjust service times.
          </p>
        </div>

        <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#818cf8', textAlign: 'center' }}>
          🔑 <strong>Default Passcode PIN:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>7788</span>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleDoctorLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Select Clinic / Venue *
            </label>
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0f172a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
              }}
              required
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Doctor Special Passcode *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                placeholder="Enter passcode (e.g. 7788)"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem',
                  letterSpacing: '0.1em',
                  outline: 'none',
                }}
                disabled={loading}
                required
              />
              <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Link href="/" className="btn btn-secondary" style={{ flex: 1, padding: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={16} /> Back
            </Link>
            <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Access Doctor Dashboard'} <ArrowRight size={18} />
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.75rem' }}>
          <ShieldCheck size={14} color="#10b981" /> Restrictive Doctor Passcode Gate
        </div>
      </div>
    </div>
  );
}
