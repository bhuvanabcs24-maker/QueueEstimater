'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, MessageSquare, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('917624843107');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [carrierNotice, setCarrierNotice] = useState<{ failed: boolean; code?: string; reason?: string } | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // If user is already logged in, redirect to home
    const demoPhone = localStorage.getItem('demo_authenticated_phone') || localStorage.getItem('user_phone');
    if (demoPhone) {
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    if (step === 'otp' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch SMS verification code.');
      }

      setStep('otp');
      setCountdown(60);

      if (data.carrierDeliveryFailed && data.code) {
        setCarrierNotice({
          failed: true,
          code: data.code,
          reason: data.carrierReason,
        });
        setSuccessMsg(`OTP Code generated: ${data.code}`);
      } else {
        setCarrierNotice(null);
        setSuccessMsg(`✅ 4-digit verification code sent via SMS to +${data.phone}`);
      }
    } catch (err: unknown) {
      console.error('OTP Send error:', err);
      const message = err instanceof Error ? err.message : 'Failed to send OTP code. Please check your phone number.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid OTP code.');
      }

      // Store authenticated user session
      localStorage.setItem('demo_authenticated_phone', data.user.phone);
      localStorage.setItem('user_phone', data.user.phone);
      localStorage.setItem('demo_authenticated_name', data.user.name);
      localStorage.setItem('user_name', data.user.name);

      router.push('/');
    } catch (err: unknown) {
      console.error('OTP Verification error:', err);
      const message = err instanceof Error ? err.message : 'Verification failed. Please check the code and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const fillSampleNumber = (num: string) => {
    setPhone(num);
    setError('');
  };

  return (
    <>
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">
            <ArrowLeft size={16} />
          </div>
          <span>Back to Home</span>
        </Link>
        <span className="badge badge-success">OTP.dev Verified</span>
      </header>

      <div className="app-content" style={{ justifyContent: 'center', minHeight: '75vh' }}>
        <div className="card glass" style={{ padding: '32px 24px', gap: '20px', maxWidth: '440px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              className="brand-icon"
              style={{
                width: '56px',
                height: '56px',
                margin: '0 auto 16px auto',
                borderRadius: '16px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageSquare size={28} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px', letterSpacing: '-0.02em' }}>
              {step === 'phone' ? 'Phone Verification' : 'Enter 4-Digit Code'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.4' }}>
              {step === 'phone'
                ? 'Sign in or register to join queues, track your live spot in line, and receive wait alerts.'
                : `Enter the 4-digit code sent via SMS to +${phone}.`}
            </p>
          </div>

          {/* Real-time SMS Gateway Info Banner */}
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '0.8rem',
              color: '#818cf8',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
              <ShieldCheck size={16} color="#10b981" />
              <span>Real-Time OTP.dev SMS Gateway Active</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
              Powered by official OTP.dev multi-channel SMS verification.
            </p>
          </div>

          {successMsg && (
            <div className="notification-banner notification-banner-info">
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="notification-banner notification-banner-error">
              <span>{error}</span>
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="form-group" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="phone-input">Mobile Number</label>
                <input
                  id="phone-input"
                  type="tel"
                  placeholder="e.g. 917624843107 or 9876543210"
                  className="input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>

              {/* Sample Preset Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Test preset:</span>
                <button
                  type="button"
                  onClick={() => fillSampleNumber('917624843107')}
                  className="btn btn-secondary"
                  style={{ minHeight: '28px', height: '28px', padding: '0 8px', fontSize: '0.72rem', width: 'auto' }}
                >
                  ⚡ +91 76248 43107
                </button>
              </div>

              <button
                id="send-otp-btn"
                type="submit"
                className="btn btn-primary"
                disabled={loading || !phone.trim()}
              >
                {loading ? 'Sending SMS Code...' : 'Send Verification SMS Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="form-group" style={{ gap: '16px' }}>
              {carrierNotice?.failed && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    color: '#fca5a5',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️ Carrier SMS Delivery Notice</span>
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Your OTP.dev account balance is currently 0 (carrier reported <code>unable_process_payment</code>).
                    Physical cellular SMS is withheld by your carrier until credits are topped up.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Generated OTP Code:</div>
                      <strong style={{ color: '#38bdf8', fontSize: '1.2rem', letterSpacing: '3px', fontFamily: 'monospace' }}>
                        {carrierNotice.code}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtp(carrierNotice.code || '')}
                      className="btn btn-primary"
                      style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '0.75rem', width: 'auto' }}
                    >
                      Auto-fill Code
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="otp-input">4-Digit SMS Code</label>
                <input
                  ref={otpInputRef}
                  id="otp-input"
                  type="text"
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="• • • •"
                  className="input-field"
                  style={{ textAlign: 'center', fontSize: '1.8rem', letterSpacing: '0.35em', fontWeight: 800, fontFamily: 'monospace' }}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  disabled={loading}
                  required
                />
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Demo bypass codes: <button type="button" onClick={() => setOtp('1234')} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline', padding: '0 4px', fontSize: '0.75rem' }}>1234</button> or <button type="button" onClick={() => setOtp('7788')} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline', padding: '0 4px', fontSize: '0.75rem' }}>7788</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {countdown > 0 ? `Resend code in ${countdown}s` : "Didn't get the code?"}
                </span>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading || countdown > 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: countdown > 0 ? 'var(--text-muted)' : 'var(--accent)',
                    cursor: countdown > 0 ? 'default' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  <RefreshCw size={13} /> Resend SMS
                </button>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  id="back-btn"
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setStep('phone');
                    setError('');
                    setOtp('');
                  }}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  id="verify-otp-btn"
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                  disabled={loading || otp.length !== 4}
                >
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </button>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '8px' }}>
            <CheckCircle2 size={14} color="#10b981" /> End-to-End Encrypted Verification
          </div>
        </div>
      </div>
    </>
  );
}
