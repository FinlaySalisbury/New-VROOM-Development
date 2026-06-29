import type { ProjectRole } from '@/types';

/**
 * Role-based access control, ported from the legacy app.js `canPerform` /
 * ROLE_HIERARCHY. Mirrors the Supabase RLS policy so the UI gates the same
 * actions the database enforces.
 */
const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  viewer: 0,
  user: 1,
  admin: 2,
  owner: 3,
};

export type ProjectAction =
  | 'view'
  | 'invite'
  | 'manage_members'
  | 'edit_project'
  | 'delete_project';

export function canPerform(
  role: ProjectRole | null,
  action: ProjectAction,
): boolean {
  const level = role ? ROLE_HIERARCHY[role] : -1;
  switch (action) {
    case 'view':
      return level >= 0;
    case 'invite':
      return level >= 3; // owner only — matches RLS
    case 'manage_members':
      return level >= 3; // owner only
    case 'edit_project':
      return level >= 3; // owner only
    case 'delete_project':
      return level >= 3;
    default:
      return false;
  }
}
