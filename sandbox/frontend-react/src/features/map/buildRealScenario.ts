/**
 * Build a VROOM scenario from the project's REAL engineers + a saved job list,
 * for a live single-day dispatch (POSTed as `replay_scenario`). Ports the core
 * of the legacy preflight solve (app.js): one vehicle per engineer for the
 * chosen day, fair-share load balancing, and expired-job handling.
 *
 * Constraints dictated by the backend (vroom_interface._build_payload):
 *  - start_index == end_index == vehicle index, so each vehicle has exactly ONE
 *    location (start == end). We support `home` (engineer location) or `depot`.
 *  - `breaks` are not emitted to VROOM by the backend, so they are intentionally
 *    omitted here.
 *  - `locations` MUST be [all vehicle starts…, then all job locations…] — the
 *    matrix indexing depends on this order.
 */

import type { Engineer, Job } from '@/types';

export type LocationMode = 'home' | 'depot';

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
  /** The day to dispatch (any time on the target date). */
  shiftDate: Date;
  locationMode: LocationMode;
}

const DEFAULT_SHIFT_START = '08:00';
const DEFAULT_SHIFT_END = '18:00';
const GENERAL_SKILL = 1003;
const HORIZON_S = 7 * 24 * 60 * 60; // window-extension horizon for expired jobs

/** The six canonical skill categories, mirroring the backend SKILLS_MAP. */
const SKILLS_MAP: Record<string, number> = {
  traffic_light_repair: 1,
  cctv_maintenance: 2,
  fiber_splicing: 3,
  high_voltage: 4,
  sign_installation: 5,
  road_marking: 6,
};

/** Unix seconds for `HH:MM` on the given date, in UTC (matches shift_start convention). */
function timeOnDateUnix(date: Date, hhmm: string, fallback: string): number {
  const [h, m] = (hhmm || fallback).split(':').map(Number);
  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor(base / 1000) + (Number.isFinite(h) ? h : 8) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
}

export interface BuildScenarioResult {
  scenario: Scenario;
  /** Non-fatal notes for the user (e.g. engineers skipped for missing coords). */
  warnings: string[];
}

/**
 * Construct the live-dispatch scenario. Throws if there are no usable engineers
 * or no jobs — the caller should validate and surface a friendly message.
 */
export function buildRealScenario(opts: BuildScenarioOptions): BuildScenarioResult {
  const { engineers, jobs: sourceJobs, depot, shiftDate, locationMode } = opts;
  const warnings: string[] = [];

  const vehicles: ScenarioVehicle[] = [];
  let vehicleId = 1;

  for (const eng of engineers) {
    const home: [number, number] | null =
      eng.location && Number.isFinite(eng.location.lon) && Number.isFinite(eng.location.lat)
        ? [eng.location.lon, eng.location.lat]
        : null;

    const coord: [number, number] | null = locationMode === 'depot' ? depot : home;
    if (!coord) {
      warnings.push(`Skipped ${eng.name || 'an engineer'} — no valid location.`);
      continue;
    }

    const startS = timeOnDateUnix(shiftDate, eng.defaultShiftStart ?? '', DEFAULT_SHIFT_START);
    const endS = timeOnDateUnix(shiftDate, eng.defaultShiftEnd ?? '', DEFAULT_SHIFT_END);
    if (endS <= startS) {
      warnings.push(`Skipped ${eng.name || 'an engineer'} — shift end is not after start.`);
      continue;
    }

    const skills = Array.isArray(eng.skills) && eng.skills.length ? eng.skills : [GENERAL_SKILL];
    const vehicle: ScenarioVehicle = {
      id: vehicleId++,
      name: `${eng.name || 'Engineer'}|${eng.number ?? eng.id}_Day1`,
      start: coord,
      end: coord,
      skills,
      time_window: [startS, endS],
    };
    if (eng.capacity != null && Number.isFinite(eng.capacity)) {
      vehicle.max_tasks = Math.max(1, Math.floor(eng.capacity));
    }
    vehicles.push(vehicle);
  }

  if (vehicles.length === 0) {
    throw new Error('No dispatchable engineers — add engineers with a location and shift window.');
  }
  if (sourceJobs.length === 0) {
    throw new Error('The selected job list has no jobs.');
  }

  const shiftStart = vehicles[0].time_window[0];
  const simEnd = shiftStart + HORIZON_S;

  // Clone jobs so we never mutate the saved job list. Apply baseline priority and
  // rescue jobs whose deadline is already in the past (priority 0 + extend window),
  // so VROOM doesn't reject them outright.
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

  // Fair-share load balancing: cap each vehicle near the even split so VROOM
  // spreads work across the roster rather than piling onto the fewest vehicles.
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
  };
}
