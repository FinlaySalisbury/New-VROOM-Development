---
name: ux-a11y-audit
description: Audit UI/UX work for accessibility, responsive adaptability, and everyday usability — WCAG contrast, focus/keyboard, touch targets, spacing rhythm, responsive breakpoints, interaction states, and "not-clunky" heuristics. Use this as a non-stylistic quality gate when building, reviewing, or refactoring any interface (HTML/CSS/JS or React). It does NOT dictate aesthetics or brand — for visual/brand choices defer to the yunex-traffic-design skill. Run it before shipping UI changes, or when the user asks to "audit", "improve spacing/layout", "make it responsive", "check accessibility", or "make the UI less clunky".
user-invocable: true
---

# UX & Accessibility Audit

A **non-stylistic quality gate**. It checks that interfaces are adaptable across screen sizes, accessible (WCAG AA), and easy to use — without overriding stylistic or brand decisions. Aesthetics/brand are owned by the **yunex-traffic-design** skill; this skill only enforces best-practice mechanics and flags violations.

Distilled from `nextlevelbuilder/ui-ux-pro-max-skill` (99 UX guidelines, shadcn accessibility, responsive references) and `leonxlnx/taste-skill` (taste/redesign/minimalist heuristics), with the generative-image/logo/slide tooling stripped out.

## How to run an audit

1. **Inventory the surfaces** — list every view, overlay, modal, and reusable component.
2. **Walk each category below** against the code. Cite `file:line` and quote the offending snippet.
3. **Score each finding** Critical / High / Medium / Low using the priorities at the end.
4. **Check at the four breakpoints** — 375 / 768 / 1024 / 1440 px — plus landscape on short viewports.
5. **Report, don't restyle** — propose changes; never silently change brand colours, type, or layout intent.

A finding is only valid if it is **checkable** (a concrete rule with a threshold) and **observable** in the code or rendered output.

---

## 1. Responsive & adaptive layout

- [ ] Mobile-first; explicit behaviour at **375 / 768 / 1024 / 1440 px**. Every major surface has a defined mobile state — none rely on desktop layout alone.
- [ ] **No horizontal scroll** on mobile. No fixed-width containers (`width: 1000px`, `width: 600px`, `width: 380px`) that exceed the viewport — use `max-width` + `width: 100%`.
- [ ] Viewport meta = `width=device-width, initial-scale=1`; zoom never disabled.
- [ ] Full-height surfaces use `min-height: 100dvh` (not `100vh`) to avoid mobile address-bar jump.
- [ ] Multi-column layouts collapse to a single column `< 768px` (flex/grid `flex-wrap` or `grid-template-columns: 1fr`).
- [ ] **Absolute/fixed floating UI** (FABs, toasts, side panels, overlays) reposition or restack on mobile rather than overlapping content or each other.
- [ ] Wide data tables get a mobile strategy: horizontal scroll **with an affordance**, or a stacked card layout — never silent overflow.
- [ ] Container max-width 1200–1440px on desktop; content not full-bleed text.
- [ ] Layout readable and operable in landscape / short viewports (`max-height` cases for modals).

## 2. Spacing & rhythm

- [ ] All padding/margin/gap come from the **spacing scale** (`--space-*`, 4/8/12/16/24/32/48/64). No arbitrary `17px`, `13px`, `7px`.
- [ ] Consistent component padding — cards, modals, list rows share a padding token, not ad-hoc values.
- [ ] Related items grouped tightly; unrelated sections separated by larger, consistent gaps (intentional whitespace, not random).
- [ ] Minimum **8px gap between adjacent interactive targets**.
- [ ] No "card-ification" of everything — use spacing/dividers where elevation isn't needed.

## 3. Visual hierarchy & typography

- [ ] Type sizes from the scale (`--fs-*`); no raw `font-size: 8px`/`13px` one-offs.
- [ ] Body text **≥16px on mobile** (prevents iOS auto-zoom); line-height **1.5–1.75** body, **1.05–1.3** headings.
- [ ] Line measure controlled: **60–75 chars** desktop, 35–60 mobile (`max-width`/`ch` on long text blocks).
- [ ] Hierarchy expressed by size + weight (600–700 headings, 500 labels, 400 body) — not colour alone.
- [ ] **Heading order sequential** — exactly one `<h1>` per page; no skipped levels (`h2`→`h4`).
- [ ] Truncated text (`text-overflow: ellipsis`) has a tooltip/`title` or expand affordance.

## 4. Accessibility (WCAG AA)

**Contrast**
- [ ] Normal text **≥4.5:1**; large text (≥18px/≥14px bold) **≥3:1**; UI/graphics & focus rings **≥3:1**.
- [ ] Audit muted greys on light backgrounds (`--app-fg-soft`, `#9a9a98`, `rgba(255,255,255,0.5)` on dark) — most failures live here.
- [ ] **Colour is never the only signal** — status/meaning also carries an icon, text, or shape.

