'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, RefreshCw, AlertCircle, Building2, Search } from 'lucide-react';
import jsQR from 'jsqr';
import { getAllVenues, syncVenuesFromDatabase, Venue } from '@/lib/venueStore';

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [registeredVenues, setRegisteredVenues] = useState<Venue[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        setScanning(false);
        stopCamera();

        // Extract location ID from URL or raw ID
        let locationId = code.data.trim();
        if (locationId.includes('/location/')) {
          const parts = locationId.split('/location/');
          locationId = parts[parts.length - 1].split('?')[0];
        }

        if (navigator.vibrate) {
          navigator.vibrate(150);
        }

        router.push(`/location/${encodeURIComponent(locationId)}`);
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [scanning, stopCamera, router]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setScanning(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by your current browser.');
      }

      const constraints = {
        video: { facingMode: { ideal: 'environment' } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    } catch (err: unknown) {
      console.warn('Camera initialization error:', err);
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission denied. Enable camera access in your browser settings or enter the clinic ID below.'
          : 'Camera hardware is busy or unavailable. You can enter or select a facility ID below.';
      setCameraError(message);
    }
  }, [tick]);

  useEffect(() => {
    startCamera();
    const local = getAllVenues();
    setRegisteredVenues(local);

    syncVenuesFromDatabase().then((dbVenues) => {
      if (dbVenues && dbVenues.length > 0) {
        setRegisteredVenues(dbVenues);
      }
    });

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setScanning(false);
    stopCamera();
    router.push(`/location/${encodeURIComponent(manualCode.trim())}`);
  };

  const handleSelectVenue = (id: string) => {
    setScanning(false);
    stopCamera();
    router.push(`/location/${encodeURIComponent(id)}`);
  };

  return (
    <div className="page-container" style={{ maxWidth: '640px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <Link href="/" className="btn btn-secondary" style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Back to Directory
        </Link>
        <span className="badge badge-primary">
          <Camera size={13} /> Optical Check-in
        </span>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
          Scan Facility QR Code
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Position the hospital or clinic desk QR code within the frame to automatically load queue check-in.
        </p>
      </div>

      {/* Viewfinder scanner container */}
      {!cameraError ? (
        <div
          className="scanner-container"
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-default)',
            background: '#000',
            overflow: 'hidden',
            aspectRatio: '4 / 3',
            position: 'relative',
            marginBottom: '1.5rem',
          }}
        >
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
            playsInline
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Animating scan target */}
          <div className="scanner-overlay">
            <div className="scanner-target">
              <div className="scanner-laser" />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            borderColor: 'rgba(245, 158, 11, 0.3)',
            background: 'rgba(245, 158, 11, 0.05)',
            marginBottom: '1.5rem',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <AlertCircle size={20} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--warning)', marginBottom: '0.25rem' }}>
                Camera Unavailable
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                {cameraError}
              </p>
              <button
                onClick={startCamera}
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
              >
                <RefreshCw size={14} /> Retry Camera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Fallback Input */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          Manual Facility ID Entry
        </h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Enter the alphanumeric facility code printed beneath the QR poster:
        </p>

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input
            id="manual-code-input"
            type="text"
            placeholder="e.g. mock-clinic-a"
            className="input-field"
            style={{ flex: 1 }}
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button
            id="manual-submit-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: 'auto', padding: '0.65rem 1.25rem' }}
            disabled={!manualCode.trim()}
          >
            <Search size={16} /> Open
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem' }}>
            Registered Facilities:
          </div>
          {registeredVenues.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
              {registeredVenues.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVenue(v.id)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem', justifyContent: 'flex-start', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={v.name}
                >
                  <Building2 size={15} color="var(--primary)" style={{ flexShrink: 0 }} /> {v.name}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              No facilities registered in the database yet.{' '}
              <Link href="/venue/register" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>
                Register a new facility →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
