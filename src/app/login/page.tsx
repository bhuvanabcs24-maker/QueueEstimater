'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // Check if Supabase keys are default placeholders
    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
      process.env.NEXT_PUBLIC_SUPABASE_URL === '' || 
      !process.env.NEXT_PUBLIC_SUPABASE_URL;
    setIsDemoMode(isPlaceholder);

    // If user is already logged in, redirect to home
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push('/');
      }
    });
  }, [router]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;

    setLoading(true);
    setError('');

    try {
      if (isDemoMode) {
        // Simulation mode
        setTimeout(() => {
          setStep('otp');
          setLoading(false);
        }, 800);
        return;
      }

      // Format phone number to E.164 if not already (e.g. +1234567890)
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) {
        throw error;
      }

      setStep('otp');
    } catch (err: any) {
      console.error('OTP Send error:', err);
      setError(err.message || 'Failed to send OTP code. Please check the number.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;

    setLoading(true);
    setError('');

    try {
      if (isDemoMode) {
        if (otp.trim() === '123456') {
          // Set mock user session in localStorage so client is authenticated in demo
          localStorage.setItem('demo_authenticated_phone', phone);
          router.push('/');
        } else {
          throw new Error('Invalid OTP code. Use "123456" for demo simulation.');
        }
        return;
      }

      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp.trim(),
        type: 'sms',
      });

      if (error) {
        throw error;
      }

      if (data?.session) {
        router.push('/');
      }
    } catch (err: any) {
      console.error('OTP Verification error:', err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-content" style={{ justifyContent: 'center', minHeight: '80vh' }}>
      <div className="card glass" style={{ padding: '32px 24px', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="brand-icon" style={{ width: '48px', height: '48px', margin: '0 auto 16px auto', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ⏳
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.02em' }}>
            {step === 'phone' ? 'Verify Phone' : 'Enter OTP'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
            {step === 'phone' 
              ? 'Enter your mobile number to check in or track your queue place.' 
              : `We sent a 6-digit confirmation code to ${phone}.`}
          </p>
        </div>

        {isDemoMode && (
          <div style={{ background: 'var(--warning-glow)', border: '1px solid rgba(251, 191, 36, 0.2)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--warning)' }}>
            ⚠️ <strong>Simulation Mode Active</strong><br />
            Supabase is not configured. Enter any phone and use OTP code <strong>123456</strong> to test.
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--danger-glow)', border: '1px solid rgba(248, 113, 113, 0.2)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="form-group" style={{ gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="phone-input">Mobile Number</label>
              <input
                id="phone-input"
                type="tel"
                placeholder="+1 555 019 2834"
                className="input-field"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              id="send-otp-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading || !phone}
            >
              {loading ? 'Sending Code...' : 'Send Verification OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="form-group" style={{ gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="otp-input">Verification Code</label>
              <input
                id="otp-input"
                type="text"
                maxLength={6}
                pattern="\d{6}"
                placeholder="123456"
                className="input-field"
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.25em', fontWeight: 'bold' }}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
                required
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                id="back-btn"
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setStep('phone')}
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
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
