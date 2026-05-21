# Workflow 04 — implement, smallest reversible edits first

Goal: turn the gap report and target state into an ordered punch list of code changes.

## Principles

- **Smallest reversible change first.** Each step should be its own commit and could be reverted without unwinding later work.
- **Foundations before features.** Add the router *before* the breadcrumbs. Add the modal primitive *before* refactoring modals onto it.
- **P0 before P1 before P2.** Within the same severity, smaller before bigger.
- **Each step is independently verifiable.** Manual test plan in the commit message.
- **Don't bundle the framework migration with anything else.** That's its own initiative (see SKILL.md scope note).

## Ordering recipe

Build the punch list as follows:

### Step 1 — Foundations (must happen before features)

1. **Add the router.** Hash router or History API, ~80 LOC. Wire to the existing `switchAppView` so visible behavior is unchanged.
2. **Add the modal primitive.** One module that handles backdrop, stack, focus trap, scroll lock, ARIA, ESC. Refactor existing modals onto it.
3. **Add a session/store module** (single source of truth for `currentProject`, `currentUser`). All shell components read from it.
4. **Add a toast / live region** for notifications.

These four pieces unblock everything else.

### Step 2 — Shell components

5. **Top bar component** (project chip placeholder + avatar placeholder).
6. **Project chip + switcher popover.**
7. **Avatar menu** with email, account settings link, sign-out.
8. **Breadcrumb component** (off by default, on when depth > 1).
9. **Replace the existing nav rail's "Settings" + "Logout" buttons** with proper routing into the avatar menu and account routes.

### Step 3 — Routes

10. **Auth routes**: /login, /login/forgot, /login/reset.
11. **/projects** route — promote the existing project picker overlay into a real route.
12. **/projects/<id>/<section>** routes — wire to existing view-switching code.
13. **/account** route — new screen for account settings.
14. **/projects/<id>/settings** route — promote the existing project-settings modal into a route (or keep as modal-with-URL).

### Step 4 — Edge handling

15. **401 interceptor** in the API client → re-auth modal.
16. **Forgot-password flow** using Supabase `resetPasswordForEmail`.
17. **Deep-link gating** with `?next=…`.
18. **Sign-out confirmation** + toast.

### Step 5 — Polish

19. **Skeletons for loading states** on each section.
20. **Empty states with CTAs** for each section.
21. **Error states with retry** for each fetch.
22. **`prefers-reduced-motion`** overrides.
23. **`:focus-visible` styles** app-wide.
24. **Landmarks**: replace shell `<div>`s with semantic elements.
25. **`aria-label`** on every icon-only button.

### Step 6 — Mobile

26. **Bottom tab bar** at ≤768px.
27. **Full-screen modals** at ≤480px.
28. **Safe-area insets** for iOS.

## Punch list format

For each step:

```markdown
### Step N — <Title>

- **Pillar:** <which audit pillar>
- **Severity:** P0 / P1 / P2 / P3
- **Effort:** 15m / 1h / 1d / 1w+
- **Files:** path/to/file.ext:line-range, path/to/other.ext:line-range
- **Change:** one-paragraph description of what to do.
- **Verify:** how to manually check this works.
- **Risk:** what could break, what to test for regressions.
```

## Commit conventions

- One step per commit.
- Commit message: `nav: add hash router` / `nav: extract modal primitive` / `nav: project chip + switcher`.
- Reference the audit doc / punch list item in the body.

## Verify before declaring done

Each step must pass before moving on:

- Manual smoke: sign in, switch project, navigate sections, sign out.
- Manual a11y: tab through the new component with no mouse, hit ESC where applicable.
- Refresh test: every route refresh-safe.
- Back/forward test: still works after this step.

After the full punch list lands, re-run the audit (workflow 02) and confirm every item moves to Pass.

## Deliverable

A markdown section titled "Punch list" with the ordered steps in the format above, plus a header summarizing total estimated effort (e.g., "12 days for foundations + shell + routes, +5 days polish, +3 days mobile = ~4 weeks for one engineer").

After completion, write a short "What we shipped" summary linking each step's commit.
