/**
 * Projects + membership + invitations service.
 *
 * Centralises the project/team Supabase calls that were scattered across the
 * legacy app.js (fetchProjects, createProject, loadTeamMembers, changeRole,
 * sendProjectInvite, etc.). Direct table reads go through the Supabase client;
 * invite emails go through the FastAPI `/api/invitations/*` endpoints.
 */

import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import type { ProjectRole } from '@/store/appStore';
import type { Project, Member, Invitation, IncomingInvitation } from '@/types';

// ── Row shapes returned by the Supabase joins ─────────────────

interface MembershipRow {
  project_id: string;
  role: ProjectRole;
  projects: { id: string; name: string; description: string | null } | null;
}

interface MemberRow {
  user_id: string;
  role: ProjectRole;
  profiles: {
    email: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

interface IncomingInviteRow {
  id: string;
  role: ProjectRole;
  projects: { name: string } | null;
}

// ── Projects ──────────────────────────────────────────────────

/**
 * List the projects the current user belongs to. Filters membership rows by
 * the authenticated user id so RLS does not surface other members' rows
 * (the legacy duplicate-card bug).
 */
export async function listProjects(): Promise<Project[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from('project_members')
    .select('project_id, role, projects(id, name, description)')
    .order('created_at', { ascending: false });
  if (user?.id) query = query.eq('user_id', user.id);

  const { data, error } = await query.overrideTypes<MembershipRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((m): m is MembershipRow & { projects: NonNullable<MembershipRow['projects']> } => Boolean(m.projects))
    .map((m) => ({
      id: m.projects.id,
      name: m.projects.name,
      description: m.projects.description,
      role: m.role,
    }));
}

/** Fetch a single project by id. */
export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Create a project owned by the current user. */
export async function createProject(
  name: string,
  description = '',
): Promise<Project> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('projects')
    .insert({ name, description, created_by: user.id })
    .select('id, name, description')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
}

/** Update a project's name / description. */
export async function updateProject(
  id: string,
  patch: ProjectPatch,
): Promise<void> {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Permanently delete a project (cascades to all project data). */
export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Remove the current user's own membership of a project. */
export async function leaveProject(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('project_members')
    .delete()
    .match({ project_id: id, user_id: user.id });
  if (error) throw new Error(error.message);
}

// ── Members ───────────────────────────────────────────────────

/** List members of a project, enriched with profile name/email. */
export async function listMembers(projectId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, role, profiles(email, display_name, first_name, last_name)')
    .eq('project_id', projectId)
    .overrideTypes<MemberRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    email: m.profiles?.email ?? null,
    display_name: m.profiles?.display_name ?? null,
    first_name: m.profiles?.first_name ?? null,
    last_name: m.profiles?.last_name ?? null,
  }));
}

/** Change a member's role within a project. */
export async function changeRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .update({ role })
    .match({ project_id: projectId, user_id: userId });
  if (error) throw new Error(error.message);
}

/** Remove a member from a project. */
export async function removeMember(
  projectId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .match({ project_id: projectId, user_id: userId });
  if (error) throw new Error(error.message);
}

// ── Invitations ───────────────────────────────────────────────

/** List pending invitations for a project (admin/owner view). */
export async function listInvitations(
  projectId: string,
): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, role, created_at')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Invitation[];
}

/**
 * Send a project invitation. Hits the FastAPI endpoint which inserts the
 * invitation row and emails the invitee via Resend.
 */
export async function sendInvite(
  projectId: string,
  email: string,
  role: ProjectRole,
): Promise<void> {
  await apiFetch('/invitations/send', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, email, role }),
  });
}

/** Revoke (delete) a pending invitation. */
export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from('invitations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * List pending invitations addressed to the *current user* — shown on the
 * project picker so they can accept/decline.
 */
export async function listIncomingInvitations(): Promise<IncomingInvitation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return [];

  const { data, error } = await supabase
    .from('invitations')
    .select('id, role, projects(name)')
    .eq('status', 'pending')
    .eq('email', user.email)
    .overrideTypes<IncomingInviteRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((inv) => ({
    id: inv.id,
    role: inv.role,
    project_name: inv.projects?.name ?? null,
  }));
}

/** Accept an invitation via the `accept_invitation` RPC. */
export async function acceptInvitation(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_invitation', {
    invite_id: inviteId,
  });
  if (error) throw new Error(error.message);
}

/** Decline an invitation (marks status = 'declined'). */
export async function declineInvitation(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'declined' })
    .eq('id', inviteId);
  if (error) throw new Error(error.message);
}
