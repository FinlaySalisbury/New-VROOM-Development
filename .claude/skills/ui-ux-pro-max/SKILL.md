---
name: ui-ux-pro-max
description: >-
  UX/interaction/accessibility heuristics + framework patterns from a local searchable
  database (161 UX rules, 84 styles, motion, react-performance, typography, charts).
  Use when building, reviewing, or refactoring UI to check interaction quality —
  navigation, loading/empty/error states, focus & keyboard, touch targets, motion
  timing, forms, tables, active states. NOT the visual-identity authority: colours,
  type, gradients, and component look defer to the Yunex Traffic design system
  (`.claude/skills/yunex-traffic-design/`). This skill answers "does it behave well",
  Yunex answers "does it look on-brand".
license: MIT
metadata:
  author: nextlevelbuilder (vendored, pruned to the search engine)
  upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
---

# UI/UX Pro Max (heuristics engine)

A local, offline CSV knowledge base queried by a Python BM25 search script. Standard
library only — no network, no third-party packages. On Windows use `python` (not `python3`).

## Boundary with the Yunex design system (READ FIRST)

- **Visual identity is Yunex's job, not this skill's.** Royal Blue `#1E2ED9`, black-on-white,
  Manrope/Inter, signature gradients, `yx-` component primitives, "no red / no emoji" — all
  come from `.claude/skills/yunex-traffic-design/` and `CLAUDE.md §4`. If this skill's data
  suggests an off-brand colour, font, or generic style, **ignore it** and use the Yunex token.
- **Use this skill for behaviour:** navigation & IA, loading/empty/error/success states,
  focus rings & keyboard order, `prefers-reduced-motion`, 44px touch targets + 8px spacing,
  micro-interaction timing (150–300ms), form validation & labels, table density, active-state
  feedback, React performance. These are framework/brand-agnostic and safe to apply.
- The upstream logo/CIP/banner/slide generators (Gemini-based) were **removed** — not vendored.

## How to query

```bash
# From this skill directory:
python scripts/search.py "<query>" --domain <domain> --max-results <n>
```

Domains: `ux` · `style` · `color` · `typography` · `google-fonts` · `motion` (via `ux`) ·
`react` · `chart` · `landing` · `product` · `icons` · `web`.

Examples:
```bash
python scripts/search.py "modal focus trap escape key" --domain ux --max-results 4
python scripts/search.py "loading skeleton perceived performance" --domain ux --max-results 3
python scripts/search.py "list virtualization large data" --domain react --max-results 3
```

Each result gives Issue / Description / **Do** / **Don't** / Code Example / **Severity**
(High → address first). Treat High-severity UX rules as blockers; Medium/Low as polish.

## Workflow for a UI/UX review or fix

1. Identify the surface (a view, a component, a flow).
2. Query the relevant `ux` (and `react`) rules for that surface.
3. Cross-check every High-severity rule against the current implementation.
4. Fix using **Yunex tokens/components** for anything visual; use this skill's Do/Don't for behaviour.
5. Verify against rendered output (Playwright screenshots at 375/768/1024/1440), not a code read.

## Data (`data/*.csv`)

`ux-guidelines.csv` (the core), `ui-reasoning.csv`, `styles.csv`, `colors.csv`,
`typography.csv`, `google-fonts.csv`, `motion.csv`, `react-performance.csv`,
`charts.csv`, `app-interface.csv`, `landing.csv`, `products.csv`, `icons.csv`.
For data-viz specifically, prefer the dedicated `dataviz` skill; use `charts.csv` only as a cross-reference.
