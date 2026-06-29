import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { friendlyError } from '@/lib/errors';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useToast } from '@/components/Toast';
import {
  listProjects,
  listIncomingInvitations,
  acceptInvitation,
  declineInvitation,
} from '@/services/projects';
import type { Project, IncomingInvitation, ProjectRole } from '@/types';
import { CreateProjectModal } from './CreateProjectModal';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { canPerform } from './rolePermissions';

/**
 * Project picker — a full-screen overlay at /projects (no nav rail), on the
 * Yunex Silver gradient. Ports legacy loadProjectDashboard / fetchProjects /
 * selectProject / fetchInvitations + the create and settings modals.
 */
export function ProjectsView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const session = useAppStore((s) => s.session);
  const setProjects = useAppStore((s) => s.setProjects);
  const selectProject = useAppStore((s) => s.selectProject);

  const [projects, setLocalProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [invites, setInvites] = useState<IncomingInvitation[]>([]);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Project | null>(null);

  const email = session?.user?.email ?? '';

  const loadProjects = useCallback(async () => {
    setLocalProjects(null);
    setProjectsError(null);
    try {
      const list = await listProjects();
      setLocalProjects(list);
      setProjects(
        list.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? undefined,
          role: p.role,
        })),
      );
    } catch (err) {
      setProjectsError(friendlyError(err, 'Could not load your projects. Please try again.'));
    }
  }, [setProjects]);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await listIncomingInvitations());
    } catch {
      // Non-critical: incoming invitations are supplementary.
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    void loadInvites();
  }, [loadProjects, loadInvites]);

  function openProject(p: Project) {
    selectProject(p.id, (p.role ?? null) as ProjectRole | null);
    navigate(`/projects/${encodeURIComponent(p.id)}/map`);
  }

  async function handleAccept(id: string) {
    setBusyInvite(id);
    try {
      await acceptInvitation(id);
      toast('Invitation accepted.', { variant: 'success' });
      await Promise.all([loadProjects(), loadInvites()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to accept invitation.', {
        variant: 'error',
      });
    } finally {
      setBusyInvite(null);
    }
  }

  async function handleDecline(id: string) {
    setBusyInvite(id);
    try {
      await declineInvitation(id);
      toast('Invitation declined.', { variant: 'info' });
      await loadInvites();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to decline invitation.', {
        variant: 'error',
      });
    } finally {
      setBusyInvite(null);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="project-overlay">
      <div className="project-dashboard">
        {/* User identity bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-5)',
            paddingBottom: 'var(--space-3)',
            borderBottom: '1px solid var(--app-border)',
          }}
        >
          {email && (
            <span
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--app-fg-muted)',
              }}
            >
              {email}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>

        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
            marginBottom: 'var(--space-7)',
          }}
        >
          <div>
            <h1 className="view-title">Your projects</h1>
            <p className="view-subtitle">Select a workspace to view dispatch runs</p>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + New project
          </Button>
        </header>

        {/* Incoming invitations */}
        {invites.length > 0 && (
          <section
            aria-label="Pending invitations"
            style={{
              marginBottom: 'var(--space-7)',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--app-border)',
              background: 'var(--yx-grad-frosted)',
            }}
          >
            <h2
              style={{
                margin: '0 0 var(--space-4)',
                fontSize: 'var(--fs-h4)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: 'var(--app-fg)',
              }}
            >
              Pending invitations
            </h2>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--app-card)',
                    border: '1px solid var(--app-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--app-fg)' }}>
                      {inv.project_name ?? 'A project'}
                    </div>
                    <div style={{ fontSize: 'var(--fs-small)', color: 'var(--app-fg-muted)' }}>
                      Invited as {inv.role}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyInvite === inv.id}
                      onClick={() => handleAccept(inv.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyInvite === inv.id}
                      onClick={() => handleDecline(inv.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Active workspaces */}
        <h2
          style={{
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--fs-small)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-caps)',
            color: 'var(--app-fg-muted)',
          }}
        >
          Active workspaces
        </h2>

        {projectsError ? (
          <ErrorState message={projectsError} onRetry={loadProjects} />
        ) : projects === null ? (
          <LoadingSkeleton count={3} height="120px" />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create your first workspace to start planning dispatch runs."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                + New project
              </Button>
            }
          />
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-5)',
            }}
          >
            {projects.map((p) => (
              <li key={p.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="project-card"
                  onClick={() => openProject(p)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    background: 'var(--app-card)',
                  }}
                >
                  <span className="project-card-title">{p.name}</span>
                  {p.description && (
                    <span className="project-card-desc">{p.description}</span>
                  )}
                  {p.role && (
                    <span className="project-card-role">Role: {p.role.toUpperCase()}</span>
                  )}
                </button>
                {canPerform(p.role ?? null, 'view') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Settings for ${p.name}`}
                    onClick={() => setSettingsFor(p)}
                    style={{
                      position: 'absolute',
                      top: 'var(--space-3)',
                      right: 'var(--space-3)',
                    }}
                  >
                    Settings
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void loadProjects();
        }}
      />

      <ProjectSettingsModal
        open={settingsFor !== null}
        project={settingsFor}
        role={settingsFor?.role ?? null}
        onClose={() => setSettingsFor(null)}
        onUpdated={() => void loadProjects()}
        onExited={() => {
          setSettingsFor(null);
          void loadProjects();
        }}
      />
    </div>
  );
}

export default ProjectsView;
