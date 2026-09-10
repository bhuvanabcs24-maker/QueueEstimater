'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft } from 'lucide-react';
import { getVenueById, Venue } from '@/lib/venueStore';

export default function VenueQrPosterPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [targetUrl, setTargetUrl] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);

  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://queueflow.app';
    setTargetUrl(`${origin}/location/${id}`);

    const v = getVenueById(id);
    setVenue(v);
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '520px', margin: '0 auto' }}>
      {/* Non-printable action header */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href={`/admin/${id}`} className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: '0.85rem', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Doctor Portal
        </Link>
        <button onClick={handlePrint} className="btn btn-primary" style={{ width: 'auto', padding: '10px 18px', fontSize: '0.9rem' }}>
          <Printer size={18} /> Print Poster
        </button>
      </div>

      {/* Printable Poster Card */}
      <div
        className="card glass printable-poster"
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          background: '#0f172a',
          borderColor: 'rgba(99, 102, 241, 0.4)',
          borderRadius: '24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent-primary, #6366f1)' }}>
            OFFICIAL QUEUE CHECK-IN
          </span>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {venue?.name || 'Clinic Location'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '6px' }}>
            {venue?.category ? `${venue.category} • ${venue.address}` : 'Scan to check in & track live queue wait time'}
          </p>
        </div>

        {/* QR Code Canvas */}
        <div
          style={{
            background: '#ffffff',
            padding: '24px',
            borderRadius: '20px',
            boxShadow: '0 12px 32px rgba(99, 102, 241, 0.25)',
            display: 'inline-block',
          }}
        >
          {targetUrl ? (
            <QRCodeSVG
              value={targetUrl}
              size={240}
              level="H"
              includeMargin={false}
              fgColor="#0f172a"
            />
          ) : (
            <div style={{ width: 240, height: 240, background: '#f1f5f9', borderRadius: '12px' }} />
          )}
        </div>

        {/* Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', textAlign: 'left' }}>
            <span style={{ fontWeight: 800, color: 'var(--accent-primary, #6366f1)', fontSize: '1.1rem' }}>1</span>
            <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>Point phone camera at QR code</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', textAlign: 'left' }}>
            <span style={{ fontWeight: 800, color: 'var(--accent-primary, #6366f1)', fontSize: '1.1rem' }}>2</span>
            <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>Tap link & enter phone number</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', textAlign: 'left' }}>
            <span style={{ fontWeight: 800, color: 'var(--accent-primary, #6366f1)', fontSize: '1.1rem' }}>3</span>
            <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>Track live queue spot & wait time</span>
          </div>
        </div>

        {/* Target URL Footer */}
        <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '16px', width: '100%', fontSize: '0.75rem', color: '#64748b' }}>
          Direct Link: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{targetUrl || `/location/${id}`}</span>
        </div>
      </div>

      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print, .top-nav, .bottom-bar {
            display: none !important;
          }
          .printable-poster {
            background: #ffffff !important;
            border: 2px solid #000000 !important;
            box-shadow: none !important;
            color: #000000 !important;
          }
          .printable-poster h1, .printable-poster span, .printable-poster p {
            color: #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}
