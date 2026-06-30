/**
 * Group the backend's per-vehicle-day routes back into one entry per engineer
 * for the map UI, while the solver keeps them separate. Mirrors the legacy
 * renderEngineerStats grouping (vehicle_name split on "_Day"), improved to:
 *   - share ONE colour per engineer across all their days,
 *   - label each day with its real date (from the vehicle's shift window)
 *     instead of "Day N",
 *   - expose the set of vehicle ids per engineer so map filtering can select a
 *     whole engineer (all their days) at once.
 */

import type { SimulationResult, SimVehicleRoute } from '@/services/simulation';
import { ROUTE_COLORS } from './mapColors';

export interface EngineerDay {
  vehicleId: number;
  label: string; // "Mon 30 Jun" (or "Day 1" when no date is available)
  dateUnix: number | null;
  jobs: number;
  availStart: string;
  availEnd: string;
  travelS: number;
  serviceS: number;
}

export interface EngineerGroup {
  key: string;
  name: string;
  number: string | null;
  color: string;
  vehicleIds: Set<number>;
  totalJobs: number;
  totalTravelS: number;
  totalServiceS: number;
  days: EngineerDay[];
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(unix: number): string {
  const d = new Date(unix * 1000);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** Parse "<name>|<number>_DayN" into its parts (robust to missing pieces). */
function parseVehicleName(vehicleName: string | undefined, vehicleId: number) {
  const raw = vehicleName ?? `Engineer ${vehicleId}`;
  const dayIdx = raw.indexOf('_Day');
  const base = dayIdx >= 0 ? raw.slice(0, dayIdx) : raw;
  const dayNum = dayIdx >= 0 ? parseInt(raw.slice(dayIdx + 4), 10) : null;
  const [namePart, numberPart] = base.includes('|') ? base.split('|') : [base, ''];
  return {
    key: base,
    name: namePart.trim() || `Engineer ${vehicleId}`,
    number: numberPart.trim() || null,
    dayNum: Number.isFinite(dayNum) ? dayNum : null,
  };
}

function sumLegDuration(legs: SimVehicleRoute['legs']): number {
  return (legs ?? []).reduce((s, l) => s + (Number(l.duration_s) || 0), 0);
}

function sumServiceDuration(log: SimVehicleRoute['activity_log']): number {
  return (log ?? [])
    .filter((a) => a.action === 'service')
    .reduce((s, a) => s + (Number(a.duration_s) || 0), 0);
}

/** Build grouped engineers from a solve result, ordered by first appearance. */
export function buildEngineerGroups(result: SimulationResult | null): EngineerGroup[] {
  const groups = new Map<string, EngineerGroup>();
  let colorIdx = 0;

  for (const rd of result?.routes_data ?? []) {
    const { key, name, number, dayNum } = parseVehicleName(rd.vehicle_name, rd.vehicle_id);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name,
        number,
        color: ROUTE_COLORS[colorIdx++ % ROUTE_COLORS.length],
        vehicleIds: new Set(),
        totalJobs: 0,
        totalTravelS: 0,
        totalServiceS: 0,
        days: [],
      };
      groups.set(key, g);
    }

    const jobs = rd.num_jobs_assigned ?? 0;
    const travelS = sumLegDuration(rd.legs);
    const serviceS = sumServiceDuration(rd.activity_log);
    const tw = rd.vehicle_time_window;
    const dateUnix = Array.isArray(tw) && typeof tw[0] === 'number' ? tw[0] : null;

    g.vehicleIds.add(rd.vehicle_id);
    g.totalJobs += jobs;
    g.totalTravelS += travelS;
    g.totalServiceS += serviceS;
    g.days.push({
      vehicleId: rd.vehicle_id,
      label: dateUnix != null ? fmtDate(dateUnix) : dayNum != null ? `Day ${dayNum}` : (rd.vehicle_name ?? ''),
      dateUnix,
      jobs,
      availStart: rd.availability_start ?? '',
      availEnd: rd.availability_end ?? '',
      travelS,
      serviceS,
    });
  }

  const out = [...groups.values()];
  for (const g of out) g.days.sort((a, b) => (a.dateUnix ?? 0) - (b.dateUnix ?? 0));
  return out;
}

/** Map every vehicle id to its engineer's colour. */
export function colorByVehicle(groups: EngineerGroup[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const g of groups) for (const vid of g.vehicleIds) m.set(vid, g.color);
  return m;
}
