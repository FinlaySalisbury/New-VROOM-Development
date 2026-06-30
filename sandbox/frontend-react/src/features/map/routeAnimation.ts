/**
 * Route-playback model. Ports the legacy `setupAnimation` / `drawFrame`
 * trajectory logic (app.js) into pure, framework-free helpers so the React
 * map can interpolate each engineer's position along their timed route.
 */

import type { SimulationResult } from '@/services/simulation';
import { routeColor } from './mapColors';

export interface TrajectoryPoint {
  lat: number;
  lon: number;
  unix: number;
}

export interface Trajectory {
  engineerId: number;
  name: string;
  /** Short marker label — a 1-based index, matching the legacy badge. */
  label: string;
  color: string;
  path: TrajectoryPoint[];
  /** Absolute shift window; the marker is hidden before it starts. */
  availStart: number | null;
  availEnd: number | null;
}

export interface AnimationModel {
  trajectories: Trajectory[];
  startUnix: number;
  endUnix: number;
}

/**
 * Build per-engineer trajectories from a solve result. The timeline spans the
 * earliest shift start to the latest shift end (or route activity), so markers
 * appear/depart on their availability windows just like the legacy player.
 */
export function buildAnimationModel(
  result: SimulationResult | null,
  colorOf?: (vehicleId: number) => string,
): AnimationModel {
  const empty: AnimationModel = { trajectories: [], startUnix: 0, endUnix: 0 };
  if (!result?.routes_data) return empty;

  let min = Infinity;
  let max = -Infinity;
  const trajectories: Trajectory[] = [];

  result.routes_data.forEach((rd, idx) => {
    const path: TrajectoryPoint[] = [];
    for (const leg of rd.legs ?? []) {
      const tcs = leg.timestamped_coords;
      if (!Array.isArray(tcs)) continue;
      for (const tc of tcs) {
        const lon = tc[0];
        const lat = tc[1];
        const unix = tc[3];
        if (typeof unix !== 'number' || typeof lat !== 'number' || typeof lon !== 'number') continue;
        path.push({ lat, lon, unix });
        if (unix < min) min = unix;
        if (unix > max) max = unix;
      }
    }

    const tw = rd.vehicle_time_window;
    const availStart = Array.isArray(tw) && typeof tw[0] === 'number' ? tw[0] : null;
    const availEnd = Array.isArray(tw) && typeof tw[1] === 'number' ? tw[1] : null;
    if (availStart != null && availStart < min) min = availStart;
    if (availEnd != null && availEnd > max) max = availEnd;

    if (path.length > 0) {
      path.sort((a, b) => a.unix - b.unix);
      trajectories.push({
        engineerId: rd.vehicle_id,
        name: rd.vehicle_name?.split('|')[0]?.trim() || `Engineer ${rd.vehicle_id}`,
        label: String(idx + 1),
        color: colorOf?.(rd.vehicle_id) ?? routeColor(rd.vehicle_id),
        path,
        availStart,
        availEnd,
      });
    }
  });

  if (min === Infinity) return empty;
  return { trajectories, startUnix: min, endUnix: max };
}

/** Interpolate a position along a timed path at an absolute unix time. */
export function interpolatePosition(path: TrajectoryPoint[], time: number): TrajectoryPoint {
  if (time <= path[0].unix) return path[0];
  const last = path[path.length - 1];
  if (time >= last.unix) return last;

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    if (time >= p1.unix && time <= p2.unix) {
      const span = p2.unix - p1.unix;
      if (span === 0) return p1;
      const ratio = (time - p1.unix) / span;
      return {
        lat: p1.lat + (p2.lat - p1.lat) * ratio,
        lon: p1.lon + (p2.lon - p1.lon) * ratio,
        unix: time,
      };
    }
  }
  return last;
}

/** Format an absolute unix time as a 24h HH:MM clock (Europe/London display). */
export function formatClock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
