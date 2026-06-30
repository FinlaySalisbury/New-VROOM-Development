/**
 * Build a VROOM scenario from the project's REAL engineers + a saved job list,
 * across a custom **date range** rota — the legacy preflight flow (app.js),
 * generalised from a fixed Mon–Sun week to any span of dates. Each engineer can
 * work a different set of dates in the range, each date with its own shift
 * window; every selected engineer-day becomes a separate vehicle
 * ("<engineer>|<number>_DayN"), solved together with fair-share load balancing.
 *
 * Constraints dictated by the backend (vroom_interface._build_payload):
 *  - start_index == end_index == vehicle index, so each vehicle has exactly ONE
 *    location (start == end). We support `home` (engineer location) or `depot`.
 *  - `breaks` are not emitted to VROOM, so they are omitted here.
 *  - `locations` MUST be [all vehicle starts…, then all job locations…].
 */

import type { Engineer, Job } from '@/types';

export type LocationMode = 'home' | 'depot';

/** A single date's shift selection within an engineer's rota. */
export interface DayShift {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

/** One engineer's rota: where they start/end and their per-date shifts. */
export interface EngineerRota {
  locationMode: LocationMode;
  /** Keyed by ISO date "YYYY-MM-DD". */
  days: Record<string, DayShift>;
}

export interface ScenarioVehicle {
  id: number;
  name: string;
  start: [number, number];
  end: [number, number];
  skills: number[];
  time_window: [number, number];
  max_tasks?: number;
}

export interface Scenario {
  vehicles: ScenarioVehicle[];
  jobs: Job[];
  locations: [number, number][];
  shift_start: number;
  skills_map?: Record<string, number>;
}

export interface BuildScenarioOptions {
  engineers: Engineer[];
  jobs: Job[];
  /** Project depot as [lon, lat] (GeoJSON order). */
  depot: [number, number];
  /** Ordered dates in the rota range (each at UTC midnight). */
  dates: Date[];
  /** Rota per engineer id; engineers without an entry are skipped. */
  rota: Record<string, EngineerRota>;
}

const GENERAL_SKILL = 1003;
const HORIZON_S = 7 * 24 * 60 * 60; // window-extension horizon for expired jobs
const DAY_MS = 24 * 60 * 60 * 1000;

/** Largest rota span we allow (guards against runaway vehicle-day counts). */
export const MAX_RANGE_DAYS = 31;

/** The six canonical skill categories, mirroring the backend SKILLS_MAP. */
const SKILLS_MAP: Record<string, number> = {
  traffic_light_repair: 1,
  cctv_maintenance: 2,
  fiber_splicing: 3,
  high_voltage: 4,
  sign_installation: 5,
  road_marking: 6,
};

/** ISO "YYYY-MM-DD" for a date, in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A date at UTC midnight from a "YYYY-MM-DD" string. */
export function utcMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** True for Mon–Fri (UTC). */
export function isWeekday(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Inclusive list of UTC-midnight dates from `startIso` to `endIso`. Returns []
 * if the range is invalid; clamps to MAX_RANGE_DAYS.
 */
export function datesInRange(startIso: string, endIso: string): Date[] {
  const start = utcMidnight(startIso).getTime();
  const end = utcMidnight(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const out: Date[] = [];
  for (let t = start; t <= end && out.length < MAX_RANGE_DAYS; t += DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

/** The default shift for an engineer on a date: weekdays on, using their window. */
export function defaultDayShift(eng: Engineer, date: Date): DayShift {
  return {
    enabled: isWeekday(date),
    start: eng.defaultShiftStart || '08:00',
    end: eng.defaultShiftEnd || '18:00',
  };
}

/** Unix seconds for `HH:MM` at the given UTC-midnight date. */
function atTime(date: Date, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Math.floor(date.getTime() / 1000) + (Number.isFinite(h) ? h : 8) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
}

export interface BuildScenarioResult {
  scenario: Scenario;
  warnings: string[];
  /** Total engineer-days (vehicles) generated. */
  vehicleDays: number;
}

/**
 * Construct the date-range rota scenario. Throws if no engineer-days are
 * selected or the job list is empty — the caller validates and surfaces a
 * friendly message.
 */
export function buildRealScenario(opts: BuildScenarioOptions): BuildScenarioResult {
  const { engineers, jobs: sourceJobs, depot, dates, rota } = opts;
  const warnings: string[] = [];

  const vehicles: ScenarioVehicle[] = [];
  let vehicleId = 1;

  for (const eng of engineers) {
    const engRota = rota[eng.id];
    if (!engRota) continue;

    const home: [number, number] | null =
      eng.location && Number.isFinite(eng.location.lon) && Number.isFinite(eng.location.lat)
        ? [eng.location.lon, eng.location.lat]
        : null;
    const coord: [number, number] | null = engRota.locationMode === 'depot' ? depot : home;
    if (!coord) {
      warnings.push(`Skipped ${eng.name || 'an engineer'} — no valid location.`);
      continue;
    }

    const skills = Array.isArray(eng.skills) && eng.skills.length ? eng.skills : [GENERAL_SKILL];

    dates.forEach((date, di) => {
      const day = engRota.days[isoDate(date)];
      if (!day?.enabled) return;
      const startS = atTime(date, day.start || '08:00');
      const endS = atTime(date, day.end || '18:00');
      if (endS <= startS) {
        warnings.push(`Skipped ${eng.name || 'an engineer'} on ${isoDate(date)} — shift end not after start.`);
        return;
      }

      const vehicle: ScenarioVehicle = {
        id: vehicleId++,
        name: `${eng.name || 'Engineer'}|${eng.number ?? eng.id}_Day${di + 1}`,
        start: coord,
        end: coord,
        skills,
        time_window: [startS, endS],
      };
      if (eng.capacity != null && Number.isFinite(eng.capacity)) {
        vehicle.max_tasks = Math.max(1, Math.floor(eng.capacity));
      }
      vehicles.push(vehicle);
    });
  }

  if (vehicles.length === 0) {
    throw new Error('No engineer-days selected — tick at least one day for one engineer.');
  }
  if (sourceJobs.length === 0) {
    throw new Error('The selected job list has no jobs.');
  }

  const shiftStart = vehicles.reduce((min, v) => Math.min(min, v.time_window[0]), Infinity);
  const simEnd = shiftStart + HORIZON_S;

  // Clone jobs; baseline priority and rescue jobs whose deadline is already past
  // (priority 0 + extend window) so VROOM doesn't reject them outright.
  const jobs: Job[] = sourceJobs.map((j) => {
    const tw = (j.time_windows ?? []).map((w) => [w[0], w[1]] as [number, number]);
    let priority = 50;
    const maxEnd = tw.reduce((mx, w) => Math.max(mx, w[1]), 0);
    if (tw.length > 0 && maxEnd < shiftStart) {
      priority = 0;
      for (const w of tw) w[1] = Math.max(w[1], simEnd);
    }
    return { ...j, priority, time_windows: tw };
  });

  // Fair-share load balancing across ALL engineer-days.
  const fairShare = Math.ceil(jobs.length / vehicles.length);
  const balancedLimit = fairShare + 1;
  for (const v of vehicles) {
    v.max_tasks = v.max_tasks != null ? Math.min(v.max_tasks, balancedLimit) : balancedLimit;
  }

  const locations: [number, number][] = [
    ...vehicles.map((v) => v.start),
    ...jobs.map((j) => j.location),
  ];

  return {
    scenario: { vehicles, jobs, locations, shift_start: shiftStart, skills_map: SKILLS_MAP },
    warnings,
    vehicleDays: vehicles.length,
  };
}
