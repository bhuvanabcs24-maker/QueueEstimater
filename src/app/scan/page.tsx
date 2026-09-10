'use client';

import React, { useRef, useState, useEffect } from 'react';
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

  useEffect(() => {
    // Start camera stream on mount
    startCamera();

    return () => {
      // Release camera resources on unmount
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError('');
    try {
      const constraints = {
        video: { facingMode: 'environment' } // Prefer rear camera on mobile
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS Safari
        videoRef.current.play();
        requestAnimationFrame(tick);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        'Unable to access camera. Please grant camera permission or use the manual code input below.'
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const tick = () => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Make sure video is ready and has valid dimensions
    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        // Stop scanning and camera
        setScanning(false);
        stopCamera();

        // Extract location ID. Standard format in QR:
        // https://yourapp.com/location/[id] or just the raw ID
        let locationId = code.data;
        if (code.data.includes('/location/')) {
          const parts = code.data.split('/location/');
          locationId = parts[parts.length - 1].split('?')[0]; // Extract UUID/ID part
        }

        // Vibrate to provide haptic feedback if supported
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }

        // Navigate to the scanned location detail page
        router.push(`/location/${locationId}`);
        return;
      }
    }

    requestAnimationFrame(tick);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setScanning(false);
    stopCamera();
    router.push(`/location/${manualCode.trim()}`);
  };

  return (
    <>
      {/* Header */}
      <header className="app-header glass">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-icon">⬅️</div>
          <span>Back to Home</span>
        </Link>
        <span className="badge badge-success">Live Scan</span>
      </header>

      {/* Main Content */}
      <div className="app-content">
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>Scan QR Code</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Position the clinic QR code inside the frame to check in automatically.
          </p>
        </div>

        {/* Viewfinder scanner block */}
        {!cameraError ? (
          <div className="scanner-container">
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            {/* Premium animating scan target */}
            <div className="scanner-overlay">
              <div className="scanner-target">
                <div className="scanner-laser" />
              </div>
            </div>
          </div>
        ) : (
          <div 
            style={{ 
              background: 'var(--danger-glow)', 
              border: '1px solid rgba(248, 113, 113, 0.2)', 
              padding: '24px 16px', 
              borderRadius: 'var(--radius-lg)', 
              textAlign: 'center',
              fontSize: '0.9rem',
              color: 'var(--danger)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div>⚠️ {cameraError}</div>
            <button onClick={startCamera} className="btn btn-secondary" style={{ width: 'fit-content', margin: '0 auto', fontSize: '0.8rem', padding: '8px 16px' }}>
              🔄 Try Camera Again
            </button>
          </div>
        )}

        {/* Manual Fallback Input */}
        <div className="card glass" style={{ marginTop: '8px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700' }}>Can't scan the code?</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-4px' }}>
            Enter the clinic ID code shown at the bottom of the QR code printout.
          </p>

          <form onSubmit={handleManualSubmit} className="form-group" style={{ flexDirection: 'row', gap: '8px', marginTop: '4px' }}>
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
              style={{ width: 'auto', padding: '10px 18px', fontSize: '0.9rem' }}
              disabled={!manualCode.trim()}
            >
              Go
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
