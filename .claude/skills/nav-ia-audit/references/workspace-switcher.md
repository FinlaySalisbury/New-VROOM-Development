# Workspace / project switcher

A reusable pattern that solves "I belong to N projects, let me change which one I'm working in without losing context."

## The shape

A clickable chip in the top-left corner (next to the logo, on the rail or top bar). Clicking opens a popover containing:

1. **A search field** (auto-focuses when popover opens).
2. **The current project**, marked active (filled background, checkmark, or distinct color).
3. **Recent projects** (up to ~5), most-recent-first.
4. **All projects**, alphabetical or grouped (by org, by favorite, by archived).
5. **Footer actions**: `+ New project`, `View all projects` (links to a dedicated `/projects` page for users with many).

## Behavior

- **Keyboard**: `Enter`/`Space` opens; `↑/↓` navigates; type-ahead filters the list; `Enter` selects; `Esc` closes.
- **Click target**: at least 44×44px including the chip *and* the popover items.
- **Active state**: never let the active project be selectable as if it would switch — show a checkmark and disable the row, or label it "(current)".
- **Empty state**: "You don't have any projects yet — [+ Create one]".
- **Loading**: skeleton rows, not a "Loading…" string.
- **Error**: inline message with a Retry button; don't unmount the chip.

## Switching behavior

When the user picks a new project:

1. Update the URL **first** (`/projects/<new-id>/...`) so the route reflects the truth.
2. Show a loading state on the section content (skeleton or spinner).
3. Refetch data scoped to the new project.
4. Reset any in-memory selection that doesn't make sense across projects (selected engineer, filter chips, etc.).
5. Preserve the **section** you were on if it exists for the new project (you were on "Engineers" — stay on "Engineers"); fall back to the project default if not.

## What the chip displays

- **Project name**, truncated with `text-overflow: ellipsis` after ~20 chars.
- A small **project avatar** (initials in a colored square, or uploaded image).
- A **caret** (`▾`) to signal it's interactive.
- Optionally: a **role badge** if the user has different roles per project.

```
┌───────────────────────────────┐
│ [AB] Acme Project        ▾   │
└───────────────────────────────┘
```

## Anti-patterns

- **"Settings → switch project."** Hides the switcher behind a feature it isn't part of.
- **Logging out to switch.** Worst case. Indicates no switcher exists at all.
- **Picker that reloads the page.** Loses unsaved work, kills SPA feel.
- **No "current project" indication** inside the picker — the user can pick the project they're already on.
- **No `View all projects` escape** for users with 50+ projects — the popover becomes a scroll trap.

## Reference implementations

| Product | Pattern |
|---|---|
| Linear | Top-left workspace switcher; one popover combines workspaces + account; `Cmd/Ctrl+K` command palette also switches. |
| Notion | Top-left workspace switcher; multiple accounts supported; "Add another account" inside the popover. |
| Vercel | Top-left team-then-project picker (two chips); favorites pinned to dashboard. |
| GitHub | URL-based (`/<owner>/<repo>`); breadcrumbs in the header double as switchers. |
| Supabase Studio | Project selection is a route (`/project/<ref>`); inside, a project chip in the header. |
| Stripe | Workspace switcher in the top-left of the dashboard; switching changes the keys + data scope. |

## Multi-tenancy considerations

If you have **organizations** that contain **projects**, the chip is usually a two-line affair:

```
┌───────────────────────────────┐
│ [AB] Acme                     │
│      Acme Project        ▾   │
└───────────────────────────────┘
```

Or two separate chips side by side. Pick the pattern that matches your data model — don't fake org-level grouping if you only have projects, and don't flatten orgs into project-prefixes.

## Affordance for "view all projects"

Always offer a separate route (e.g. `/projects`) that lists every project the user belongs to, with:

- Search, filter (by role, by archived, by favorite).
- Sort (recent, alphabetical, created).
- Pending invitations (separated section at top).
- "+ New project" button.

The popover is the **fast path**; the route is the **complete list**. Make sure both exist and link to each other.
