# Workflow 03 — propose the target IA and shell

Goal: a concrete picture of what "good" looks like for this app. Not yet implementation — that's workflow 04.

## Steps

### 1. Pick the shell pattern

Use the decision tree in [`../references/shell-patterns.md`](../references/shell-patterns.md). Default to **left rail + top bar** for multi-project SaaS with 3–6 primary sections.

Document the decision: "Left rail + top bar, because: (a) ≥3 primary sections, (b) multi-project, (c) sections benefit from icon-led nav."

### 2. Define the target IA

Write the full route tree:

```
/                              redirect → /projects or /login
/login                         auth (and ?next= deep link gate)
/login/forgot                  password reset request
/login/reset?token=…           password reset form
/projects                      project picker (full page)
/projects/<id>                 → /projects/<id>/map (default section)
/projects/<id>/map             section
/projects/<id>/engineers       section
/projects/<id>/engineers/<id>  detail
/projects/<id>/jobs            section
/projects/<id>/jobs/<id>       detail
/projects/<id>/analytics       section
/projects/<id>/settings        project-scoped settings
/account                       user-scoped settings
/account/security              password, sessions
/account/notifications         prefs
```

### 3. Map every shell component

For each persistent shell component, specify:

- **Where** it lives (top bar / rail / floating).
- **What** it contains (project chip, breadcrumb, avatar, …).
- **State** it reflects (current project, route, user).
- **Behavior** (click → popover, hover → tooltip, …).
- **Keyboard** affordances.
- **ARIA** roles.

```
Component:       Project chip
Location:        Top bar, left-most, after logo
Contains:        Project avatar (16px), project name (truncate 20ch), caret
State:           URL[1] = project id
Behavior:        Click → switcher popover; Enter on focused chip same
Keyboard:        Tab to focus, Enter to open
ARIA:            role=button, aria-haspopup=menu, aria-expanded
```

Repeat for: logo, breadcrumb, avatar menu, primary nav rail, command palette trigger (if added), notifications bell (if added), toast region.

### 4. Map every transition

For each route, specify what triggers it:

- Section nav click → /projects/<id>/<section>.
- Project chip → popover → select → /projects/<new-id>/<same-section if exists else default>.
- Avatar → "Account settings" → /account.
- Avatar → "Sign out" → confirm → /login + toast.
- 401 from API → re-auth modal (URL unchanged).

### 5. Sketch the empty/loading/error states

For each section route, define:

- Empty state: when the user has zero items in this section, what do they see and what's the CTA?
- Loading state: skeleton, spinner, or progressive reveal?
- Error state: what message and what retry/escape options?
- No-access state: when role doesn't permit this view, what do they see?

### 6. Plan the modal inventory

List every modal that should exist in the target design. For each:

- Trigger.
- Whether it's URL-addressable (`?modal=…`).
- Whether it's destructive.
- Whether it requires re-auth (sensitive actions).
- Initial focus target.

If the current app has 10 different ad-hoc modals, the target should have a shared `<Modal>` primitive used by all of them.

### 7. Sketch the layouts (ASCII or sketch tool)

For each major surface, draw the rough wireframe:

- Signed out — Login.
- Signed in, no project — /projects.
- Signed in, in project — section view.
- Detail view.
- Settings (account, project).
- Modal — generic shape.

ASCII is fine for an internal proposal; switch to a design tool if the audience is broader.

### 8. Decide what's in scope vs out

Some target-state items may be too big for this round. Mark them:

- **In scope (this PR / sprint)**: project chip, avatar menu, hash router, breadcrumbs, modal primitive.
- **Next step**: command palette, dark mode, keyboard shortcuts.
- **Future**: framework migration, real design system, mobile-first redesign.

## Deliverable

A markdown section titled "Target state" with:

- Shell pattern decision + rationale.
- Full route tree.
- Shell component spec (per-component table or list).
- Transition map.
- Empty/loading/error state matrix.
- Modal inventory.
- ASCII or sketch wireframes for major surfaces.
- Scope split (in / next / future).

Aim for 800–2000 words. Decisive, opinionated, but cited.
