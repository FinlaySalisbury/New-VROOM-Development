# Routing & deep linking

The URL is part of the IA. If your nav doesn't change the URL, you don't have nav — you have view-toggling.

## The URL contract

Every distinct screen state worth bookmarking, sharing, or refreshing into must have a unique URL. Things that should be in the URL:

- Current project / workspace / org.
- Current section (Map, Engineers, Jobs, …).
- Current sub-resource (engineer ID, run ID, batch ID).
- Filter/sort state for views where shared URLs are common.
- Modal opened with deep data (e.g., "review engineer X" modal).

Things that should NOT be in the URL:

- Transient UI state (which accordion section is open).
- Form draft content.
- Scroll position.

## URL shape

For multi-tenant SaaS:

```
/                           — landing or redirect to /projects
/login                      — auth
/projects                   — project picker
/projects/<id>              — project home (default section)
/projects/<id>/map          — section
/projects/<id>/engineers    — section
/projects/<id>/engineers/<engId>  — detail
/projects/<id>/settings     — project settings
/account                    — account settings (user-scoped)
```

Notes:

- Project ID in path, not query string. Query string is for filters and ephemeral state.
- Resource IDs are URL-safe slugs or short codes. UUIDs are acceptable but ugly.
- Avoid nesting more than 3 levels. If you need more, your IA is too deep.

## Routing implementations (no-framework friendly)

### Hash router (simplest)

URLs look like `index.html#/projects/abc/engineers/123`. Page never reloads on navigation. Works without server-side rewriting.

Sketch:

```js
function parseRoute() {
  const hash = location.hash.slice(1) || '/';
  return hash.split('/').filter(Boolean); // ['projects', 'abc', 'engineers', '123']
}

function navigate(path) {
  if (location.hash !== '#' + path) location.hash = path;
}

window.addEventListener('hashchange', render);
window.addEventListener('load', render);

function render() {
  const segs = parseRoute();
  // dispatch on segs[0] === 'projects', etc.
}
```

- ~80 LOC for a routing system handling auth gate + project gate + sections + detail.
- No server changes needed.
- Refresh-safe.
- Back/forward work via `hashchange`.

### History API router (cleaner URLs)

URLs look like `/projects/abc/engineers/123`. Requires the server to serve `index.html` for any unknown path.

Sketch:

```js
function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
```

Pair with FastAPI: catch-all route that returns `index.html`, while API routes stay under `/api/*`. Easy.

### Trade-offs

- Hash router: fewer moving parts, zero server change. Worse for SEO (irrelevant for an authenticated app). URLs look slightly weird.
- History API router: cleaner URLs, better for analytics, mild backend wiring.

For an authenticated SaaS where no one will see the URL except logged-in users, hash is fine. For a marketing-adjacent surface or anything Google-indexable, History API.

## Refresh, back, forward — the three things that must work

- **Refresh**: reload to the same screen state.
- **Back**: previous screen state.
- **Forward**: next screen state if you've gone back.

If any of these breaks, the user no longer trusts the address bar, and stops sharing URLs.

## State derives from URL, not the other way

A common bug pattern:

```js
let currentProjectId = null;
function selectProject(id) {
  currentProjectId = id;
  hideOverlay();
  renderApp();
}
```

The URL is never touched. Refresh → app starts at the project picker again.

Fix:

```js
function selectProject(id) {
  navigate(`/projects/${id}`);
}
function render() {
  const projectId = parseRoute()[1];
  if (!projectId) return showProjectPicker();
  setCurrentProject(projectId);
  renderApp();
}
```

Now refresh is free. So is sharing. So is back.

## Loading and transitions

- Show a skeleton on the section content while route data loads — never blank screen.
- Update the URL **before** awaiting data. Users should see the address bar reflect the click immediately.
- Cancel in-flight fetches when the route changes (AbortController).
- Scroll to top on route change unless the change is within the same hierarchy level.

## Modals as routes

For modals with deep content (review engineer, view run details), make them part of the route:

```
/projects/abc/engineers/123          — engineer detail page
/projects/abc/engineers?modal=add    — "add engineer" modal open
```

Benefits: shareable, refresh-safe, back closes the modal.

Implementation: a `modal` query param the router watches; if present, mount the modal on top of the underlying route's content.

## Auth-gated routes

```js
function render() {
  const segs = parseRoute();

  if (!session && segs[0] !== 'login') {
    navigate('/login?next=' + encodeURIComponent(location.hash));
    return;
  }
  if (session && segs[0] === 'login') {
    navigate(params.get('next') || '/projects');
    return;
  }
  // ... rest of dispatch
}
```

On successful login, redirect to `next` so users can deep-link into the app from emails/Slack and land where they meant.

## Anti-patterns

- **Onclick → CSS class toggle** (the VROOM-pre-fix pattern). No URL, no refresh, no back.
- **Putting JWT or session data in the URL.** Tokens belong in headers / httpOnly cookies.
- **Routes that rerender from scratch** on every click. Use a renderer that diffs.
- **Routes that don't fall through to a 404.** Unknown route should land on a "Not found, [Go to projects]" page, not a blank.
