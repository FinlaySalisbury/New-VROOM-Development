/**
 * Imperative Leaflet layer that positions one animated marker per engineer
 * along their trajectory at the current playback time. Kept outside React's
 * render path (markers updated via refs) so per-frame repositioning never
 * triggers a component re-render — matching the legacy rAF performance.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

import { interpolatePosition, type Trajectory } from './routeAnimation';

interface AnimationLayerProps {
  trajectories: Trajectory[];
  currentUnix: number;
}

export function AnimationLayer({ trajectories, currentUnix }: AnimationLayerProps) {
  const map = useMap();
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  // (Re)build markers whenever the trajectory set changes.
  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    const markers = new Map<number, L.Marker>();

    for (const t of trajectories) {
      const start = t.path[0];
      const marker = L.marker([start.lat, start.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="anim-marker" style="background:${t.color}">${t.label}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        zIndexOffset: 1000,
        keyboard: false,
      }).bindTooltip(`<strong>${t.name}</strong>`, {
        direction: 'top',
        offset: [0, -14],
        className: 'anim-tooltip',
      });
      marker.addTo(layer);
      markers.set(t.engineerId, marker);
    }

    markersRef.current = markers;
    return () => {
      layer.remove();
      markersRef.current = new Map();
    };
  }, [map, trajectories]);

  // Reposition markers as playback time advances.
  useEffect(() => {
    for (const t of trajectories) {
      const marker = markersRef.current.get(t.engineerId);
      if (!marker || t.path.length === 0) continue;
      const el = marker.getElement();

      // Hide the engineer until their shift starts.
      if (t.availStart != null && currentUnix < t.availStart) {
        if (el) el.style.opacity = '0';
        continue;
      }
      if (el) el.style.opacity = '1';

      const pos = interpolatePosition(t.path, currentUnix);
      marker.setLatLng([pos.lat, pos.lon]);
    }
  }, [trajectories, currentUnix]);

  return null;
}
