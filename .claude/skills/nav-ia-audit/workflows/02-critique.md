# Workflow 02 — critique the current navigation

Goal: score the app against the 40-item audit checklist, identify the worst gaps, and tie each to a specific source pattern or principle.

## Steps

### 1. Run the audit checklist

Open [`../checklists/audit.md`](../checklists/audit.md). For each of the 40 items:

- Test it manually in the running app (or read the code carefully if not yet running).
- Score Pass / Partial / Fail.
- Note the file:line where the gap lives.
- Assign a severity (P0–P3, see SKILL.md rubric).
- Write a one-line rationale.

Use the scoring template at the bottom of the audit checklist.

### 2. Group findings by pillar

Roll the 40 items up into a per-pillar verdict:

```
Pillar 1 — Identity is visible:       FAIL (3/4 items fail)
Pillar 2 — Escape hatches exist:      FAIL (3/4 items fail)
Pillar 3 — URL is source of truth:    FAIL (5/5 items fail)
…
```

This gives the user a one-glance summary.

### 3. Cite the source for each fail

For every Fail or Partial, link to the reference doc that explains why it matters and what the standard looks like:

- "Pillar 1, item 1 — current project not shown" → see [`../references/shell-patterns.md`](../references/shell-patterns.md), section "The project chip".
- "Pillar 6, item 23 — modal has no aria-labelledby" → see [`../references/modals-overlays.md`](../references/modals-overlays.md), section "The ten-point modal checklist".

This stops the audit from feeling like opinion and turns it into evidence.

### 4. Identify the "top 5"

Out of all the failures, pick the 5 that:

- Are P0 or P1 severity, AND
- Block other improvements (e.g., adding breadcrumbs requires a router; the router is the blocker).

These become the headline issues at the top of the report. Everything else is the long tail.

### 5. Identify the "free wins"

Items that are P2 / P3 but require <1 hour of work each. Surface them as a separate "ship today" section. Examples:

- Add Escape handler to modals.
- Bind `<label for>` to inputs.
- Add `aria-label` to icon-only buttons.
- Replace `<div onclick>` with `<button>`.

### 6. Note the architectural threads

Some failures share a root cause. Call those out:

- "No URL routing" causes items 9, 10, 11, 12, 13 to fail.
- "No shared modal primitive" causes items 22–29 to fail unevenly per modal.
- "No state management" causes items 6, 8, 13 to be fragile even if individually addressed.

Fixing the root cause once is cheaper than patching 5 symptoms.

## Deliverable

A markdown section titled "Gap report" with:

- A one-paragraph verdict (the TL;DR).
- A pillar-by-pillar pass/fail table.
- The 40-item detailed scoring table with severities, notes, and file:line.
- A "Top 5 issues" list with reasons.
- A "Free wins" list.
- A "Architectural threads" section listing root causes that fix multiple items at once.

Aim for 800–2000 words. Heavy on tables, light on prose.
