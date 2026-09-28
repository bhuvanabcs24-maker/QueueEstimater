'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { Venue } from '@/lib/venueStore';
import { MapPin, KeyRound } from 'lucide-react';

interface VenueMapProps {
  venues: Venue[];
  userLat?: number;
  userLng?: number;
}

interface GoogleMapInstance {
  setCenter: (latLng: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: unknown) => void;
}

interface GoogleMarkerInstance {
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (latLng: { lat: number; lng: number }) => void;
  addListener: (event: string, handler: () => void) => void;
}

interface GoogleMapsSDK {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  InfoWindow: new (options: Record<string, unknown>) => { open: (map: GoogleMapInstance, marker: GoogleMarkerInstance) => void };
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
  Point: new (x: number, y: number) => unknown;
  SymbolPath: { CIRCLE: unknown };
}

declare global {
  interface Window {
    google?: {
      maps?: GoogleMapsSDK;
    };
    initGoogleMapCallback?: () => void;
  }
}

export default function VenueMap({ venues, userLat, userLng }: VenueMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const userMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const [apiKey, setApiKey] = useState<string>(
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  );
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  // Check localStorage for a custom saved key
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('google_maps_custom_api_key');
      if (savedKey) {
        setApiKey(savedKey);
      }
    }
  }, []);

  const handleSaveCustomKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempKey.trim()) {
      localStorage.setItem('google_maps_custom_api_key', tempKey.trim());
      setApiKey(tempKey.trim());
      setShowKeyModal(false);
      setScriptError(false);
      window.location.reload();
    }
  };

  // Compute default center
  const defaultCenter = useMemo(() => ({
    lat: userLat ?? (venues[0]?.lat || 12.9716),
    lng: userLng ?? (venues[0]?.lng || 77.5946),
  }), [userLat, userLng, venues]);

  // Load Google Maps Script
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.maps) {
      setMapLoaded(true);
      return;
    }

    const scriptId = 'google-maps-api-script';
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = scriptId;
    const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?loading=async${keyParam}&libraries=places,geometry&callback=initGoogleMapCallback`;
    script.async = true;
    script.defer = true;

    window.initGoogleMapCallback = () => {
      setMapLoaded(true);
      setScriptError(false);
    };

    script.onerror = () => {
      console.warn('Google Maps script failed to load or key unauthorized.');
      setScriptError(true);
    };

    document.head.appendChild(script);

    return () => {
      window.initGoogleMapCallback = undefined;
    };
  }, [apiKey]);

  // Initialize or update Google Map
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapLoaded || !maps || !mapContainerRef.current) return;

    try {
      if (!mapInstanceRef.current) {
        const map = new maps.Map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: venues.length > 0 ? 13 : 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#111827' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
            {
              featureType: 'administrative.locality',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#cbd5e1' }],
            },
            {
              featureType: 'poi',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#64748b' }],
            },
            {
              featureType: 'poi.park',
              elementType: 'geometry',
              stylers: [{ color: '#1e293b' }],
            },
            {
              featureType: 'road',
              elementType: 'geometry',
              stylers: [{ color: '#1e293b' }],
            },
            {
              featureType: 'road',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#0f172a' }],
            },
            {
              featureType: 'road',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#94a3b8' }],
            },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#0b0f19' }],
            },
          ],
        });

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;
      const bounds = new maps.LatLngBounds();
      let hasPoints = false;

      // 1. Clear old venue markers
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      // 2. Add User GPS Marker
      if (typeof userLat === 'number' && typeof userLng === 'number') {
        const userPos = { lat: userLat, lng: userLng };
        bounds.extend(userPos);
        hasPoints = true;

        if (userMarkerRef.current) {
          userMarkerRef.current.setPosition(userPos);
        } else {
          userMarkerRef.current = new maps.Marker({
            position: userPos,
            map,
            title: 'Your Current Location',
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#2563eb',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            },
          });

          const userWindow = new maps.InfoWindow({
            content: `
              <div style="font-family: system-ui; padding: 4px; color: #0f172a;">
                <b style="font-size: 13px;">📍 Your Current Location</b>
              </div>
            `,
          });

          userMarkerRef.current.addListener('click', () => {
            userWindow.open(map, userMarkerRef.current!);
          });
        }
      }

      // 3. Add Real Registered Venue Markers
      venues.forEach((v) => {
        const venuePos = { lat: v.lat, lng: v.lng };
        bounds.extend(venuePos);
        hasPoints = true;

        const queueLen = v.current_queue_length ?? 0;
        const waitMins = Math.round(queueLen * (v.avg_service_time_minutes || 5));

        let markerColor = '#10b981'; // Green
        if (waitMins >= 45) {
          markerColor = '#ef4444'; // Red
        } else if (waitMins >= 20) {
          markerColor = '#f59e0b'; // Amber
        }

        const marker = new maps.Marker({
          position: venuePos,
          map,
          title: v.name,
          icon: {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            fillColor: markerColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1.8,
            anchor: new maps.Point(12, 22),
          },
        });

        const infoContent = `
          <div style="font-family: system-ui, -apple-system, sans-serif; padding: 8px; min-width: 200px; color: #0f172a;">
            <div style="font-size: 11px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">
              ${v.category}
            </div>
            <div style="font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #0f172a;">
              ${v.name}
            </div>
            <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
              ${v.address}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 12px;">
              <span style="font-weight: 600; color: ${markerColor};">
                ~${waitMins}m wait (${queueLen} in line)
              </span>
              <a href="/location/${encodeURIComponent(v.id)}" style="
                background: #2563eb;
                color: #ffffff;
                text-decoration: none;
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: 600;
                font-size: 11px;
              ">
                Check In
              </a>
            </div>
          </div>
        `;

        const infoWindow = new maps.InfoWindow({
          content: infoContent,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        markersRef.current.push(marker);
      });

      // Fit bounds if we have points
      if (hasPoints && venues.length > 1) {
        map.fitBounds(bounds);
      } else if (venues.length === 1) {
        map.setCenter({ lat: venues[0].lat, lng: venues[0].lng });
        map.setZoom(14);
      }
    } catch (err) {
      console.warn('Google Maps rendering notice:', err);
    }
  }, [mapLoaded, venues, userLat, userLng, defaultCenter]);

  // Google Maps fallback view
  const renderFallbackMap = () => {
    const centerLat = userLat ?? (venues[0]?.lat || 12.9716);
    const centerLng = userLng ?? (venues[0]?.lng || 77.5946);
    const embedQuery =
      venues.length > 0
        ? encodeURIComponent(`${venues[0].lat},${venues[0].lng}`)
        : encodeURIComponent(`${centerLat},${centerLng}`);

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          title="Google Map Live View"
          width="100%"
          height="100%"
          style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg)' }}
          loading="lazy"
          src={`https://maps.google.com/maps?q=${embedQuery}&t=m&z=13&output=embed&iwloc=near`}
        />
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(17, 24, 39, 0.92)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            backdropFilter: 'blur(8px)',
            zIndex: 10,
          }}
        >
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#2563eb' }} />
          Google Maps Live View
          <button
            onClick={() => setShowKeyModal(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: 0,
            }}
          >
            <KeyRound size={12} /> Set API Key
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '300px',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Top Google Maps bar */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 5,
          background: 'rgba(17, 24, 39, 0.92)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.75rem',
          color: 'var(--text-primary)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <MapPin size={13} color="var(--primary)" />
        <span style={{ fontWeight: 600 }}>Google Maps</span>
        <span style={{ color: 'var(--text-muted)' }}>•</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {venues.length} {venues.length === 1 ? 'facility' : 'facilities'} mapped
        </span>
        <button
          onClick={() => setShowKeyModal(true)}
          style={{
            marginLeft: '6px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '0.7rem',
          }}
          title="Configure Google Maps API Key"
        >
          API Key
        </button>
      </div>

      {/* Main Map View */}
      {scriptError || !apiKey ? (
        renderFallbackMap()
      ) : (
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      )}

      {/* API Key Modal */}
      {showKeyModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '1.25rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
              <KeyRound size={18} color="var(--primary)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Google Maps API Configuration
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Enter your Google Maps JavaScript API Key below, or set <code style={{ color: 'var(--primary)', background: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: '4px' }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in <code style={{ color: 'var(--primary)' }}>.env.local</code>.
            </p>
            <form onSubmit={handleSaveCustomKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="AIzaSy..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                className="input-field"
                style={{ fontSize: '0.85rem' }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.8rem' }}
                >
                  Save & Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
