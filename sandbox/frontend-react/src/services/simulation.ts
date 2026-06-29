import { apiFetch } from '@/lib/api';

export type RoutingStrategy = 'naive' | 'inhouse' | 'tomtom_premium' | 'here_premium';

export interface SimulationRequest {
  project_id: string;
  num_engineers: number;
  num_jobs: number;
  strategy: RoutingStrategy;
  name?: string;
}

/** A GeoJSON FeatureCollection as returned by the solve endpoint. */
export interface SimFeatureCollection {
  type: string;
  features: Array<{
    type: string;
    geometry: { type: string; coordinates: number[] | number[][] | number[][][] };
    properties: Record<string, unknown>;
  }>;
}

/**
 * A single travel leg between two stops. `timestamped_coords` is the decoded
 * route geometry sampled over time as `[lon, lat, _, unix]` tuples — the data
 * the map playback interpolates engineer positions from.
 */
export interface SimLeg {
  leg_id?: string;
  depart_unix?: number;
  arrive_unix?: number;
  duration_s?: number;
  traffic_multiplier?: number | null;
  timestamped_coords?: number[][];
}

export interface SimVehicleRoute {
  vehicle_id: number;
  vehicle_name?: string;
  vehicle_skills?: number[];
  vehicle_start?: [number, number];
  /** Absolute shift window as `[startUnix, endUnix]`. */
  vehicle_time_window?: [number, number];
  num_jobs_assigned?: number;
  availability_start?: string;
  availability_end?: string;
  activity_log?: Array<Record<string, unknown>>;
  legs?: SimLeg[];
}

/** Response of POST /api/simulate (Pydantic SimulationResponse). */
export interface SimulationResult {
  id: string;
  test_number: number;
  strategy: string;
  num_engineers: number;
  num_jobs: number;
  routes_geojson: SimFeatureCollection;
  faults_geojson: SimFeatureCollection;
  trips_geojson?: SimFeatureCollection;
  combined_geojson?: SimFeatureCollection;
  routes_data?: SimVehicleRoute[];
  vroom_summary?: { distance?: number; duration?: number; unassigned?: number } & Record<string, unknown>;
  cost_estimate?: {
    total_waypoints?: number;
    matrix_elements?: number;
    estimated_cost_eur?: number;
    provider?: string;
  } | null;
  scenario_state: Record<string, unknown>;
  is_remix?: boolean;
  parent_run_id?: string | null;
}

/** Generate a random London scenario and solve it (POST /api/simulate). */
export function runSimulation(req: SimulationRequest): Promise<SimulationResult> {
  return apiFetch<SimulationResult>('/simulate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
