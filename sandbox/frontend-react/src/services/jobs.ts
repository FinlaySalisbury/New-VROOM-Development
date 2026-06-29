/**
 * Job lists service. Each job list is stored as a JSONB `data` payload in the
 * `job_lists` table, keyed by (id, project_id). Mirrors the legacy
 * StorageManager.getJobLists / saveJobLists behaviour.
 */

import { supabase } from '@/lib/supabase';
import type { JobList } from '@/types';

interface JobListRow {
  data: JobList;
}

/** List all job lists for a project. */
export async function listJobLists(projectId: string): Promise<JobList[]> {
  const { data, error } = await supabase
    .from('job_lists')
    .select('data')
    .eq('project_id', projectId)
    .overrideTypes<JobListRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.data);
}

/**
 * Replace the full job-list set for a project (legacy bulk path: delete rows
 * not in the current id set, then upsert).
 */
export async function saveJobLists(
  projectId: string,
  lists: JobList[],
): Promise<void> {
  const ids = lists.map((l) => l.id);

  let del = supabase.from('job_lists').delete().eq('project_id', projectId);
  if (ids.length > 0) {
    del = del.not('id', 'in', `(${ids.join(',')})`);
  }
  const { error: delErr } = await del;
  if (delErr) throw new Error(delErr.message);

  if (lists.length > 0) {
    const rows = lists.map((l) => ({
      id: l.id,
      project_id: projectId,
      data: l,
    }));
    const { error: upErr } = await supabase.from('job_lists').upsert(rows);
    if (upErr) throw new Error(upErr.message);
  }
}

/** Insert or update a single job list. */
export async function saveJobList(
  projectId: string,
  list: JobList,
): Promise<void> {
  const { error } = await supabase
    .from('job_lists')
    .upsert({ id: list.id, project_id: projectId, data: list });
  if (error) throw new Error(error.message);
}

/** Delete a single job list by id. */
export async function deleteJobList(
  projectId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('job_lists')
    .delete()
    .match({ project_id: projectId, id });
  if (error) throw new Error(error.message);
}
