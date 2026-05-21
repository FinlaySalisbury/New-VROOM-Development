# Shell layout patterns

A "shell" is the persistent chrome around the changing content. Three things must live in the shell of any multi-project, multi-user SaaS app:

1. **Project context** (which workspace/project am I in?) + **switcher**.
2. **Primary section nav** (the 3–6 top-level areas).
3. **Account/utility** (avatar → email, account settings, sign out).

## The four common layouts

### A. Left rail + top bar (Linear, Vercel, Supabase Studio, GitHub repo view)

```
┌──────┬──────────────────────────────────────┐
│ [≡]  │ ▾ Project   Section › Sub      👤   │
├──────┼──────────────────────────────────────┤
│  🗺   │                                      │
│  👷   │   main content                       │
│  📦   │                                      │
│  📊   │                                      │
└──────┴──────────────────────────────────────┘
```

- Project switcher: top-left.
- Account/avatar: top-right.
- Primary sections: vertical icons on the rail.
- Breadcrumbs (when depth > 1): in the top bar, after the project chip.

Strengths: scales to many sections, clear separation of "where" (project, top-left) and "who" (account, top-right). Works well from 1024px up; collapses cleanly.

**This is the default. Use it unless you have a specific reason not to.**

### B. Top bar only (Stripe, Notion in some modes)

```
┌──────────────────────────────────────────────┐
│ ▾ Project   Map  Engineers  Jobs  Analytics  👤 │
├──────────────────────────────────────────────┤
│  Engineers › Jane                            │
│                                              │
│  main content                                │
└──────────────────────────────────────────────┘
```

Use when:
- You have ≤5 primary sections.
- Content needs full horizontal width (maps, canvases, dashboards).
- You want maximum density on small laptops.

### C. Split shell (Slack, Discord)

```
┌──────┬──────────┬────────────────────────────┐
│ Orgs │ Channels │ Conversation               │
│  ▢   │   #foo   │                            │
│  ▢   │   #bar   │  ...                       │
└──────┴──────────┴────────────────────────────┘
```

Use only for inherently three-pane content (messaging, mail, doc trees). Overkill for ops apps.

### D. Bottom tab bar (mobile-first apps, ≤768px fallback)

```
│  main content                  │
├────────────────────────────────┤
│  🗺   👷   📦   📊   👤        │
└────────────────────────────────┘
```

- Max 5 tabs.
- Place the most-used in the leftmost/rightmost slot for thumb reach.
- Center can be a primary CTA (e.g., "+ New run").
- Pair with hamburger or sheet for overflow.

## The project chip

A "project chip" is the always-visible UI element showing the current project, doubling as the switcher trigger.

Anatomy:
```
┌─────────────────────────┐
│  ▢  Acme Project    ⌄  │
└─────────────────────────┘
```

- Icon/avatar (12–20px), label (truncate to ~20 chars), caret.
- Clicking opens a popover with: search field, recent projects, all projects (grouped if relevant), "+ New project", "View all projects" link.
- Keyboard: `Enter` opens, `↑/↓` navigate, type-ahead filters, `Esc` closes.
- ARIA: `aria-haspopup="menu"`, `aria-expanded`.

Reference implementations:
- **Notion** — top-left of every page; combined with workspace + account.
- **Linear** — top-left of every page; opens workspace switcher.
- **Vercel** — top-left "team selector" + adjacent "project selector"; both popovers.
- **GitHub** — owner/repo pair as part of the URL; reflected in the header.
- **Supabase Studio** — project picker on a route (`/project/<id>`) with the chip in the header.

## The avatar / account menu

See [`account-menu.md`](account-menu.md).

## What to put on the rail vs the top bar

**Rail** (3–6 items): primary destinations the user spends time in. Stable across the whole project.

**Top bar**:
- Left: project chip → switcher.
- Middle (optional): breadcrumbs OR a global search/command palette trigger.
- Right: notifications bell, help, avatar.

**Don't** put project-level settings on the rail. Settings is utility navigation — it belongs behind the avatar menu (account) or behind the project chip popover (project settings).

## Anti-patterns

- **Settings cog as the only escape.** Forces users to discover what's behind a generic gear icon.
- **"Logo as home" link with no other home affordance.** Works for marketing sites, fails for SaaS where "home" is ambiguous.
- **Hamburger on desktop.** Hides primary nav for no space-saving reason.
- **Hard-coded z-indexes climbing into the 9000s.** Always a sign of overlay-stack chaos.
- **Project name only on the project-list page.** Once you're "inside," it's gone.

## Decision tree

```
≤3 primary sections AND no project switching?
  → Top bar only (B)
3–6 primary sections AND multi-project?
  → Left rail + top bar (A)   ← default for SaaS
Three-pane content (messaging / mail / docs)?
  → Split shell (C)
Mobile?
  → Bottom tab bar (D), ≤5 tabs
```
