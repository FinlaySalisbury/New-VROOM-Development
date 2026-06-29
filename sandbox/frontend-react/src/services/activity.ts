/**
 * Activity log service. Reads/writes the `activity_log` table, mirroring the
 * legacy loadActivityLog (paged, filterable) and logActivity (fire-and-forget
 * insert) helpers.
 */

import { supabase } from '@/lib/supabase';
import type { ActivityEntry, ActivityQueryOptions } from '@/types';

const DEFAULT_PAGE_SIZE = 30;

interface ActivityRow {
  id: string;
  user_id: string;
  action: string;
  category: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: { email: string | null; display_name: string | null } | null;
}

/**
 * List activity entries for a project, paged + filtered. Filters mirror the
 * legacy UI: category chips, per-user filter, and a "last N days" window.
 */
export async function listActivity(
  projectId: string,
  opts: ActivityQueryOptions = {},
): Promise<ActivityEntry[]> {
  const offset = opts.offset ?? 0;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;

  let query = supabase
    .from('activity_log')
    .select(
      'id, user_id, action, category, details, created_at, profiles!activity_log_user_id_fkey(email, display_name)',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (opts.category && opts.category !== 'all') {
    query = query.eq('category', opts.category);
  }
  if (opts.userId) {
    query = query.eq('user_id', opts.userId);
  }
  if (opts.sinceDays) {
    const since = new Date(
      Date.now() - opts.sinceDays * 86_400_000,
    ).toISOString();
    query = query.gte('created_at', since);
  }

  const { data, error } = await query.overrideTypes<ActivityRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    action: r.action,
    category: r.category,
    details: r.details ?? {},
    created_at: r.created_at,
    actor_email: r.profiles?.email ?? null,
    actor_display_name: r.profiles?.display_name ?? null,
  }));
}

export interface LogActivityInput {
  projectId: string;
  action: string;
  category: string;
  details?: Record<string, unknown>;
}

/**
 * Write an activity entry. Fire-and-forget by convention: failures are logged
 * but not thrown, so a logging hiccup never blocks the primary action.
 */
export async function logActivity(entry: LogActivityInput): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return;

  const { error } = await supabase.from('activity_log').insert({
    project_id: entry.projectId,
    user_id: user.id,
    action: entry.action,
    category: entry.category,
    details: entry.details ?? {},
  });
  if (error) {
    console.warn('Activity log write failed:', error.message);
  }
}
