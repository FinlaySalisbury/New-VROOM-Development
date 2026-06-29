/**
 * Sites service. Each site is stored as a JSONB `data` payload in the `sites`
 * table, keyed by (id, project_id). Sites are the geocoded reference points
 * that CSV-imported jobs are mapped onto.
 */

import { supabase } from '@/lib/supabase';
import type { Site } from '@/types';

interface SiteRow {
  data: Site;
}

/** List all sites for a project. */
export async function listSites(projectId: string): Promise<Site[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('data')
    .eq('project_id', projectId)
    .overrideTypes<SiteRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.data);
}

/**
 * Replace the full site set for a project (delete rows not in the current id
 * set, then upsert) — mirrors the engineer/job-list bulk pattern.
 */
export async function saveSites(
  projectId: string,
  sites: Site[],
): Promise<void> {
  const ids = sites.map((s) => s.id);

  let del = supabase.from('sites').delete().eq('project_id', projectId);
  if (ids.length > 0) {
    del = del.not('id', 'in', `(${ids.join(',')})`);
  }
  const { error: delErr } = await del;
  if (delErr) throw new Error(delErr.message);

  if (sites.length > 0) {
    const rows = sites.map((s) => ({
      id: s.id,
      project_id: projectId,
      data: s,
    }));
    const { error: upErr } = await supabase.from('sites').upsert(rows);
    if (upErr) throw new Error(upErr.message);
  }
}
