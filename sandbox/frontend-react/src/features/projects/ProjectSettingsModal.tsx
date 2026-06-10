import { useCallback, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { ErrorState } from '@/components/ErrorState';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import { friendlyError } from '@/lib/errors';
import {
  listMembers,
  listInvitations,
  sendInvite,
  revokeInvite,
  removeMember,
  changeRole,
  updateProject,
  leaveProject,
  deleteProject,
} from '@/services/projects';
import { canPerform } from './rolePermissions';
import type { Project, Member, Invitation, ProjectRole } from '@/types';

type SettingsTab = 'team' | 'invitations' | 'general';

const ROLE_OPTIONS: ProjectRole[] = ['viewer', 'user', 'admin', 'owner'];

export interface ProjectSettingsModalProps {
  open: boolean;
  project: Project | null;
  role: ProjectRole | null;
  onClose: () => void;
  /** Refresh the picker after rename. */
  onUpdated: () => void;
  /** Navigate away (back to picker) after leave/delete. */
  onExited: () => void;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function initialsFor(m: Member): string {
  const fn = m.first_name ?? '';
  const ln = m.last_name ?? '';
  if (fn) return (fn.charAt(0) + (ln ? ln.charAt(0) : '')).toUpperCase();
  return (m.email ?? m.user_id).substring(0, 2).toUpperCase();
}

function displayNameFor(m: Member): string {
  const full = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
  if (full) return full;
  if (m.display_name) return m.display_name;
  if (m.email) return m.email.split('@')[0];
  return `${m.user_id.substring(0, 8)}…`;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--app-bg-soft, var(--app-bg))',
  border: '1px solid var(--app-border)',
  borderRadius: 'var(--radius-md)',
};

/**
 * Project settings modal with Team / Invitations / General tabs.
 *
 * Ports legacy openProjectSettingsModal + loadTeamMembers / loadPendingInvites /
 * sendProjectInvite / revokeInvite / removeMember / changeRole / saveProjectDetails /
 * leaveProject / deleteProject. Role gating mirrors canPerform.
 *
 * STUBBED: the legacy invite-REQUEST subsystem (submitInviteRequest /
 * loadInviteRequests / approve|rejectInviteRequest) wrote directly to the
 * `invite_requests` table, which is not exposed by services/projects.ts. That
 * approve/reject flow is shown as a clearly-marked "coming soon" affordance.
 */
export function ProjectSettingsModal({
  open,
  project,
  role,
  onClose,
  onUpdated,
  onExited,
}: ProjectSettingsModalProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const userId = useAppStore((s) => s.userId);
  const setProjects = useAppStore((s) => s.setProjects);
  const projects = useAppStore((s) => s.projects);

  const canManage = canPerform(role, 'manage_members');
  const canInvite = canPerform(role, 'invite');
  const canEdit = canPerform(role, 'edit_project');

  const [tab, setTab] = useState<SettingsTab>('team');

  // Team
  const [members, setMembers] = useState<Member[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Invitations
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('viewer');
  const [sending, setSending] = useState(false);

  // General
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const inviteEmailId = useId();
  const inviteRoleId = useId();
  const nameId = useId();
  const descId = useId();

  const projectId = project?.id ?? null;

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    setMembers(null);
    setMembersError(null);
    try {
      setMembers(await listMembers(projectId));
    } catch (err) {
      setMembersError(friendlyError(err, 'Could not load members. Please try again.'));
    }
  }, [projectId]);

  const loadInvites = useCallback(async () => {
    if (!projectId || !canManage) return;
    setInvites(null);
    setInvitesError(null);
    try {
      setInvites(await listInvitations(projectId));
    } catch (err) {
      setInvitesError(friendlyError(err, 'Could not load invitations. Please try again.'));
    }
  }, [projectId, canManage]);

  // (Re)initialise when opened.
  useEffect(() => {
    if (!open || !project) return;
    setTab('team');
    setEditName(project.name ?? '');
    setEditDesc(project.description ?? '');
    setInviteEmail('');
    setInviteRole('viewer');
    void loadMembers();
    void loadInvites();
  }, [open, project, loadMembers, loadInvites]);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    const email = inviteEmail.trim();
    if (!email) {
      toast('Email address is required.', { variant: 'warning' });
      return;
    }
    setSending(true);
    try {
      await sendInvite(projectId, email, inviteRole);
      toast('Invitation sent — email notification delivered.', { variant: 'success' });
      setInviteEmail('');
      await loadInvites();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send invitation.', {
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(id: string) {
    const ok = await confirm({
      title: 'Revoke invitation',
      message: 'Revoke this pending invitation?',
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      await revokeInvite(id);
      toast('Invitation revoked.', { variant: 'info' });
      await loadInvites();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to revoke.', { variant: 'error' });
    }
  }

  async function handleRemoveMember(member: Member) {
    const ok = await confirm({
      title: 'Remove member',
      message: `Remove ${displayNameFor(member)} from this project?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok || !projectId) return;
    try {
      await removeMember(projectId, member.user_id);
      toast('Member removed.', { variant: 'info' });
      await loadMembers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove member.', {
        variant: 'error',
      });
    }
  }

  async function handleChangeRole(member: Member, newRole: ProjectRole) {
    if (!projectId || newRole === member.role) return;
    if (newRole === 'owner') {
      const ok = await confirm({
        title: 'Transfer ownership',
        message: `Make ${displayNameFor(member)} an owner? They will gain full control of the project.`,
        confirmLabel: 'Transfer',
      });
      if (!ok) {
        await loadMembers();
        return;
      }
    }
    try {
      await changeRole(projectId, member.user_id, newRole);
      toast('Role updated.', { variant: 'success' });
      await loadMembers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update role.', {
        variant: 'error',
      });
      await loadMembers();
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    const name = editName.trim();
    if (!name) {
      toast('Project name cannot be empty.', { variant: 'warning' });
      return;
    }
    setSavingDetails(true);
    try {
      await updateProject(projectId, { name, description: editDesc.trim() });
      toast('Project updated.', { variant: 'success' });
      setProjects(
        projects.map((p) =>
          p.id === projectId ? { ...p, name, description: editDesc.trim() } : p,
        ),
      );
      onUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update project.', {
        variant: 'error',
      });
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleLeave() {
    if (!projectId) return;
    const ok = await confirm({
      title: 'Leave project',
      message: 'Leave this project? You will lose access to all of its data.',
      confirmLabel: 'Leave project',
      destructive: true,
    });
    if (!ok) return;
    try {
      await leaveProject(projectId);
      toast('You have left the project.', { variant: 'info' });
      onExited();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to leave project.', {
        variant: 'error',
      });
    }
  }

  async function handleDelete() {
    if (!projectId || !project) return;
    const ok = await confirm({
      title: 'Delete project',
      message: `Permanently delete "${project.name}"? All engineers, jobs and history will be lost. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteProject(projectId);
      toast('Project deleted.', { variant: 'info' });
      onExited();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete project.', {
        variant: 'error',
      });
    }
  }

  if (!project) return null;

  const tabBtn = (key: SettingsTab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`settings-tab-${key}`}
      aria-selected={tab === key}
      aria-controls={`settings-panel-${key}`}
      className={tab === key ? 'settings-tab active' : 'settings-tab'}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} title="Project settings" onClose={onClose} size="lg">
      <div
        role="tablist"
        aria-label="Project settings sections"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--app-border)',
          marginBottom: 'var(--space-5)',
          flexWrap: 'wrap',
        }}
      >
        {tabBtn('team', 'Team')}
        {canManage && tabBtn('invitations', 'Invitations')}
        {tabBtn('general', 'General')}
      </div>

      {/* ── Team ─────────────────────────────────────────── */}
      {tab === 'team' && (
        <div
          role="tabpanel"
          id="settings-panel-team"
          aria-labelledby="settings-tab-team"
        >
          {canInvite ? (
            <form
              onSubmit={handleSendInvite}
              style={{ marginBottom: 'var(--space-6)' }}
              noValidate
            >
              <h3
                style={{
                  fontSize: 'var(--fs-small)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-caps)',
                  color: 'var(--app-fg-muted)',
                  margin: '0 0 var(--space-3)',
                }}
              >
                Invite team member
              </h3>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                }}
              >
                <div className="form-group" style={{ flex: '1 1 220px', margin: 0 }}>
                  <label className="form-label" htmlFor={inviteEmailId}>
                    Email
                  </label>
                  <input
                    id={inviteEmailId}
                    type="email"
                    className="form-input"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    autoComplete="email"
                  />
                </div>
                <div className="form-group" style={{ width: '150px', margin: 0 }}>
                  <label className="form-label" htmlFor={inviteRoleId}>
                    Role
                  </label>
                  <select
                    id={inviteRoleId}
                    className="form-input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="primary" loading={sending}>
                  Invite
                </Button>
              </div>
            </form>
          ) : (
            <p
              style={{
                margin: '0 0 var(--space-6)',
                fontSize: 'var(--fs-small)',
                color: 'var(--app-fg-muted)',
              }}
            >
              Only project owners can invite or request new members.
            </p>
          )}

          <h3
            style={{
              fontSize: 'var(--fs-small)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-caps)',
              color: 'var(--app-fg-muted)',
              margin: '0 0 var(--space-3)',
            }}
          >
            Team members
          </h3>
          {membersError ? (
            <ErrorState message={membersError} onRetry={loadMembers} />
          ) : members === null ? (
            <LoadingSkeleton count={3} height="56px" grid={false} label="Loading members" />
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              {members.map((m) => {
                const isMe = m.user_id === userId;
                const editable = canManage && !isMe && m.role !== 'owner';
                return (
                  <li key={m.user_id} style={rowStyle}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        minWidth: 0,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: 'var(--radius-pill)',
                          background: isMe
                            ? 'var(--yx-grad-deep-blue)'
                            : 'var(--app-border)',
                          color: isMe ? '#fff' : 'var(--app-fg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {initialsFor(m)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 'var(--fs-small)',
                            fontWeight: 500,
                            color: 'var(--app-fg)',
                          }}
                        >
                          {displayNameFor(m)}
                          {isMe && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 11,
                                color: 'var(--yx-royal-blue)',
                                fontWeight: 600,
                              }}
                            >
                              (you)
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--app-fg-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {m.email ?? m.user_id}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        flexShrink: 0,
                      }}
                    >
                      {editable ? (
                        <>
                          <label
                            className="sr-only"
                            htmlFor={`role-${m.user_id}`}
                            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
                          >
                            Change role for {displayNameFor(m)}
                          </label>
                          <select
                            id={`role-${m.user_id}`}
                            className="form-input"
                            style={{ width: '110px', height: 'auto', padding: '4px 8px', fontSize: 12 }}
                            value={m.role}
                            onChange={(e) =>
                              handleChangeRole(m, e.target.value as ProjectRole)
                            }
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${displayNameFor(m)}`}
                            onClick={() => handleRemoveMember(m)}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <span className="yx-badge yx-badge-light">{m.role}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── Invitations ──────────────────────────────────── */}
      {tab === 'invitations' && canManage && (
        <div
          role="tabpanel"
          id="settings-panel-invitations"
          aria-labelledby="settings-tab-invitations"
        >
          <div
            style={{
              border: '1px dashed var(--app-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              marginBottom: 'var(--space-6)',
              color: 'var(--app-fg-muted)',
              fontSize: 'var(--fs-small)',
            }}
          >
            {/* TODO(invite-requests): the legacy approve/reject invite-request
               flow (submitInviteRequest / loadInviteRequests /
               approve|rejectInviteRequest) writes directly to the
               `invite_requests` table, which is not exposed by
               services/projects.ts. Wire a service first, then restore the
               approve/reject list here. */}
            <strong style={{ color: 'var(--app-fg)' }}>Pending requests</strong> — member
            request approvals are coming soon.
          </div>

          <h3
            style={{
              fontSize: 'var(--fs-small)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-caps)',
              color: 'var(--app-fg-muted)',
              margin: '0 0 var(--space-3)',
            }}
          >
            Pending invitations
          </h3>
          {invitesError ? (
            <ErrorState message={invitesError} onRetry={loadInvites} />
          ) : invites === null ? (
            <LoadingSkeleton count={2} height="48px" grid={false} label="Loading invitations" />
          ) : invites.length === 0 ? (
            <p
              style={{ color: 'var(--app-fg-muted)', fontSize: 'var(--fs-small)', margin: 0 }}
            >
              No pending invitations.
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              {invites.map((inv) => (
                <li key={inv.id} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-small)', color: 'var(--app-fg)' }}>
                      {inv.email}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--app-fg-muted)' }}>
                      Invited as {inv.role}
                      {inv.created_at ? ` · ${timeAgo(inv.created_at)}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(inv.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── General ──────────────────────────────────────── */}
      {tab === 'general' && (
        <div
          role="tabpanel"
          id="settings-panel-general"
          aria-labelledby="settings-tab-general"
        >
          <form onSubmit={handleSaveDetails} style={{ marginBottom: 'var(--space-7)' }} noValidate>
            <h3
              style={{
                fontSize: 'var(--fs-small)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-caps)',
                color: 'var(--app-fg-muted)',
                margin: '0 0 var(--space-3)',
              }}
            >
              Project details
            </h3>
            <div className="form-group">
              <label className="form-label" htmlFor={nameId}>
                Project name
              </label>
              <input
                id={nameId}
                type="text"
                className="form-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={!canEdit}
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={descId}>
                Description
              </label>
              <input
                id={descId}
                type="text"
                className="form-input"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                disabled={!canEdit}
                autoComplete="off"
              />
            </div>
            {canEdit && (
              <Button type="submit" variant="primary" loading={savingDetails}>
                Save changes
              </Button>
            )}
          </form>

          <div
            style={{
              borderTop: '1px solid var(--app-border)',
              paddingTop: 'var(--space-5)',
            }}
          >
            <h3
              style={{
                fontSize: 'var(--fs-small)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-caps)',
                color: 'var(--app-fg)',
                margin: '0 0 var(--space-2)',
              }}
            >
              Danger zone
            </h3>
            <p
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--app-fg-muted)',
                margin: '0 0 var(--space-3)',
              }}
            >
              Leave this project or permanently delete it. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {role !== 'owner' && (
                <Button variant="secondary" onClick={handleLeave}>
                  Leave project
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="secondary"
                  onClick={handleDelete}
                  data-destructive
                >
                  Delete project
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
