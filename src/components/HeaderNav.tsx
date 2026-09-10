'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, LogOut, Phone, ShieldCheck, ChevronDown, UserCheck, X, Stethoscope } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function HeaderNav() {
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const fullName = session.user.user_metadata?.full_name || 'Registered User';
          const phoneNum = session.user.phone || '+91 User';
          setUserName(fullName);
          setUserPhone(phoneNum);
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
      await supabase.auth.signOut();
    }
    setUserName(null);
    setUserPhone(null);
    setShowModal(false);
    window.location.href = '/';
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Link href="/doctor" style={{ fontSize: '0.8rem', color: '#818cf8', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)', padding: '5px 10px', borderRadius: '9999px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Stethoscope size={14} /> Doctor
      </Link>
      <Link href="/my-queue" className="nav-link" style={{ fontSize: '0.85rem' }}>
        <span className="pulse-dot" style={{ display: 'inline-block', marginRight: '6px' }}></span>
        My Spot
      </Link>

      {userName ? (
        <button
          onClick={() => setShowModal(!showModal)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '6px 12px',
            borderRadius: '9999px',
            color: '#fff',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <User size={15} color="#6366f1" />
          <span>{userName}</span>
          <ChevronDown size={14} style={{ opacity: 0.7, transform: showModal ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </button>
      ) : (
        <Link
          href="/login"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <UserCheck size={16} />
          Login
        </Link>
      )}

      {/* Personal Info Profile Modal Dropdown */}
      {showModal && userName && (
        <div
          ref={modalRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '280px',
            background: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            padding: '16px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              Personal Info
            </span>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                <User size={20} />
              </div>
              <div>
                <b style={{ fontSize: '0.95rem', display: 'block' }}>{userName}</b>
                <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} /> Verified Account
                </span>
              </div>
            </div>

            {userPhone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <Phone size={14} color="#94a3b8" />
                <span>{userPhone}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            style={{
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#ef4444',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            <LogOut size={16} /> Log Out
          </button>
        </div>
      )}
    </div>
  );
}
