/**
 * router — hash-based router for VROOM sandbox.
 *
 * URL contract:
 *   #/login                       — auth overlay
 *   #/projects                    — project picker
 *   #/projects/<id>               — implicit redirect to <id>/map
 *   #/projects/<id>/<section>     — app shell with section active
 *
 * The router owns visibility of #auth-overlay / #project-overlay / #app-layout
 * and delegates data loading to existing app.js functions:
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

    const KNOWN_SECTIONS = new Set(['map', 'engineers', 'jobs', 'history']);
    let currentRoute = null;

    function parseHash() {
        const raw = location.hash.replace(/^#/, '');
        const segs = raw.split('/').filter(Boolean);
        if (segs.length === 0) return { kind: 'root' };
        if (segs[0] === 'login') return { kind: 'login' };
        if (segs[0] === 'projects') {
            if (segs.length === 1) return { kind: 'picker' };
            if (segs.length === 2) return { kind: 'project', id: decodeURIComponent(segs[1]) };
            return { kind: 'section', id: decodeURIComponent(segs[1]), section: segs[2] };
        }
        return { kind: 'unknown' };
    }

    function showSurfaces({ auth, picker, app }) {
        const a = document.getElementById('auth-overlay');
        const p = document.getElementById('project-overlay');
        const l = document.getElementById('app-layout');
        if (a) a.style.display = auth   ? 'flex' : 'none';
        if (p) p.style.display = picker ? 'flex' : 'none';
        if (l) l.style.display = app    ? 'flex' : 'none';
    }

    function findProjectInCache(id) {
        const list = AppState.get('projects');
        if (!Array.isArray(list)) return null;
        return list.find((p) => p.id === id) || null;
    }

    function replaceHash(path) {
        // location.replace('#x') doesn't navigate in all browsers — assign with
        // history.replaceState to avoid back-button traps on forced redirects.
        const target = '#' + (path.startsWith('/') ? path : '/' + path);
        if (location.hash === target) return false;
        history.replaceState(null, '', target);
        return true;
    }

    let routing = false;
    async function route() {
        if (routing) return;          // re-entrancy guard
        if (AppState.get('boot') === 'pending') return;
        routing = true;
        try {
            document.body.classList.remove('auth-pending');

            const r = parseHash();
            const session = AppState.get('session');

            // ── Unauthenticated → force #/login ─────────────────────
            if (!session) {
                if (r.kind !== 'login') {
                    if (replaceHash('/login')) return route();
                }
                showSurfaces({ auth: true, picker: false, app: false });
                currentRoute = { kind: 'login' };
                AppState.set('route', currentRoute);
                return;
            }

            // ── Authenticated ──────────────────────────────────────
            // Root or login while signed-in → projects.
            if (r.kind === 'root' || r.kind === 'login' || r.kind === 'unknown') {
                if (replaceHash('/projects')) return route();
            }

            if (r.kind === 'picker') {
                showSurfaces({ auth: false, picker: true, app: false });
                currentRoute = { kind: 'picker' };
                AppState.set('route', currentRoute);
                if (typeof loadProjectDashboard === 'function') {
                    // The existing function flips overlays itself (legacy). The
                    // showSurfaces() call above is authoritative; loadProjectDashboard
                    // re-flips to the same state which is a no-op.
                    await loadProjectDashboard();
                }
                return;
            }

            if (r.kind === 'project') {
                if (replaceHash('/projects/' + encodeURIComponent(r.id) + '/map')) return route();
            }

            if (r.kind === 'section') {
                if (!KNOWN_SECTIONS.has(r.section)) {
                    if (replaceHash('/projects/' + encodeURIComponent(r.id) + '/map')) return route();
                }

                // Validate membership against the cached list. If the cache is
                // empty (cold deep-link), fetch first.
                let proj = findProjectInCache(r.id);
                if (!proj && typeof fetchProjects === 'function') {
                    await fetchProjects();
                    proj = findProjectInCache(r.id);
                }
                if (!proj) {
                    if (typeof toast === 'function') toast('Project not found.', { variant: 'error' });
                    if (replaceHash('/projects')) return route();
                    return;
                }

                // Activate the project if it's different from current.
                const currentId = AppState.get('projectId');
                if (currentId !== r.id) {
                    if (typeof selectProject === 'function') await selectProject(r.id, proj.role);
                }

                showSurfaces({ auth: false, picker: false, app: true });
                if (typeof _renderSection === 'function') _renderSection(r.section);

                currentRoute = { kind: 'section', id: r.id, section: r.section };
                AppState.set('route', currentRoute);
                return;
            }
        } finally {
            routing = false;
        }
    }

    function navigate(path) {
        const target = '#' + (path.startsWith('/') ? path : '/' + path);
        if (location.hash === target) {
            // hashchange won't fire — invoke route() manually.
            route();
        } else {
            location.hash = target;
        }
    }

    function current() { return currentRoute; }

    function init() {
        window.addEventListener('hashchange', route);
        AppState.subscribe('boot',   (v) => { if (v === 'ready') route(); });
        // userId (not session) is the de-duping trigger — Supabase session
        // objects are recreated on every onAuthStateChange firing.
        AppState.subscribe('userId', () => route());
        if (AppState.get('boot') === 'ready') route();
    }

    window.router = { init, navigate, current };
})();
