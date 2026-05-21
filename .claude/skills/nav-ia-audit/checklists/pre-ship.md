# Pre-ship checklist for navigation changes

Gates to pass before merging a PR that touches the shell. Anything below is a block, not a "nit."

## Functional

- [ ] **Refresh on every route lands on the same view.** Test 5+ routes including a detail page.
- [ ] **Browser back walks the visit stack.** No surprise jumps to the home screen.
- [ ] **Browser forward works after going back.**
- [ ] **Deep link a route in an incognito window** → routed to login → after sign-in, land on the deep-linked route.
- [ ] **Switch projects** preserves the section if it exists for the new project.
- [ ] **Sign in / sign out round-trips** with no console errors.
- [ ] **A 404 / unknown route** shows a clear "Not found, [Back to projects]" — not a blank page.

## Keyboard

- [ ] **Tab through the whole shell** with no mouse. Focus order matches visual order.
- [ ] **Focus ring visible** on every focusable element.
- [ ] **Escape closes** the topmost modal, popover, or drawer — and nothing else.
- [ ] **Enter** submits forms and activates buttons.
- [ ] **Avatar menu, project chip, breadcrumb** all keyboard-reachable.

## A11y

- [ ] **axe DevTools** scan shows no Critical or Serious issues on the shell.
- [ ] **Landmarks present** — `<header>`, `<nav>`, `<main>`, `<footer>` (and `<aside>` if applicable).
- [ ] **Icon-only buttons** have `aria-label`.
- [ ] **Modals** have `role="dialog"`, `aria-modal="true"`, label, focus trap, scroll lock.
- [ ] **Live region** announces toasts.

## Visual

- [ ] **WCAG AA contrast** for all text and UI controls in the shell.
- [ ] **`prefers-reduced-motion`** honored — no swooping animations when set.
- [ ] **Light and dark mode** (if supported) both pass contrast independently.
- [ ] **Active nav item** is clearly distinguishable from inactive ones.

## Responsive

- [ ] **375px (mobile)**: bottom tab bar or drawer; modals full-screen; readable text.
- [ ] **768px (tablet)**: rail or top bar adapts; no horizontal scroll.
- [ ] **1280px (laptop)**: default desktop layout.
- [ ] **1920px (large)**: max-width clamps prevent unreadable line lengths.

## Performance

- [ ] **First navigation after sign-in** ≤ 500ms (TTI on the project picker).
- [ ] **Switching sections** doesn't refetch unchanged project data.
- [ ] **In-flight requests** cancel on route change (AbortController).
- [ ] **No layout shift** on route transitions (skeletons same shape as content).

## Errors

- [ ] **Network failure** on a section shows a retry button, not a blank.
- [ ] **401 mid-session** opens the re-auth modal.
- [ ] **Permission denied** on a route shows a "no access" page with options.

## Telemetry / debuggability

- [ ] **Each route logs a page-view event** with the route name.
- [ ] **Navigation events** distinguishable from initial page loads in analytics.
- [ ] **Console** clean of warnings/errors on the happy path.

## Documentation

- [ ] **The route table** is updated if new routes added.
- [ ] **The shell layout doc** is updated if shell-level components changed.
- [ ] **CHANGELOG / release notes** mention any user-visible nav changes.
