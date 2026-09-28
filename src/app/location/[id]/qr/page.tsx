'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft, Building2, Smartphone, ShieldCheck, Clock, Globe, Wifi } from 'lucide-react';
import { getVenueById, syncVenuesFromDatabase, Venue } from '@/lib/venueStore';

export default function VenueQrPosterPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [customHost, setCustomHost] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState('');

  // Load venue details
  useEffect(() => {
    const v = getVenueById(id);
    if (v) {
      setVenue(v);
    } else {
      syncVenuesFromDatabase().then((list) => {
        const found = list.find((item) => item.id === id || item.id.toLowerCase() === id.toLowerCase());
        if (found) setVenue(found);
      });
    }
  }, [id]);

  // Determine initial host domain
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentOrigin = window.location.origin;
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (isLocal) {
        // If on local dev, default to public Vercel domain or local LAN IP so phones can scan it
        setSelectedHost('https://queue-estimater.vercel.app');
      } else {
        setSelectedHost(currentOrigin);
      }
    }
  }, []);

  const buildTargetUrl = useCallback(() => {
    const baseHost = customHost.trim() || selectedHost || (typeof window !== 'undefined' ? window.location.origin : 'https://queue-estimater.vercel.app');
    const cleanHost = baseHost.replace(/\/+$/, '');

    if (!venue) {
      return `${cleanHost}/location/${encodeURIComponent(id)}`;
    }

    const q = new URLSearchParams({
      name: venue.name,
      category: venue.category,
      address: venue.address,
      lat: String(venue.lat),
      lng: String(venue.lng),
      radius: String(venue.geofence_radius_m),
      avg: String(venue.avg_service_time_minutes),
    });

    return `${cleanHost}/location/${encodeURIComponent(id)}?${q.toString()}`;
  }, [id, venue, selectedHost, customHost]);

  useEffect(() => {
    setTargetUrl(buildTargetUrl());
  }, [buildTargetUrl]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-container" style={{ maxWidth: '640px' }}>
      {/* Non-printable action header */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <Link href={`/admin/${id}`} className="btn btn-secondary" style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Return to Clinical Console
        </Link>
        <button onClick={handlePrint} className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          <Printer size={16} /> Print Physical Notice
        </button>
      </div>

      {/* Host selector for mobile scanning */}
      <div className="card no-print" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <Globe size={15} color="var(--primary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Poster Host Domain for Mobile Scanners:
          </span>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
          Phones scanning printed physical QR codes must be directed to your deployed app domain or your local Wi-Fi IP (not <code style={{ color: 'var(--danger)' }}>localhost</code>).
        </p>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => { setSelectedHost('https://queue-estimater.vercel.app'); setCustomHost(''); }}
            className={`btn ${selectedHost === 'https://queue-estimater.vercel.app' && !customHost ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
          >
            <Globe size={13} /> Deployed App (Vercel)
          </button>
          <button
            type="button"
            onClick={() => { setSelectedHost('http://10.38.241.85:3000'); setCustomHost(''); }}
            className={`btn ${selectedHost === 'http://10.38.241.85:3000' && !customHost ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
          >
            <Wifi size={13} /> Local Wi-Fi (10.38.241.85)
          </button>
          <button
            type="button"
            onClick={() => { setSelectedHost(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'); setCustomHost(''); }}
            className={`btn ${selectedHost.includes('localhost') && !customHost ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
          >
            Current Browser Origin
          </button>
        </div>

        <input
          type="text"
          placeholder="Or enter custom domain e.g. https://your-domain.com"
          value={customHost}
          onChange={(e) => setCustomHost(e.target.value)}
          className="input-field"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
        />
      </div>

      {/* Printable Poster Card */}
      <div
        className="card printable-poster"
        style={{
          padding: '2.5rem 2rem',
          textAlign: 'center',
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.75rem',
        }}
      >
        <div style={{ maxWidth: '480px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            <Building2 size={14} /> CareQueue Digital Check-In Station
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            {venue?.name || 'Clinic Waiting Area'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {venue?.category ? `${venue.category} • ${venue.address}` : 'Scan with your smartphone camera to claim your triage token'}
          </p>
        </div>

        {/* QR Code Canvas */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            display: 'inline-block',
          }}
        >
          {targetUrl ? (
            <QRCodeSVG
              value={targetUrl}
              size={220}
              level="M"
              includeMargin={false}
              fgColor="#0b0f19"
            />
          ) : (
            <div style={{ width: 220, height: 220, background: '#f1f5f9', borderRadius: '8px' }} />
          )}
        </div>

        {/* Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '420px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-page)', border: '1px solid var(--border-default)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
            <Smartphone size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>1. Open camera & scan the QR code</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-page)', border: '1px solid var(--border-default)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
            <ShieldCheck size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>2. Verify with SMS OTP & receive your triage token</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-page)', border: '1px solid var(--border-default)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
            <Clock size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>3. Monitor real-time estimated wait time & audio chime</span>
          </div>
        </div>

        {/* Target URL Footer */}
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem', width: '100%', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
          Direct Link: <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{targetUrl.split('?')[0]}</span>
        </div>
      </div>

      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print, header, nav, .app-header {
            display: none !important;
          }
          .printable-poster {
            background: #ffffff !important;
            border: 2px solid #000000 !important;
            box-shadow: none !important;
            color: #000000 !important;
            padding: 2rem !important;
          }
          .printable-poster h1,
          .printable-poster span,
          .printable-poster p,
          .printable-poster div {
            color: #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}
