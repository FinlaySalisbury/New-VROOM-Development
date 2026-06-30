/**
 * Turn one vehicle-day's stored route into an ordered, detailed timeline of the
 * day: shift start → travel legs → job services → shift end. Each leg carries
 * duration, distance, average speed and traffic; each job carries arrival,
 * service time, urgency and skills. Drives the day-breakdown panel and the
 * panel↔map highlighting (legs by leg_id, jobs by job_id).
 */

import type { SimulationResult, SimVehicleRoute } from '@/services/simulation';

export interface JobMeta {
  skills?: number[];
  urgency?: string;
  description?: string;
}

/** job_id → metadata, from the run's scenario state. */
export function buildJobLookup(result: SimulationResult | null): Map<number, JobMeta> {
  const m = new Map<number, JobMeta>();
  const jobs = (result?.scenario_state as { jobs?: Array<Record<string, unknown>> } | undefined)?.jobs ?? [];
  for (const j of jobs) {
    const id = Number(j.id);
    if (Number.isFinite(id)) {
      m.set(id, {
        skills: Array.isArray(j.skills) ? (j.skills as number[]) : undefined,
        urgency: typeof j.urgency_level === 'string' ? j.urgency_level : undefined,
        description: typeof j.description === 'string' ? j.description : undefined,
      });
    }
  }
  return m;
}

export interface LegItem {
  kind: 'leg';
  legId: string | null;
  from: string;
  to: string;
  departTime: string;
  durationS: number;
  freeFlowS: number | null;
  distanceM: number | null;
  speedKmh: number | null;
  trafficMult: number | null;
}

export interface StopItem {
  kind: 'stop';
  action: 'shift_start' | 'service' | 'shift_end';
  jobId: number | null;
  title: string;
  time: string;
  serviceS: number;
  urgency?: string;
  skills?: number[];
}

export type DayItem = LegItem | StopItem;

function hhmm(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Parse "Drive depot → Job #1003" into its two endpoints. */
function parseDriveDesc(desc: string): { from: string; to: string } {
  const m = /Drive\s+(.+?)\s*→\s*(.+)/.exec(desc);
  return m ? { from: m[1].trim(), to: m[2].trim() } : { from: '', to: '' };
}

export function buildDayTimeline(rd: SimVehicleRoute | undefined, jobs: Map<number, JobMeta>): DayItem[] {
  if (!rd) return [];

  // Index legs by departure time so travel activities can pick up distance etc.
  const legByDepart = new Map<number, Record<string, unknown>>();
  for (const leg of rd.legs ?? []) {
    const dep = Number(leg.depart_unix);
    if (Number.isFinite(dep)) legByDepart.set(dep, leg as unknown as Record<string, unknown>);
  }

  const log = (rd.activity_log ?? []) as Array<Record<string, unknown>>;
  const items: DayItem[] = [];

  for (const a of log) {
    const action = String(a.action ?? '');
    const ts = Number(a.timestamp_unix ?? 0);

    if (action === 'travel') {
      const leg = legByDepart.get(ts);
      const durationS = Number(leg?.duration_s ?? a.duration_s ?? 0);
      const distanceM = leg?.distance_m != null ? Number(leg.distance_m) : null;
      const freeFlowS = leg?.free_flow_duration_s != null ? Number(leg.free_flow_duration_s) : null;
      const trafficMult = leg?.traffic_multiplier != null ? Number(leg.traffic_multiplier) : (a.traffic_multiplier != null ? Number(a.traffic_multiplier) : null);
      const speedKmh = distanceM != null && durationS > 0 ? (distanceM * 3.6) / durationS : null;
      const { from, to } = parseDriveDesc(String(a.description ?? ''));
      items.push({
        kind: 'leg',
        legId: leg?.leg_id != null ? String(leg.leg_id) : null,
        from,
        to,
        departTime: hhmm(ts),
        durationS,
        freeFlowS,
        distanceM,
        speedKmh,
        trafficMult,
      });
    } else if (action === 'shift_start' || action === 'service' || action === 'shift_end') {
      const jobId = a.job_id != null ? Number(a.job_id) : null;
      const meta = jobId != null ? jobs.get(jobId) : undefined;
      items.push({
        kind: 'stop',
        action: action as StopItem['action'],
        jobId,
        title:
          action === 'shift_start'
            ? 'Shift starts'
            : action === 'shift_end'
            ? 'Returns to depot'
            : meta?.description || String(a.description ?? `Job #${jobId ?? ''}`),
        time: hhmm(ts),
        serviceS: Number(a.duration_s ?? 0),
        urgency: meta?.urgency,
        skills: meta?.skills,
      });
    }
  }

  return items;
}

/** Format seconds as "Xm" / "Xh Ym". */
export function fmtMins(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '0m';
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
