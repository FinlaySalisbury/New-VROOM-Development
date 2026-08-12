import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { listProjects } from '@/services/projects';
import { Modal } from '@/components/Modal';
import type { ProjectRole } from '@/types';

interface NavItem {
  section: string;
  label: string;
  title: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    section: 'map',
    label: 'Map',
    title: 'Dispatch map',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    section: 'engineers',
    label: 'Engineers',
    title: 'Engineers',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    section: 'jobs',
    label: 'Jobs',
    title: 'Job batches',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    section: 'performance',
    label: 'Performance',
    title: 'Engineer performance & allocation preferences',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20a8 8 0 1 0-8-8" />
        <path d="M12 12l4.5-4.5" />
        <path d="M2 12h2" />
        <path d="M12 2v2" />
        <path d="M20.5 7.5 19 9" />
      </svg>
    ),
  },
  {
    section: 'history',
    label: 'Analytics',
    title: 'History & analytics',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    section: 'activity',
    label: 'Activity',
    title: 'Activity log',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

function initialsFromProfile(
  firstName?: string,
  lastName?: string,
  email?: string,
): string {
  const f = (firstName ?? '').trim();
  const l = (lastName ?? '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || '?';
  const e = (email ?? '').trim();
  return e ? e.charAt(0).toUpperCase() : '?';
}

/**
 * Authed app shell for /projects/:id/:section. Black nav rail with the
 * section links, project identity, user identity, project switcher and
 * logout, plus a <main> outlet for the active section.
 */
export function AppLayout() {
  const { id: routeProjectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Reset scroll to top on section change (react-router keeps the scroll
  // container's position otherwise).
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const projects = useAppStore((s) => s.projects);
  const projectRole = useAppStore((s) => s.projectRole);
  const userProfile = useAppStore((s) => s.userProfile);
  const session = useAppStore((s) => s.session);
  const selectProject = useAppStore((s) => s.selectProject);
  const setProjects = useAppStore((s) => s.setProjects);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const switchTo = (id: string, role: ProjectRole | null) => {
    setSwitcherOpen(false);
    if (id === routeProjectId) return;
    selectProject(id, role);
    navigate(`/projects/${id}/map`);
  };

  // On a deep link / refresh the store has no projects yet (the picker never
  // ran), so the active project's role can't be derived and role-gated UI (the
  // dispatch button, job import) stays hidden. Load memberships once we have a
  // session and the list is empty.
  useEffect(() => {
    if (!session || projects.length > 0) return;
    let active = true;
    listProjects()
      .then((p) => {
        if (active) {
          setProjects(
            p.map((x) => ({ id: x.id, name: x.name, description: x.description ?? undefined, role: x.role })),
          );
        }
      })
      .catch(() => {
        /* leave empty; role stays null until the user opens the picker */
      });
    return () => {
      active = false;
    };
  }, [session, projects.length, setProjects]);

  // Keep the store's active project in sync with the URL (deep links / refresh).
  useEffect(() => {
    if (!routeProjectId) return;
    const match = projects.find((p) => p.id === routeProjectId);
    selectProject(routeProjectId, match?.role ?? projectRole ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectId, projects]);

  const projectName =
    projects.find((p) => p.id === routeProjectId)?.name ?? 'Project';

  const firstName = userProfile?.first_name;
  const lastName = userProfile?.last_name;
  const email = userProfile?.email ?? session?.user?.email ?? '';
  const displayName =
    userProfile?.display_name ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    email;
  const initials = initialsFromProfile(firstName, lastName, email);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <nav className="nav-rail" aria-label="Primary">
        <div className="nav-brand">
          <img src="/assets/yuroute-icon@2x.png" alt="YuRoute" />
        </div>

        <div className="nav-group">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.section}
              to={`/projects/${routeProjectId}/${item.section}`}
              className={({ isActive }) =>
                isActive ? 'nav-btn active' : 'nav-btn'
              }
              title={item.title}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="nav-spacer" style={{ flexGrow: 1 }} />

        {/* Project name + role badge */}
        <div className="nav-project" style={{ padding: '8px 12px', marginBottom: 8, textAlign: 'center' }}>
          <div
            title={projectName}
            style={{
              fontSize: 11,
              fontWeight: 600,
              // The rail is a black surface — --app-fg is black and was invisible here.
              color: 'rgba(255,255,255,0.92)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 64,
              margin: '0 auto',
            }}
          >
            {projectName}
          </div>
          {projectRole && (
            <div
              style={{
                display: 'inline-block',
                marginTop: 4,
                padding: '1px 8px',
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                // Royal Blue text fails contrast on the black rail — Lavender is
                // the brand's supporting tone and clears AA here.
                background: 'rgba(157,187,255,0.16)',
                color: 'var(--yx-lavender, #9DBBFF)',
              }}
            >
              {projectRole}
            </div>
          )}
        </div>

        <button
          type="button"
          className="nav-btn"
          onClick={() => setSwitcherOpen(true)}
          title="Switch project"
          aria-haspopup="dialog"
          style={{ marginBottom: 4 }}
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </span>
          <span className="nav-label">Projects</span>
        </button>

        {/* User identity → profile */}
        <button
          type="button"
          className="nav-btn"
          onClick={() => navigate('/profile')}
          title="My profile"
          aria-label={`My profile${displayName ? `: ${displayName}` : ''}`}
          style={{ marginBottom: 4, height: 'auto', padding: '8px 4px' }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--yx-grad-deep-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
              fontSize: 13,
              fontWeight: 700,
              color: 'white',
            }}
          >
            {initials}
          </span>
          <span
            className="nav-label"
            style={{
              maxWidth: 64,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Profile
          </span>
        </button>

        <button
          type="button"
          className="nav-btn"
          onClick={handleLogout}
          title="Log out"
          style={{ marginBottom: 12 }}
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span className="nav-label">Log out</span>
        </button>

        <div className="nav-powered-by">
          <span className="powered-label">Powered by</span>
          <img
            src="/assets/logo-yunex-traffic-white.png"
            alt="Yunex Traffic"
            className="powered-logo"
          />
        </div>
        <div className="nav-version">v1.3</div>
      </nav>

      <main
        ref={mainRef}
        className="main-content"
        style={{ flex: 1, overflow: 'auto', position: 'relative' }}
      >
        <div key={location.pathname} className="route-fade">
          <Outlet />
        </div>
      </main>

      {switcherOpen && (
        <Modal open title="Switch project" onClose={() => setSwitcherOpen(false)}>
          <ul className="switcher-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`switcher-item${p.id === routeProjectId ? ' is-current' : ''}`}
                  onClick={() => switchTo(p.id, p.role ?? null)}
                >
                  <span className="switcher-name">{p.name}</span>
                  {p.role && <span className="switcher-role">{p.role}</span>}
                  {p.id === routeProjectId && <span className="switcher-current">Current</span>}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="switcher-manage"
            onClick={() => {
              setSwitcherOpen(false);
              navigate('/projects');
            }}
          >
            Manage all projects →
          </button>
        </Modal>
      )}
    </div>
  );
}
