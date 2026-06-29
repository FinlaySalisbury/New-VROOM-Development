/**
 * router — hash-based router for VROOM sandbox.
 *
 * URL contract:
 *   #/login                       — auth overlay
 *   #/profile                     — profile management overlay
 *   #/projects                    — project picker
 *   #/projects/<id>               — implicit redirect to <id>/map
 *   #/projects/<id>/<section>     — app shell with section active
 *
 * The router owns visibility of #auth-overlay / #profile-overlay /
 * #project-overlay / #app-layout and delegates data loading to existing
 * app.js functions:
 *   • loadProjectDashboard()  — when entering #/projects
 *   • selectProject(id, role) — when entering a new project
 *   • _renderSection(name)    — when changing section within a project
 *
 * State is read from AppState. The boot gate (AppState.boot === 'pending')
 * prevents the cold-start flash where the auth overlay shows for one frame
 * before Supabase's getSession() resolves.
 */
(function () {
    'use strict';

    const KNOWN_SECTIONS = new Set(['map', 'engineers', 'jobs', 'history', 'activity']);
    let currentRoute = null;

    function parseHash() {
        const raw = location.hash.replace(/^#/, '');
        const segs = raw.split('/').filter(Boolean);
        if (segs.length === 0) return { kind: 'root' };
        if (segs[0] === 'login') return { kind: 'login' };
        if (segs[0] === 'profile') return { kind: 'profile' };
        if (segs[0] === 'projects') {
            if (segs.length === 1) return { kind: 'picker' };
            if (segs.length === 2) return { kind: 'project', id: decodeURIComponent(segs[1]) };
            return { kind: 'section', id: decodeURIComponent(segs[1]), section: segs[2] };
        }
        return { kind: 'unknown' };
    }

    function showSurfaces({ auth, profile, picker, app }) {
        const a = document.getElementById('auth-overlay');
        const r = document.getElementById('profile-overlay');
        const p = document.getElementById('project-overlay');
        const l = document.getElementById('app-layout');
        if (a) a.style.display = auth    ? 'flex' : 'none';
        if (r) r.style.display = profile ? 'flex' : 'none';
        if (p) p.style.display = picker  ? 'flex' : 'none';
        if (l) l.style.display = app     ? 'flex' : 'none';
    }

    function findProjectInCache(id) {
        const list = AppState.get('projects');
        if (!Array.isArray(list)) return null;
        return list.find((p) => p.id === id) || null;
    }

    function replaceHash(path) {
        const target = '#' + (path.startsWith('/') ? path : '/' + path);
        if (location.hash === target) return false;
        history.replaceState(null, '', target);
        return true;
    }

    let routing = false;
    async function route() {
        if (routing) return;
        if (AppState.get('boot') === 'pending') return;
        routing = true;
        try {
            while (true) {
                document.body.classList.remove('auth-pending');

                const r = parseHash();
                const session = AppState.get('session');

                // ── Unauthenticated → force #/login ─────────────────────
                if (!session) {
                    if (r.kind !== 'login') {
                        if (replaceHash('/login')) continue;
                    }
                    showSurfaces({ auth: true, profile: false, picker: false, app: false });
                    currentRoute = { kind: 'login' };
                    AppState.set('route', currentRoute);
                    return;
                }

                // ── Authenticated ──────────────────────────────────────

                // Profile page
                if (r.kind === 'profile') {
                    showSurfaces({ auth: false, profile: true, picker: false, app: false });
                    currentRoute = { kind: 'profile' };
                    AppState.set('route', currentRoute);
                    if (typeof loadProfilePage === 'function') loadProfilePage();
                    return;
                }

                // Root, login, or unknown while signed-in → projects.
                if (r.kind === 'root' || r.kind === 'login' || r.kind === 'unknown') {
                    if (replaceHash('/projects')) continue;
                }

                if (r.kind === 'picker') {
                    showSurfaces({ auth: false, profile: false, picker: true, app: false });
                    currentRoute = { kind: 'picker' };
                    AppState.set('route', currentRoute);
                    if (typeof loadProjectDashboard === 'function') {
                        await loadProjectDashboard();
                    }
                    return;
                }

                if (r.kind === 'project') {
                    if (replaceHash('/projects/' + encodeURIComponent(r.id) + '/map')) continue;
                }

                if (r.kind === 'section') {
                    if (!KNOWN_SECTIONS.has(r.section)) {
                        if (replaceHash('/projects/' + encodeURIComponent(r.id) + '/map')) continue;
                    }

                    let proj = findProjectInCache(r.id);
                    if (!proj && typeof fetchProjects === 'function') {
                        await fetchProjects();
                        proj = findProjectInCache(r.id);
                    }
                    if (!proj) {
                        if (typeof toast === 'function') toast('Project not found.', { variant: 'error' });
                        if (replaceHash('/projects')) continue;
                        return;
                    }

                    const currentId = AppState.get('projectId');
                    if (currentId !== r.id) {
                        if (typeof selectProject === 'function') await selectProject(r.id, proj.role);
                    }

                    showSurfaces({ auth: false, profile: false, picker: false, app: true });
                    if (typeof _renderSection === 'function') _renderSection(r.section);

                    currentRoute = { kind: 'section', id: r.id, section: r.section };
                    AppState.set('route', currentRoute);
                    return;
                }

                break;
            }
        } finally {
            routing = false;
        }
    }

    function navigate(path) {
        const target = '#' + (path.startsWith('/') ? path : '/' + path);
        if (location.hash === target) {
            route();
        } else {
            location.hash = target;
        }
    }

    function current() { return currentRoute; }

    function init() {
        window.addEventListener('hashchange', route);
        AppState.subscribe('boot', (v) => { if (v === 'ready') route(); });
        AppState.subscribe('userId', () => route());
        if (AppState.get('boot') === 'ready') route();
    }

    window.router = { init, navigate, current };
})();
