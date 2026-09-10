'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import jsQR from 'jsqr';

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = useState('');
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
        video: { facingMode: { ideal: 'environment' } }
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
      const message = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Camera permission was denied. Please allow camera access in browser settings or use the facility code below.'
        : 'Unable to access camera hardware. You can select or type a facility code below to proceed.';
      setCameraError(message);
    }
  }, [tick]);

  useEffect(() => {
    startCamera();
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

  const handleSelectSample = (id: string) => {
    setScanning(false);
    stopCamera();
    router.push(`/location/${id}`);
  };

  return (
    <>
      {/* Header */}
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">⬅️</div>
          <span>Back to Home</span>
        </Link>
        <span className="badge badge-success">QR Scanner</span>
      </header>

      {/* Main Content */}
      <div className="app-content">
        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '6px' }}>Scan QR Code</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.4' }}>
            Aim your camera at the physical QR code displayed at the facility entrance.
          </p>
        </div>

        {/* Viewfinder scanner container */}
        {!cameraError ? (
          <div className="scanner-container">
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
          <div className="notification-banner notification-banner-warning" style={{ flexDirection: 'column', gap: '10px', padding: '16px' }}>
            <div>⚠️ {cameraError}</div>
            <button 
              onClick={startCamera} 
              className="btn btn-secondary" 
              style={{ minHeight: '36px', height: '36px', fontSize: '0.8rem', padding: '0 16px', width: 'fit-content' }}
            >
              🔄 Retry Camera
            </button>
          </div>
        )}

        {/* Manual Fallback Input */}
        <div className="card glass" style={{ marginTop: '4px', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Can't scan the QR code?</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Enter the location code printed beneath the QR code, or pick a sample location:
            </p>
          </div>

          <form onSubmit={handleManualSubmit} className="form-group" style={{ flexDirection: 'row', gap: '8px' }}>
            <input
              id="manual-code-input"
              type="text"
              placeholder="e.g. mock-clinic-a"
              className="input-field"
              style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem' }}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <button
              id="manual-submit-btn"
              type="submit"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '10px 20px', fontSize: '0.9rem' }}
              disabled={!manualCode.trim()}
            >
              Go
            </button>
          </form>

          {/* Quick preset buttons for viva evaluation without a printed QR code */}
          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              Quick Test Presets:
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleSelectSample('mock-clinic-a')}
                className="btn btn-secondary"
                style={{ 
                  minHeight: '32px', 
                  height: '32px', 
                  padding: '0 10px', 
                  fontSize: '0.75rem', 
                  width: 'auto',
                  background: 'rgba(255,255,255,0.04)' 
                }}
              >
                🏥 General Clinic A
              </button>
              <button
                type="button"
                onClick={() => handleSelectSample('mock-lab-b')}
                className="btn btn-secondary"
                style={{ 
                  minHeight: '32px', 
                  height: '32px', 
                  padding: '0 10px', 
                  fontSize: '0.75rem', 
                  width: 'auto',
                  background: 'rgba(255,255,255,0.04)' 
                }}
              >
                🔬 Express Lab B
              </button>
              <button
                type="button"
                onClick={() => handleSelectSample('mock-peds-c')}
                className="btn btn-secondary"
                style={{ 
                  minHeight: '32px', 
                  height: '32px', 
                  padding: '0 10px', 
                  fontSize: '0.75rem', 
                  width: 'auto',
                  background: 'rgba(255,255,255,0.04)' 
                }}
              >
                👶 Pediatrics C
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
