---
name: nav-ia-audit
description: Audit and improve an app's navigation, information architecture, and account/identity surface. Covers project/workspace switching, account menus, breadcrumbs, deep linking, modal a11y, auth edges, and shell layout. Use when the user mentions navigation problems, "where am I in the app", switching projects/orgs/workspaces, account/profile menus, broken back button, refresh resets the view, modals trap focus poorly, no breadcrumbs, or generally "improve the user flow" of an existing app's shell.
---

# nav-ia-audit — Navigation & IA audit + fix workflow

Use this skill when the work is about the **shell** of an app (the bits around the features), not the features themselves. Symptoms that should trigger it:

- "There's no way to switch projects without logging out."
- "I can't tell which project I'm in."
- "Refresh dumps me back to the home view."
- "The avatar menu is missing / has only Sign out / has too much."
- "Browser back is broken."
- "Modals don't close on Escape."
- "Make the user flow better."

## What this skill is (and isn't)

It is a **diagnostic + remediation** workflow. It produces:

1. A **route/state map** of the app today.
2. A **gap report** scoring the app against named heuristics from NN/g, Baymard, WAI-ARIA, and observed real-world SaaS patterns (Linear, Notion, Vercel, Supabase, Stripe, GitHub).
3. A **prioritized punch list** of file-level changes — smallest reversible edits first.
4. A **target IA diagram** showing where the app should land.

It is **not** a generative design system (that's what [`ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) is for; this skill complements it). It does not pick palettes, fonts, or component libraries. If the user is starting a screen from scratch, defer to `ui-ux-pro-max` for the visual layer and use this skill for the navigation layer.

## How to run a full audit

Follow the workflows in order:

1. [`workflows/01-map-current.md`](workflows/01-map-current.md) — read the routing, state, and shell code; produce a route map.
2. [`workflows/02-critique.md`](workflows/02-critique.md) — score each pillar against [`checklists/audit.md`](checklists/audit.md). Output a structured gap report.
3. [`workflows/03-propose.md`](workflows/03-propose.md) — sketch the target IA and shell layout. Reference [`references/shell-patterns.md`](references/shell-patterns.md).
4. [`workflows/04-implement.md`](workflows/04-implement.md) — turn the gap report into a prioritized punch list with file:line targets and an order of operations.

## The ten pillars this skill audits

Every audit covers these. They are in priority order — fixing #1 buys more than fixing #10.

| # | Pillar | Reference |
|---|---|---|
| 1 | **Identity is visible** — project + user always shown | [`references/shell-patterns.md`](references/shell-patterns.md), [`references/account-menu.md`](references/account-menu.md) |
| 2 | **Escape hatches exist** — switch project, sign out, account settings | [`references/workspace-switcher.md`](references/workspace-switcher.md) |
| 3 | **URL is the source of truth** — deep links, refresh-safe, back works | [`references/routing-deeplinks.md`](references/routing-deeplinks.md) |
| 4 | **Hierarchy is visible** — breadcrumbs when depth > 1 | [`references/breadcrumbs.md`](references/breadcrumbs.md) |
| 5 | **One way to navigate primary sections** — predictable, persistent | [`references/nn-g-heuristics.md`](references/nn-g-heuristics.md) |
| 6 | **Modals are accessible** — ESC, focus trap, aria-modal, scroll lock | [`references/modals-overlays.md`](references/modals-overlays.md) |
| 7 | **Auth edges are handled** — reset, expiry, idle, error toasts | [`references/auth-edges.md`](references/auth-edges.md) |
| 8 | **Loading and empty states exist** — skeletons, CTAs, retries | [`checklists/audit.md`](checklists/audit.md) |
| 9 | **Mobile has a real plan** — not just a shrunk rail | [`checklists/responsive.md`](checklists/responsive.md) |
| 10 | **A11y floor is met** — landmarks, labels, contrast, reduced-motion | [`references/a11y-floor.md`](references/a11y-floor.md) |

## Severity scoring

When scoring a gap, use this rubric:

- **P0 / Blocking** — feature unusable, accessibility lawsuit risk, data loss, or breaks browser primitives (back button, refresh).
- **P1 / Disorienting** — user reliably gets lost or has to log out to recover.
- **P2 / Friction** — extra clicks, confusion, but workable.
- **P3 / Polish** — cosmetic or rarely-hit edge case.

Order the punch list strictly P0 → P3, and within each priority, smallest reversible change first.

## Outputs to produce

For each audit run, write to the repo (not memory) under a path the user picks — by default `docs/nav-audit-{YYYY-MM-DD}.md`:

- A route map (mermaid `graph` or indented list).
- A pillar-by-pillar gap table.
- A target IA diagram.
- A punch list, one row per change, with: pillar, severity, summary, file:line, suggested edit, estimated effort (15m / 1h / 1d / 1w+).

## Reference index

- **Heuristics**: [`references/nn-g-heuristics.md`](references/nn-g-heuristics.md), [`references/ia-laws.md`](references/ia-laws.md)
- **Patterns**: [`references/shell-patterns.md`](references/shell-patterns.md), [`references/workspace-switcher.md`](references/workspace-switcher.md), [`references/account-menu.md`](references/account-menu.md), [`references/breadcrumbs.md`](references/breadcrumbs.md), [`references/routing-deeplinks.md`](references/routing-deeplinks.md), [`references/modals-overlays.md`](references/modals-overlays.md), [`references/auth-edges.md`](references/auth-edges.md), [`references/a11y-floor.md`](references/a11y-floor.md)
- **Checklists**: [`checklists/audit.md`](checklists/audit.md), [`checklists/pre-ship.md`](checklists/pre-ship.md), [`checklists/responsive.md`](checklists/responsive.md)
- **Workflows**: [`workflows/01-map-current.md`](workflows/01-map-current.md), [`workflows/02-critique.md`](workflows/02-critique.md), [`workflows/03-propose.md`](workflows/03-propose.md), [`workflows/04-implement.md`](workflows/04-implement.md)
- **Examples**: [`examples/good-shells.md`](examples/good-shells.md), [`examples/anti-patterns.md`](examples/anti-patterns.md)
