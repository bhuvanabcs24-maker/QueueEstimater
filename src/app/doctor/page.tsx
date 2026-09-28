'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Stethoscope, Lock, ArrowRight, ShieldCheck, ArrowLeft, MessageSquare, RefreshCw, KeyRound, Trash2 } from 'lucide-react';
import { getAllVenues, syncVenuesFromDatabase, deleteVenue, Venue } from '@/lib/venueStore';

export default function DoctorLoginPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [authMethod, setAuthMethod] = useState<'otp' | 'passcode'>('otp');

  // OTP state
  const [phone, setPhone] = useState('917624843107');
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [countdown, setCountdown] = useState(0);

  // Passcode state
  const [passcode, setPasscode] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const list = getAllVenues();
    setVenues(list);
    if (list.length > 0) {
      setSelectedVenueId(list[0].id);
    }

    // Sync real database venues
    syncVenuesFromDatabase().then((dbList) => {
      if (dbList && dbList.length > 0) {
        setVenues(dbList);
        setSelectedVenueId((prev) => prev || dbList[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (otpStep === 'code' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpStep]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendDoctorOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), role: 'doctor' }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch Doctor SMS verification code.');
      }

      setOtpStep('code');
      setCountdown(60);
      setSuccessMsg(`Verification code sent via SMS to +${data.phone}`);
    } catch (err: unknown) {
      console.error('Doctor OTP Send error:', err);
      const message = err instanceof Error ? err.message : 'Failed to send OTP code.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDoctorOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;

    if (!selectedVenueId) {
      setError('Please select your clinic or department.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          code: otp.trim(),
          role: 'doctor',
          venueId: selectedVenueId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid doctor verification code.');
      }

      sessionStorage.setItem(`doctor_auth_${selectedVenueId}`, 'true');
      sessionStorage.setItem('doctor_phone', data.user.phone);
      router.push(`/admin/${selectedVenueId}`);
    } catch (err: unknown) {
      console.error('Doctor OTP verification error:', err);
      const message = err instanceof Error ? err.message : 'Verification failed.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasscodeLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedVenueId) {
      setError('Please select your clinic or department.');
      return;
    }

    const validPasscodes = ['7788', 'DOCTOR123', 'DOC2026', '1234'];
    if (!validPasscodes.includes(passcode.trim())) {
      setError('Invalid Doctor Passcode. Try PIN: 7788');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      sessionStorage.setItem(`doctor_auth_${selectedVenueId}`, 'true');
      router.push(`/admin/${selectedVenueId}`);
    }, 400);
  };

  return (
    <>
      <header className="app-header">
        <div className="header-container">
          <Link href="/" className="brand-link">
            <ArrowLeft size={18} />
            <span>CareQueue Directory</span>
          </Link>
          <span className="badge badge-neutral">Staff Workstation</span>
        </div>
      </header>

      <main className="page-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '75vh' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px 28px' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
              }}
            >
              <Stethoscope size={24} />
            </div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Medical Staff Portal
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Authenticate to manage live patient queues and triage numbers.
            </p>
          </div>

          {/* Department Selection */}
          <div className="form-group" style={{ marginTop: '8px' }}>
            <label className="form-label" htmlFor="clinic-select">Select Department / Counter</label>
            {venues.length > 0 ? (
              <>
                <select
                  id="clinic-select"
                  value={selectedVenueId}
                  onChange={(e) => setSelectedVenueId(e.target.value)}
                  className="input-field"
                  required
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.category})
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    ID: <code style={{ fontFamily: 'monospace' }}>{selectedVenueId}</code>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const targetVenue = venues.find((v) => v.id === selectedVenueId);
                      if (!targetVenue) return;
                      const ok = window.confirm(`Permanently delete "${targetVenue.name}"?\n\nThis will remove the facility from all directories and clear queue data.`);
                      if (!ok) return;
                      await deleteVenue(targetVenue.id);
                      const updated = venues.filter((v) => v.id !== targetVenue.id);
                      setVenues(updated);
                      if (updated.length > 0) setSelectedVenueId(updated[0].id);
                      else setSelectedVenueId('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--status-danger, #ef4444)',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 4px',
                    }}
                    title="Delete this facility"
                  >
                    <Trash2 size={12} />
                    <span>Delete Facility</span>
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  fontSize: '0.8rem',
                  color: 'var(--warning)',
                  lineHeight: 1.4,
                }}
              >
                No facilities registered in the database yet.{' '}
                <Link href="/venue/register" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>
                  Register your facility first →
                </Link>
              </div>
            )}
          </div>

          {/* Method Tabs */}
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
            <button
              type="button"
              onClick={() => { setAuthMethod('otp'); setError(''); }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: authMethod === 'otp' ? 'var(--brand-primary)' : 'transparent',
                color: authMethod === 'otp' ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <MessageSquare size={13} />
              <span>SMS OTP</span>
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod('passcode'); setError(''); }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: authMethod === 'passcode' ? 'var(--brand-primary)' : 'transparent',
                color: authMethod === 'passcode' ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <KeyRound size={13} />
              <span>Passcode PIN</span>
            </button>
          </div>

          {successMsg && (
            <div className="alert-banner alert-banner-info">
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="alert-banner alert-banner-error">
              <span>{error}</span>
            </div>
          )}

          {/* Method 1: Real-time SMS OTP */}
          {authMethod === 'otp' && (
            <div>
              {otpStep === 'phone' ? (
                <form onSubmit={handleSendDoctorOtp} className="form-group" style={{ gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-phone">Registered Mobile Number</label>
                    <input
                      id="doctor-phone"
                      type="tel"
                      placeholder="e.g. 917624843107"
                      className="input-field"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || !phone.trim()}
                  >
                    <span>{loading ? 'Dispatching SMS...' : 'Send Verification SMS'}</span>
                    <ArrowRight size={15} />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyDoctorOtp} className="form-group" style={{ gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-otp">Enter 4-Digit Verification Code</label>
                    <input
                      ref={otpInputRef}
                      id="doctor-otp"
                      type="text"
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="• • • •"
                      className="input-field"
                      style={{ textAlign: 'center', fontSize: '1.6rem', letterSpacing: '0.3em', fontWeight: 700 }}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {countdown > 0 ? `Resend in ${countdown}s` : "Didn't receive SMS?"}
                    </span>
                    <button
                      type="button"
                      onClick={handleSendDoctorOtp}
                      disabled={loading || countdown > 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: countdown > 0 ? 'var(--text-muted)' : 'var(--brand-primary)',
                        cursor: countdown > 0 ? 'default' : 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RefreshCw size={12} /> Resend
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => { setOtpStep('phone'); setOtp(''); setError(''); }}
                      disabled={loading}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                      disabled={loading || otp.length !== 4}
                    >
                      <span>{loading ? 'Verifying...' : 'Access Station'}</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Method 2: Passcode PIN */}
          {authMethod === 'passcode' && (
            <form onSubmit={handlePasscodeLogin} className="form-group" style={{ gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="passcode-input">Staff Passcode PIN</label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={16}
                    color="#64748b"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    id="passcode-input"
                    type="password"
                    placeholder="Enter PIN (e.g. 7788)"
                    className="input-field"
                    style={{ paddingLeft: '38px' }}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Default department access PIN: <strong style={{ color: 'var(--text-primary)' }}>7788</strong>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                <span>{loading ? 'Authenticating...' : 'Access Staff Station'}</span>
                <ArrowRight size={15} />
              </button>
            </form>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '6px' }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>Authorized Medical Personnel Gate</span>
          </div>
        </div>
      </main>
    </>
  );
}
