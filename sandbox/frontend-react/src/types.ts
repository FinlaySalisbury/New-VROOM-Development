/**
 * Shared domain types for the VROOM sandbox.
 *
 * These mirror the exact JSONB / row shapes used by the legacy app.js
 * StorageManager and the FastAPI backend, so existing Supabase rows and
 * backend responses deserialize unchanged. Do NOT "tidy" field names —
 * they are the on-disk contract.
 */

import type { ProjectRole } from '@/store/appStore';

export type { ProjectRole } from '@/store/appStore';
export type { UserProfile } from '@/store/appStore';

// ── Projects & membership ─────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  /** Present when the project was loaded via the membership join. */
  role?: ProjectRole;
}

/** A row in `project_members`, enriched with the joined profile. */
export interface Member {
  user_id: string;
  role: ProjectRole;
  email?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

/** A row in `invitations`. */
export interface Invitation {
  id: string;
  project_id?: string;
  email: string;
  role: ProjectRole;
  status?: InvitationStatus;
  created_at?: string;
}

/** A pending invitation shown to the *invitee* on the project picker. */
export interface IncomingInvitation {
  id: string;
  role: ProjectRole;
  project_name: string | null;
}

// ── Engineers ─────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * The JSONB `data` payload of an `engineers` row. Skills are the numeric
 * VROOM skill codes (e.g. [1103, 1203]).
 */
export interface Engineer {
  id: string;
  name: string;
  number?: number;
  skills: number[];
  location: GeoPoint;
  defaultShiftStart?: string;
  defaultShiftEnd?: string;
  capacity?: number | null;
  breakDuration?: number | null;
  breakStart?: string;
  breakEnd?: string;
  createdAt?: string;
}

// ── Jobs ──────────────────────────────────────────────────────

/** A single parsed job within a job list (VROOM job shape). */
export interface Job {
  id: number;
  description: string;
  location: [number, number]; // [lon, lat] — GeoJSON order
  skills: number[];
  service: number;
  time_windows: [number, number][];
  priority: number;
  urgency_level?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * The JSONB `data` payload of a `job_lists` row — a named batch of jobs
 * parsed from CSV.
 */
export interface JobList {
  id: string;
  name: string;
  notes?: string;
  jobCount: number;
  jobs: Job[];
  createdAt?: string;
  classifiedBy?: string;
  breakdownLog?: unknown;
}

// ── Sites ─────────────────────────────────────────────────────

/** The JSONB `data` payload of a `sites` row. */
export interface Site {
  id: string;
  ref?: string;
  town?: string;
  lat: number;
  lon: number;
  [key: string]: unknown;
}

// ── Settings ──────────────────────────────────────────────────

/**
 * Decoded `global_settings` for a project. The legacy app stored each key
 * as a stringified value; this is the parsed view used by the UI.
 */
export interface GlobalSettings {
  /** Main depot as [lon, lat] (GeoJSON order). */
  mainDepot: [number, number];
}

// ── History / test runs ───────────────────────────────────────

/** Summary row from GET /api/history. */
export interface TestRun {
  id: string;
  test_number?: number | null;
  created_at: string;
  name?: string | null;
  strategy: string;
  num_engineers: number;
  num_jobs: number;
  total_duration_s?: number | null;
  total_distance_m?: number | null;
  unassigned_jobs?: number | null;
  api_cost_estimate?: number | null;
  is_remix?: number | null;
  parent_run_id?: string | null;
}

/** Full detail from GET /api/history/{id}. */
export interface TestRunDetail extends TestRun {
  scenario_state: Record<string, unknown>;
  routes_data?: Record<string, unknown>[] | null;
  trips_geojson: Record<string, unknown>;
  faults_geojson: Record<string, unknown>;
  routes_geojson: Record<string, unknown>;
  combined_geojson?: Record<string, unknown> | null;
  vroom_solution?: Record<string, unknown> | null;
}

// ── Activity log ──────────────────────────────────────────────

export type ActivityCategory =
  | 'all'
  | 'team'
  | 'project'
  | 'dispatch'
  | 'data';

/** A row in `activity_log`, enriched with the joined actor profile. */
export interface ActivityEntry {
  id: string;
  user_id: string;
  action: string;
  category: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_email?: string | null;
  actor_display_name?: string | null;
}

/** Options for paging / filtering the activity log. */
export interface ActivityQueryOptions {
  category?: ActivityCategory;
  userId?: string;
  /** Only return entries newer than this many days ago. */
  sinceDays?: number;
  offset?: number;
  pageSize?: number;
}
