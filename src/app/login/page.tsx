'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Check if Supabase keys are default placeholders
    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
      process.env.NEXT_PUBLIC_SUPABASE_URL === '' || 
      !process.env.NEXT_PUBLIC_SUPABASE_URL;
    setIsDemoMode(isPlaceholder);

    // If user is already logged in, redirect to home
    const checkSession = async () => {
      const demoPhone = localStorage.getItem('demo_authenticated_phone');
      if (demoPhone) {
        router.push('/');
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.push('/');
        }
      } catch {
        // Ignore session check error
      }
    };

    checkSession();
  }, [router]);

  useEffect(() => {
    if (step === 'otp' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');

    try {
      if (isDemoMode) {
        // Simulation mode
        setTimeout(() => {
          setStep('otp');
          setLoading(false);
        }, 600);
        return;
      }

      // Format phone number to E.164 if not already (e.g. +1234567890)
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (otpError) {
        throw otpError;
      }

      setStep('otp');
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
      if (isDemoMode) {
        if (otp.trim() === '123456') {
          // Set mock user session in localStorage so client is authenticated in demo
          localStorage.setItem('demo_authenticated_phone', phone.trim() || '+1 (555) 019-2834');
          router.push('/');
        } else {
          throw new Error('Invalid OTP code. Please enter 123456 for the demo simulation.');
        }
        return;
      }

      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp.trim(),
        type: 'sms',
      });

      if (verifyError) {
        throw verifyError;
      }

      if (data?.session) {
        router.push('/');
      }
    } catch (err: unknown) {
      console.error('OTP Verification error:', err);
      const message = err instanceof Error ? err.message : 'Verification failed. Please check the code and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setPhone('+1 (555) 019-2834');
    setError('');
  };

  return (
    <>
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">⬅️</div>
          <span>Back to Home</span>
        </Link>
        <span className="badge badge-success">Secure Login</span>
      </header>

      <div className="app-content" style={{ justifyContent: 'center', minHeight: '75vh' }}>
        <div className="card glass" style={{ padding: '32px 24px', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div 
              className="brand-icon" 
              style={{ 
                width: '52px', 
                height: '52px', 
                margin: '0 auto 16px auto', 
                fontSize: '1.6rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
            >
              ⏳
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px', letterSpacing: '-0.02em' }}>
              {step === 'phone' ? 'Phone Verification' : 'Enter One-Time Code'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.4' }}>
              {step === 'phone' 
                ? 'Sign in to join a queue, track your live place in line, and receive wait notifications.' 
                : `We sent a 6-digit confirmation code to ${phone}.`}
            </p>
          </div>

          {isDemoMode && (
            <div className="notification-banner notification-banner-warning" style={{ flexDirection: 'column', gap: '6px' }}>
              <div>
                <strong>Simulation Mode Active</strong> — Supabase is running with simulated data.
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {step === 'phone' ? (
                  <span>
                    Tap below to fill a sample number, or enter any mobile number.
                  </span>
                ) : (
                  <span>
                    Use verification code <strong>123456</strong> to proceed.
                  </span>
                )}
              </div>
              {step === 'phone' && (
                <button
                  type="button"
                  onClick={fillDemoCredentials}
                  className="btn btn-secondary"
                  style={{ minHeight: '32px', height: '32px', fontSize: '0.75rem', padding: '0 10px', width: 'fit-content', marginTop: '4px' }}
                >
                  ⚡ Auto-fill Demo Phone
                </button>
              )}
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
                  placeholder="+1 (555) 019-2834"
                  className="input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>
              <button
                id="send-otp-btn"
                type="submit"
                className="btn btn-primary"
                disabled={loading || !phone.trim()}
              >
                {loading ? 'Sending Code...' : 'Send Verification OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="form-group" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="otp-input">6-Digit Code</label>
                <input
                  ref={otpInputRef}
                  id="otp-input"
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="input-field"
                  style={{ textAlign: 'center', fontSize: '1.6rem', letterSpacing: '0.25em', fontWeight: 700 }}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  disabled={loading}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  id="back-btn"
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setStep('phone');
                    setError('');
                  }}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  id="verify-otp-btn"
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