**Focus & keyboard**
- [ ] Global **`:focus-visible`** style exists (2–3px ring, `outline-offset`), never `outline: none` without a replacement.
- [ ] Every interactive element is keyboard-reachable; tab order matches visual order.
- [ ] Modals/dialogs trap focus, restore focus on close, and close on `Escape`.
- [ ] Clickable elements are real `<button>`/`<a>` — not `<div onclick>` (those lack focus, role, Enter/Space).

**Touch & pointer**
- [ ] Interactive targets **≥44×44px** (iOS) / 48×48dp (Android). Icon/close buttons especially.
- [ ] `cursor: pointer` on every clickable non-native control.
- [ ] Fixed/sticky bars respect safe areas; scroll content not hidden behind them.

**Forms**
- [ ] Every input has an associated **`<label for>`** (visible) or `aria-label`; placeholder is not the only label.
- [ ] Correct `type` (email/tel/number) and `autocomplete` attributes set.
- [ ] Required fields marked (`*` + `aria-required`); errors shown **inline beside the field**, linked via `aria-describedby`, announced with `role="alert"`/`aria-live="polite"`.

**Semantics & motion**
- [ ] Landmarks used: `<nav> <main> <aside> <section> <article>` (not div soup); lists are `<ul>/<li>`.
- [ ] All `<img>` have descriptive `alt` (empty `alt=""` for decorative).
- [ ] **`@media (prefers-reduced-motion: reduce)`** disables/!important-reduces every animation & transition.

## 5. Interaction states & affordances

- [ ] Every interactive element defines **hover AND focus** states (and active/pressed where it adds feedback).
- [ ] Disabled state: `disabled` attribute + reduced opacity (0.38–0.5) + no pointer action.
- [ ] Async surfaces have **loading** (skeleton matching final layout > generic spinner), **empty** (composed, says how to populate), and **error** (inline, actionable) states — not blank divs.
- [ ] Visual feedback within ~100ms of any user action.
- [ ] No layout shift on interaction — animate `transform`/`opacity`, never `width/height/top/left`.

## 6. Usability — "not clunky"

- [ ] **One design system / one button system.** Flag parallel/duplicate component families (e.g. `.btn-*` AND `.yx-btn-*`) and consolidate to one.
- [ ] One accent colour and one radius system used consistently; no section-by-section drift.
- [ ] One primary action per screen; secondary actions visually subordinate; no duplicate CTA labels for the same intent.
- [ ] Navigation predictable: back button restores scroll/filter/form state; key screens deep-linkable; modals not used for primary navigation.
- [ ] Dense data chunked (card grids, tabs, accordions) rather than 10+ row tables or data dumps.
- [ ] Reasonable content density — no wall-of-controls; group and progressively disclose.
- [ ] **No duplicate/conflicting CSS rules** (same selector defined twice with different values) and no references to undefined tokens (`var(--surface-bg)` that doesn't exist).
- [ ] **Z-index is managed** via a small named scale, not colliding magic numbers (multiple unrelated elements at `z-index:1000`).
- [ ] Minimise **inline `style=""`** — styling belongs in classes/tokens so it's auditable and themeable.

## 7. Motion

- [ ] Micro-interactions **150–300ms**, complex transitions ≤400ms; tokens shared globally (`--dur-*`, `--ease-*`).
- [ ] `ease-out` entering, `ease-in` exiting; exit ~60–70% of enter duration.
- [ ] Only `transform`/`opacity` animated; `will-change` used sparingly on active elements only.
- [ ] List entrances stagger 30–50ms/item rather than all-at-once.
- [ ] Every animation justifiable in one sentence (feedback / hierarchy / state change / continuity). If not, cut it.

---

## Priority rubric (for scoring findings)

- **Critical** — blocks access or breaks layout: no `:focus-visible`, `<div onclick>` controls, missing form labels, contrast failures on body text, fixed-width container overflowing mobile, colliding z-index causing unclickable UI, duplicate/conflicting component systems.
- **High** — breaks a breakpoint or a state: missing responsive rules on a major surface, no reduced-motion, touch targets <44px, missing loading/empty/error states, undefined CSS tokens.
- **Medium** — consistency & polish: hardcoded spacing/sizes off-scale, muted-grey contrast borderline, semantic-HTML gaps, inline styles that bypass tokens.
- **Low** — refinement: stagger/easing tuning, micro-spacing optical balance, redundant eyebrows/CTAs.

## Output format

Return a table: `Finding | file:line | Category | Severity | Fix`. Lead with Critical/High. Never change brand colours, typography, or layout intent as part of an "audit" — propose, and let the brand skill own aesthetics.
