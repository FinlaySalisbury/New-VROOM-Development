/**
 * Engineers service. Each engineer is stored as a JSONB `data` payload in the
 * `engineers` table, keyed by (id, project_id). Mirrors the legacy
 * StorageManager.getEngineers / saveEngineers behaviour.
 */

import { supabase } from '@/lib/supabase';
import type { Engineer } from '@/types';

interface EngineerRow {
  data: Engineer;
}

/** List all engineers for a project. */
export async function listEngineers(projectId: string): Promise<Engineer[]> {
  const { data, error } = await supabase
    .from('engineers')
    .select('data')
    .eq('project_id', projectId)
    .overrideTypes<EngineerRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.data);
}

/**
 * Replace the full engineer set for a project. Deletes rows whose ids are no
 * longer present, then upserts the rest. This is the bulk path used by CSV
 * import / migration (legacy saveEngineers).
 */
export async function saveEngineers(
  projectId: string,
  engineers: Engineer[],
): Promise<void> {
  const ids = engineers.map((e) => e.id);

  let del = supabase.from('engineers').delete().eq('project_id', projectId);
  if (ids.length > 0) {
    del = del.not('id', 'in', `(${ids.join(',')})`);
  }
  const { error: delErr } = await del;
  if (delErr) throw new Error(delErr.message);

  if (engineers.length > 0) {
    const rows = engineers.map((e) => ({
      id: e.id,
      project_id: projectId,
      data: e,
    }));
    const { error: upErr } = await supabase.from('engineers').upsert(rows);
    if (upErr) throw new Error(upErr.message);
  }
}

/** Insert or update a single engineer. */
export async function saveEngineer(
  projectId: string,
  engineer: Engineer,
): Promise<void> {
  const { error } = await supabase
    .from('engineers')
    .upsert({ id: engineer.id, project_id: projectId, data: engineer });
  if (error) throw new Error(error.message);
}

/** Delete a single engineer by id. */
export async function deleteEngineer(
  projectId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('engineers')
    .delete()
    .match({ project_id: projectId, id });
  if (error) throw new Error(error.message);
}
