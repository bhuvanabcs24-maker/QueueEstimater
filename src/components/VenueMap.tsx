'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Venue } from '@/lib/venueStore';

interface VenueMapProps {
  venues: Venue[];
  userLat?: number;
  userLng?: number;
}

export default function VenueMap({ venues, userLat, userLng }: VenueMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;
    const container = mapContainerRef.current;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      if (!container) return;

      // Fix default Leaflet icon paths
      const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown };
      delete proto._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const initialCenter: [number, number] = userLat && userLng ? [userLat, userLng] : [venues[0]?.lat || 12.9716, venues[0]?.lng || 77.5946];

      if (!mapInstanceRef.current) {
        const map = L.map(container, {
          center: initialCenter,
          zoom: 13,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Add user location marker if available
      if (userLat && userLng) {
        const userIcon = L.divIcon({
          className: 'user-gps-marker',
          html: `<div style="width: 16px; height: 16px; background: #6366f1; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 12px #6366f1;"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        L.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup('<b>Your Current Location</b>');
      }

      // Add venue pin markers
      venues.forEach((v) => {
        const waitMins = Math.round((v.current_queue_length || 2) * (v.avg_service_time_minutes || 5));
        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; padding: 4px;">
            <b style="font-size: 0.95rem; color: #0f172a;">${v.name}</b><br/>
            <span style="font-size: 0.8rem; color: #64748b;">${v.category} • ${v.address}</span><br/>
            <div style="margin-top: 6px; font-weight: 700; color: #10b981; font-size: 0.85rem;">
              🟢 ~${waitMins} min wait (${v.current_queue_length || 2} in line)
            </div>
            <a href="/location/${v.id}" style="display: inline-block; margin-top: 8px; background: #6366f1; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; text-decoration: none; font-weight: 700;">
              Check In Here →
            </a>
          </div>
        `;
        L.marker([v.lat, v.lng]).addTo(map).bindPopup(popupHtml);
      });
    });
  }, [venues, userLat, userLng]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '280px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
    </div>
  );
}
