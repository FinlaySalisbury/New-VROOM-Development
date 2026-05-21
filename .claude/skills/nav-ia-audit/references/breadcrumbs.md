# Breadcrumbs

Primary source: [NN/g — Breadcrumbs: 11 Design Guidelines](https://www.nngroup.com/articles/breadcrumbs/). Secondary: [Smart Interface Design Patterns — Breadcrumbs UX](https://smart-interface-design-patterns.com/articles/breadcrumbs-ux/).

## When to show breadcrumbs

- IA depth ≥ 3 tiers.
- Users enter via deep links / search / shared URLs (so they may land mid-tree).
- The current view has navigable parents (e.g. "Engineer Jane" has a "Engineers" parent).

## When NOT to show them

- Site/app has ≤2 tiers.
- Linear flow with no real hierarchy (wizard, checkout).
- The page is the root of a primary section already represented in the nav.

## The 8 desktop rules

1. **Don't replace other navigation.** Breadcrumbs supplement; they never substitute primary or local nav.
2. **Show hierarchy, not history.** They reflect the IA tree, not the user's path.
3. **Pick one canonical path.** For pages reachable through multiple parents, choose the one that matches the user's mental model.
4. **Include the current page** as the last item.
5. **Don't link the current page.** Style it distinctly, no hover, no underline.
6. **Only link nodes with real pages.** If a level is a label without a target, skip it.
7. **Skip on shallow IAs.** Two tiers don't need breadcrumbs.
8. **Start at the homepage,** unless the global nav already provides a home link.

## The 3 mobile rules

9. **No wrapping.** Breadcrumbs that wrap to two lines on phones cost more than they earn.
10. **Tap targets remain ≥ 1cm × 1cm** — don't squash the links to fit.
11. **Consider truncating to the last 1–2 levels** with an accordion / "…" expand. Pattern: `… › Engineers › Jane`.

## Visual treatment

- Position: below the global nav, above the page heading.
- Separator: `›` or `/` or chevron icon. Right-pointing is more familiar; no measurable usability difference per testing.
- Links: underline or color-distinct; current item: regular weight, neutral color, no link styling.
- Typography: smaller than page title (12–14px is common).
- Spacing: 4–8px around each separator.

## Anatomy

```
Acme Project ›  Engineers ›  Jane Smith
   link           link        plain text
```

Or with truncation on mobile:
```
…  ›  Engineers ›  Jane Smith
expand    link      plain text
```

## Common mistakes (Smart IDP)

- Showing breadcrumbs that style links and the current page identically — users try to click the current page.
- Showing breadcrumbs without other navigation, then hiding them on mobile — leaves no orientation cue.
- Path-style breadcrumbs (showing the user's clickstream) — confusing because two users reach the same page via different paths.
- Including breadcrumbs on a page that *is* the section root, duplicating the global nav.

## In code

A breadcrumb component takes a list of `{label, href}` items and renders all but the last as links. The last is `aria-current="page"`. Wrap the whole strip in a `<nav aria-label="Breadcrumb">` with an `<ol>` inside.

```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumb">
    <li><a href="/projects/acme">Acme Project</a></li>
    <li><a href="/projects/acme/engineers">Engineers</a></li>
    <li aria-current="page">Jane Smith</li>
  </ol>
</nav>
```

CSS: render `<li>` separators via `::before` content, not extra DOM nodes.

## Decision: project chip vs breadcrumbs

If the project chip is always visible (top-left), the *first* crumb (project name) is redundant. Two acceptable resolutions:

- **Drop the project crumb.** Breadcrumbs start at the section level: `Engineers › Jane`.
- **Keep it.** Helpful when the chip is small/iconified and the breadcrumb reinforces context.

Default: drop the project from the breadcrumb if the chip is verbose. Keep it if the chip only shows an icon.
