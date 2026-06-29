/**
 * Project settings service. Wraps the key/value `global_settings` table.
 * The legacy app stored the depot under key `main_depot` as a stringified
 * [lon, lat] array; this module parses/serialises it into a typed shape.
 */

import { supabase } from '@/lib/supabase';
import type { GlobalSettings } from '@/types';

const DEPOT_KEY = 'main_depot';
/** Central London fallback depot ([lon, lat], GeoJSON order). */
const DEFAULT_DEPOT: [number, number] = [-0.1278, 51.5074];

interface SettingRow {
  key: string;
  value: string;
}

/** Fetch decoded global settings for a project. */
export async function getGlobalSettings(
  projectId: string,
): Promise<GlobalSettings> {
  const { data, error } = await supabase
    .from('global_settings')
    .select('key, value')
    .eq('project_id', projectId)
    .overrideTypes<SettingRow[]>();
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const depotRow = rows.find((r) => r.key === DEPOT_KEY);

  let mainDepot: [number, number] = DEFAULT_DEPOT;
  if (depotRow?.value) {
    try {
      const parsed = JSON.parse(depotRow.value);
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        typeof parsed[0] === 'number' &&
        typeof parsed[1] === 'number'
      ) {
        mainDepot = [parsed[0], parsed[1]];
      }
    } catch {
      /* malformed value — fall back to default depot */
    }
  }

  return { mainDepot };
}

export interface GlobalSettingsPatch {
  /** Depot as [lon, lat] (GeoJSON order). */
  mainDepot?: [number, number];
}

/** Upsert global settings for a project. Only provided keys are written. */
export async function saveGlobalSettings(
  projectId: string,
  patch: GlobalSettingsPatch,
): Promise<void> {
  if (patch.mainDepot) {
    const { error } = await supabase.from('global_settings').upsert({
      key: DEPOT_KEY,
      project_id: projectId,
      value: JSON.stringify(patch.mainDepot),
    });
    if (error) throw new Error(error.message);
  }
}
