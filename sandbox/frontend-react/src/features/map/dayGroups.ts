/**
 * The day axis of the dispatch breakdown — the counterpart to engineerGroups.
 * The solver emits one vehicle per (engineer, date); engineerGroups re-stacks
 * those by engineer, while this re-stacks the SAME vehicle-days by date so the
 * UI can show "everyone working Tuesday" in one frame and select each engineer
 * within that day. Colours and names are reused from the engineer groups so the
 * two axes agree.
 */

import type { EngineerGroup } from './engineerGroups';

export interface DayEngineer {
  vehicleId: number;
  engineerKey: string;
  name: string;
  color: string;
  jobs: number;
  travelS: number;
  serviceS: number;
  availStart: string;
  availEnd: string;
}

export interface DayGroup {
  key: string; // YYYY-MM-DD, or "veh-<id>" when the date is unknown
  dateUnix: number | null;
  label: string; // "Tue 1 Jul"
  vehicleIds: Set<number>;
  engineers: DayEngineer[];
  totalJobs: number;
  totalTravelS: number;
  totalServiceS: number;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoKey(unix: number): string {
  const d = new Date(unix * 1000);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

function fmtDate(unix: number): string {
  const d = new Date(unix * 1000);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/**
 * Re-bucket the engineer groups' vehicle-days by calendar date. Built from the
 * already-parsed engineer groups so every engineer keeps the same colour/name
 * on both axes.
 */
export function buildDayGroups(groups: EngineerGroup[]): DayGroup[] {
  const days = new Map<string, DayGroup>();

  for (const g of groups) {
    for (const d of g.days) {
      const key = d.dateUnix != null ? isoKey(d.dateUnix) : `veh-${d.vehicleId}`;
      let dg = days.get(key);
      if (!dg) {
        dg = {
          key,
          dateUnix: d.dateUnix,
          label: d.dateUnix != null ? fmtDate(d.dateUnix) : d.label,
          vehicleIds: new Set(),
          engineers: [],
          totalJobs: 0,
          totalTravelS: 0,
          totalServiceS: 0,
        };
        days.set(key, dg);
      }
      dg.vehicleIds.add(d.vehicleId);
      dg.engineers.push({
        vehicleId: d.vehicleId,
        engineerKey: g.key,
        name: g.name,
        color: g.color,
        jobs: d.jobs,
        travelS: d.travelS,
        serviceS: d.serviceS,
        availStart: d.availStart,
        availEnd: d.availEnd,
      });
      dg.totalJobs += d.jobs;
      dg.totalTravelS += d.travelS;
      dg.totalServiceS += d.serviceS;
    }
  }

  const out = [...days.values()];
  out.sort((a, b) => (a.dateUnix ?? 0) - (b.dateUnix ?? 0));
  for (const dg of out) dg.engineers.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
