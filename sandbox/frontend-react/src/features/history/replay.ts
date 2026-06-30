/**
 * Adapt a stored history run into the live `SimulationResult` shape the map
 * renders, so a past dispatch can be replayed (rendered + animated) on the
 * map without re-solving. Mirrors the legacy `viewHistoryRun` path.
 *
 * The backend regenerates the GeoJSON layers on `/history/{id}` but persists
 * metrics as flat columns (total_duration_s, …) rather than a vroom_summary
 * object, so we synthesise that here for the map summary panel.
 */

import type {
  SimulationResult,
  SimFeatureCollection,
  SimVehicleRoute,
} from '@/services/simulation';
import type { TestRunDetail } from '@/types';

export function historyRunToResult(detail: TestRunDetail): SimulationResult {
  return {
    id: detail.id,
    test_number: detail.test_number ?? 0,
    strategy: detail.strategy,
    num_engineers: detail.num_engineers,
    num_jobs: detail.num_jobs,
    routes_geojson: detail.routes_geojson as unknown as SimFeatureCollection,
    faults_geojson: detail.faults_geojson as unknown as SimFeatureCollection,
    trips_geojson: detail.trips_geojson as unknown as SimFeatureCollection,
    combined_geojson: (detail.combined_geojson ?? undefined) as unknown as
      | SimFeatureCollection
      | undefined,
    routes_data: (detail.routes_data ?? undefined) as unknown as
      | SimVehicleRoute[]
      | undefined,
    vroom_summary: {
      duration: detail.total_duration_s ?? undefined,
      distance: detail.total_distance_m ?? undefined,
      unassigned: detail.unassigned_jobs ?? undefined,
    },
    cost_estimate:
      detail.api_cost_estimate != null
        ? { estimated_cost_eur: detail.api_cost_estimate }
        : null,
    scenario_state: detail.scenario_state,
    is_remix: Boolean(detail.is_remix),
    parent_run_id: detail.parent_run_id ?? null,
  };
}
