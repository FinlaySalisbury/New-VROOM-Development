# Audit checklist — 40 items across 10 pillars

Score each item as **Pass / Partial / Fail** with a one-line note. Anything that fails goes on the punch list with a severity (P0–P3) per the SKILL.md rubric.

---

## Pillar 1 — Identity is visible

1. **Project context is shown on every authenticated screen** (chip, breadcrumb, or header). The user never has to remember which project they're in.
2. **User identity is shown somewhere persistent** — avatar, email tooltip, or top-right initials. Not buried in a settings screen.
3. **Role is visible to the user** (in the avatar menu, on the project chip, or in account settings).
4. **Project avatar/initials + name** distinguish projects visually, not by name alone.

## Pillar 2 — Escape hatches exist

5. **Switch project** is reachable in ≤2 clicks from any authenticated screen.
6. **Sign out** is reachable from the avatar menu, separated visually from other items.
7. **Account settings** is a distinct destination, not conflated with project settings.
8. **A dedicated "/projects" route** (or equivalent) exists for the full project list, not just a popover.

## Pillar 3 — URL is the source of truth

9. **Each section has a unique URL.** Refresh on /engineers stays on /engineers.
10. **Resource detail has a unique URL.** /engineers/123 is shareable and refresh-safe.
11. **Browser back works** between sections and into detail views.
12. **Deep links work** — pasting a URL in a new tab (signed in) lands the user on that view.
13. **Modals with deep content reflect in the URL** (?modal=…) so they're shareable.

## Pillar 4 — Hierarchy is visible

14. **Breadcrumbs appear when depth ≥ 2** below a section.
15. **Last crumb is non-linked** and visually distinct.
16. **Breadcrumb is wrapped in `<nav aria-label="Breadcrumb">`** with an `<ol>`.
17. **Page title (`<h1>`)** is unique per route and matches the active nav item.

## Pillar 5 — One way to navigate primary sections

18. **Primary sections (3–6 items) live in one consistent place** — rail or top bar, never both.
19. **Active section is visually highlighted** with sufficient contrast.
20. **Section labels are concrete nouns** (Engineers, Jobs), not abstract (Manage, Tools).
21. **Sections are clickable, not hover-activated.**

## Pillar 6 — Modals are accessible

22. **Every modal has `role="dialog"` and `aria-modal="true"`.**
23. **Every modal has a label** via `aria-labelledby` or `aria-label`.
24. **Escape closes the topmost modal.**
25. **Tab is trapped inside the modal.**
26. **Body scroll is locked** while a modal is open.
27. **Focus returns to the trigger** when the modal closes.
28. **Background is inert** (cannot be clicked or tabbed into).
29. **Close button is ≥44×44px** with `aria-label`.

## Pillar 7 — Auth edges are handled

30. **Forgot-password flow exists** and works end-to-end.
31. **401 responses route to a re-auth modal** with the user's email pre-filled.
32. **Sign-out** lives in the avatar menu, clears state, and shows a confirmation toast.
33. **Deep link gating** — unauth users following a deep link land on /login?next=… and arrive at the right place after sign-in.

## Pillar 8 — Loading and empty states exist

34. **Loading uses skeletons or spinners**, never just plain text strings ("Loading…").
35. **Empty states include a CTA** ("Create your first project" + button), not just a flat sentence.
36. **Error states include a retry** action where the operation is idempotent.

## Pillar 9 — Mobile has a real plan

37. **Below 768px**, primary nav is a bottom tab bar or a hamburger drawer — not a shrunken rail.
38. **Modals go full-screen below 480px** with a clear back/close affordance.

## Pillar 10 — A11y floor

39. **Landmarks** (`<header>`/`<nav>`/`<main>`/`<aside>`/`<footer>`) are present.
40. **Every interactive element is keyboard-reachable** with a visible `:focus-visible` style and meets WCAG 2.2 AA contrast (4.5:1 for text, 3:1 for UI).

---

## Scoring template

Paste this into the audit doc:

```markdown
| #  | Item                                  | Status   | Severity | Note                                  | File:Line |
|----|---------------------------------------|----------|----------|---------------------------------------|-----------|
| 1  | Project context visible               | Fail     | P1       | Never rendered after project select    | app.js:190 |
| 2  | User identity visible                 | Fail     | P1       | No avatar, no name, no email           | index.html:154 |
| …  | …                                     | …        | …        | …                                     | …         |
```

After scoring, sort the punch list by severity then by estimated effort.
