/**
 * History (test runs) service. Reads completed solves from the FastAPI
 * `/api/history` endpoints. The backend regenerates GeoJSON layers on demand
 * for the detail view. Both endpoints require the project id as a query param.
 */

import { apiFetch } from '@/lib/api';
import type { TestRun, TestRunDetail } from '@/types';

export interface ListTestRunsOptions {
  limit?: number;
  /** When true, returns remix runs instead of primary dispatches. */
  remix?: boolean;
}

/** List recent test runs for a project, newest first. */
export async function listTestRuns(
  projectId: string,
  opts: ListTestRunsOptions = {},
): Promise<TestRun[]> {
  const params = new URLSearchParams({ project_id: projectId });
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.remix) params.set('remix', 'true');
  return apiFetch<TestRun[]>(`/history?${params.toString()}`, { method: 'GET' });
}

/** Fetch the full detail of a single test run (for view / replay). */
export async function getTestRun(
  projectId: string,
  runId: string,
): Promise<TestRunDetail> {
  const params = new URLSearchParams({ project_id: projectId });
  return apiFetch<TestRunDetail>(
    `/history/${encodeURIComponent(runId)}?${params.toString()}`,
    { method: 'GET' },
  );
}
