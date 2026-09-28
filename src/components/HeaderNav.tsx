'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, LogOut, ChevronDown, UserCheck, X, Stethoscope, Ticket } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useRealtimeQueue } from '@/lib/useRealtimeQueue';

export default function HeaderNav() {
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const { connected } = useRealtimeQueue();

  useEffect(() => {
    const checkUser = async () => {
      const storedName = localStorage.getItem('demo_authenticated_name') || localStorage.getItem('user_name');
      const storedPhone = localStorage.getItem('demo_authenticated_phone') || localStorage.getItem('user_phone');

      if (storedName || storedPhone) {
        setUserName(storedName || 'Registered User');
        setUserPhone(storedPhone || '+91 User');
        return;
      }

      if (isSupabaseConfigured) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const fullName = session.user.user_metadata?.full_name || 'Registered User';
            const phoneNum = session.user.phone || '+91 User';
            setUserName(fullName);
            setUserPhone(phoneNum);
          }
        } catch {
          // Ignore
        }
      }
    };

    checkUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
      }
    };
    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModal]);

  const handleLogout = async () => {
    localStorage.removeItem('demo_authenticated_name');
    localStorage.removeItem('demo_authenticated_phone');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('demo_active_check_in');
    localStorage.removeItem('active_queue');
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore
      }
    }
    setUserName(null);
    setUserPhone(null);
    setShowModal(false);
    window.location.href = '/';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {/* Live Synchronization Status Indicator */}
      <div
        title={connected ? 'Connected to live real-time hospital event stream' : 'Establishing stream connection...'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: 'var(--radius-pill)',
          backgroundColor: connected ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
          border: `1px solid ${connected ? 'var(--status-success-border)' : 'var(--status-warning-border)'}`,
          color: connected ? 'var(--status-success)' : 'var(--status-warning)',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: connected ? 'var(--status-success)' : 'var(--status-warning)',
            display: 'inline-block',
          }}
          className={connected ? 'pulse' : ''}
        />
        <span>{connected ? 'Live Sync' : 'Connecting'}</span>
      </div>

      {/* Navigation Links */}
      <Link
        href="/my-queue"
        className="btn btn-secondary"
        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
      >
        <Ticket size={14} />
        <span>My Ticket</span>
      </Link>

      <Link
        href="/doctor"
        className="btn btn-secondary"
        style={{
          padding: '6px 12px',
          fontSize: '0.82rem',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderColor: 'rgba(37, 99, 235, 0.3)',
          color: '#60a5fa',
        }}
      >
        <Stethoscope size={14} />
        <span>Staff Portal</span>
      </Link>

      {/* User Login or Profile Menu */}
      {userName ? (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowModal(!showModal)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-default)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <User size={14} color="#94a3b8" />
            <span>{userName}</span>
            <ChevronDown size={14} style={{ opacity: 0.6 }} />
          </button>

          {/* Profile Dropdown */}
          {showModal && (
            <div
              ref={modalRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '240px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  User Account
                </span>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>

              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{userName}</div>
                {userPhone && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {userPhone}
                  </div>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="btn btn-outline-danger"
                style={{ width: '100%', padding: '8px', fontSize: '0.82rem' }}
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          )}
        </div>
      ) : (
        <Link
          href="/login"
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.82rem' }}
        >
          <UserCheck size={15} />
          <span>Sign In</span>
        </Link>
      )}
    </div>
  );
}
