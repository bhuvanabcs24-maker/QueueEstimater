'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft, Building2, Smartphone, ShieldCheck, Clock } from 'lucide-react';
import { getVenueById, Venue } from '@/lib/venueStore';

export default function VenueQrPosterPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [targetUrl, setTargetUrl] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);

  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://carequeue.local';
    setTargetUrl(`${origin}/location/${id}`);

    const v = getVenueById(id);
    setVenue(v);
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-container" style={{ maxWidth: '640px' }}>
      {/* Non-printable action header */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <Link href={`/admin/${id}`} className="btn btn-secondary" style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Return to Clinical Console
        </Link>
        <button onClick={handlePrint} className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          <Printer size={16} /> Print Physical Notice
        </button>
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
              level="H"
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
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem', width: '100%', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Direct Web Check-in: <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{targetUrl || `/location/${id}`}</span>
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
