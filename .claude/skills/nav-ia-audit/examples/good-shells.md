# Good shells — reference implementations

Catalogue of well-designed shells. When proposing a target state, look here first for a known-good pattern to lean on, then cite it in the proposal.

## Linear

- **Shell**: left rail + top bar.
- **Workspace switcher**: top-left, opens a popover combined with the account menu — workspaces above a divider, "Settings", "Switch workspace", "Log out" below.
- **Avatar**: combined into the workspace switcher (this is unusual but cohesive because workspace = identity for a team product).
- **Command palette**: `Cmd/Ctrl+K` opens a global search/action launcher that doubles as a navigator.
- **Breadcrumbs**: minimal — page title + view chip.
- **URL contract**: every issue, project, view has a URL; back works perfectly.

What to steal: command palette, the way workspace + account are coherent, the URL discipline.

## Notion

- **Shell**: left rail (collapsible) + minimal top bar.
- **Workspace switcher**: top-left, "Acme's Notion" → popover with all workspaces, "Add another account", "Log out".
- **Multi-account**: supported natively — log into multiple accounts simultaneously.
- **Account**: separate from workspace switcher, in Settings & Members.
- **Breadcrumbs**: prominent across the top of every page (Notion pages are deeply nested by design).
- **URL contract**: every page has a URL; deep links work; refresh-safe.

What to steal: multi-account support, prominent breadcrumbs for deep hierarchies.

## Vercel

- **Shell**: top bar only.
- **Team switcher**: top-left, separate from project picker.
- **Project picker**: adjacent to team switcher.
- **Avatar menu**: top-right, "Account", "Theme", "Sign out".
- **Favorites**: pinned to dashboard.
- **URL contract**: `/<team>/<project>/<section>` everywhere.

What to steal: team-then-project two-chip pattern (if you ever introduce orgs above projects), favorites.

## GitHub

- **Shell**: top bar; sidebar contextual per repo.
- **Switcher**: encoded in the URL as `/<owner>/<repo>`; breadcrumbs in the header double as switchers (click the owner to see all repos for that owner).
- **Avatar menu**: top-right, sectioned: "Your profile / repositories / stars / organizations", then settings, then sign out.
- **URL contract**: gold standard — everything is a URL, everything is shareable.

What to steal: URL-driven IA, owner/repo breadcrumb pattern.

## Supabase Studio

- **Shell**: project picker is a route (`/project/<ref>`), not a popover; inside a project, left rail + top bar with project chip.
- **Avatar menu**: top-right with preferences, billing, sign out.
- **Section nav**: rail icons with hover labels.
- **URL contract**: clean.

What to steal: dedicated project picker route, clean section nav.

## Stripe Dashboard

- **Shell**: top bar + collapsible left nav.
- **Workspace switcher**: top-left, switches between live/test/connected accounts.
- **Avatar menu**: top-right, minimal — profile, sign out.
- **Mode indicator**: prominent (live vs test). Lessons from a high-stakes product: surface state that matters.

What to steal: prominent mode/state indicator when state changes consequences.

## Pattern summary

| Product | Switcher placement | Avatar placement | Sections | Breadcrumbs | Command palette |
|---|---|---|---|---|---|
| Linear | Top-left, combined | (in switcher) | Rail | Light | Yes (Cmd+K) |
| Notion | Top-left | Settings | Rail | Heavy | Yes |
| Vercel | Top-left (×2) | Top-right | Top bar | Light | Yes |
| GitHub | URL-based | Top-right | Top bar | URL/header | Yes (`t`) |
| Supabase | Route | Top-right | Rail | Light | Yes |
| Stripe | Top-left | Top-right | Rail | Light | Yes |

## What every good shell has

1. Project/workspace identity in the top-left.
2. Account identity in the top-right.
3. Sections in a stable place (rail or top bar, not both).
4. A keyboard launcher (command palette) that's the power-user escape hatch.
5. URLs that match what you see.
6. Modal flows that respect focus and ESC.
7. A clear path back to project-list / home / sign-out at all times.
