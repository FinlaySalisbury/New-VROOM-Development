# NN/g navigation heuristics — condensed

Source articles (consult the originals when a rule is contested):
- [Local Navigation Is a Valuable Orientation and Wayfinding Aid](https://www.nngroup.com/articles/local-navigation/)
- [Menu Design Checklist: 17 UX Guidelines](https://www.nngroup.com/articles/menu-design/)
- [Breadcrumbs: 11 Design Guidelines for Desktop and Mobile](https://www.nngroup.com/articles/breadcrumbs/)
- [The Difference Between Information Architecture (IA) and Navigation](https://www.nngroup.com/articles/ia-vs-navigation/)

## The 17 menu-design rules (NN/g)

1. Show navigation on larger screens — no hamburger on desktop.
2. Put menus in expected locations — primary in header (web) / left side (apps); utility near top; local on left; footer at bottom.
3. Use link-text colors that contrast with the background.
4. Don't cover the screen with the menu on larger screens.
5. **Indicate the user's current location in the menu.** Highlight active item.
6. Provide local navigation menus for closely related content.
7. Use clear, specific, and familiar wording for link labels — no jargon.
8. Make link labels easy to scan — left-justify vertical menus, front-load key terms.
9. For large sites, show several navigation tiers in submenus (mega menus over deep cascades).
10. Use visual cues for long menus — icons supplement, never replace, clear text labels.
11. Make menu links big enough to be easily tapped or clicked.
12. Clearly signify submenus with a caret or arrow icon.
13. Use click-activated (not hover-activated) submenus — hover excludes touch and keyboard.
14. Avoid multilevel cascading menus — use mega menus or landing pages.
15. Consider sticky menus for long pages.
16. Optimize for easy physical access to frequently used commands (Fitts's Law).
17. Avoid innovative or gimmicky patterns — predictability beats novelty.

## The 11 breadcrumb rules (NN/g)

Desktop:
1. Don't replace other navigation — breadcrumbs *supplement*.
2. Show hierarchy, not history.
3. For polyhierarchical sites, pick one canonical path.
4. Include the current page as the last crumb.
5. **Don't link the current page** — visually distinct, not clickable.
6. Only link to actual pages — no labels without targets.
7. Skip breadcrumbs for shallow sites (≤2 tiers).
8. Start with a homepage link, unless it's already in the global nav.

Mobile:
9. Prevent line wrapping.
10. Maintain adequate tap targets — at least 1cm × 1cm.
11. Consider shortened trails on mobile (last level(s) only).

## Information Architecture vs Navigation

> "IA is the information backbone of the site; navigation refers to those elements in the UI that allow users to reach specific information on the site."

- **IA** = content inventory + grouping + taxonomy + nomenclature. Lives off-screen.
- **Navigation** = the visible UI. Includes:
  - **Global navigation** — site-wide; same on every page.
  - **Local navigation** — siblings of the current page within the same section.
  - **Utility navigation** — account, search, help, settings; usually top-right or in an avatar menu.
  - **Breadcrumbs** — hierarchy trail.
  - **Footer** — secondary/legal/site-map.
  - **Supplemental** — related links, contextual.

Define IA before navigation. Choosing a nav pattern by appearance ("we want a left rail") and forcing content into it is a path to a costly redesign.

## Local-navigation principles (NN/g)

- Local nav must be **visually subordinate** to global nav. If local looks more important, users miss the global one and feel falsely constrained.
- It serves three purposes simultaneously: **orientation** (you-are-here), **wayfinding** (where you can go), **accessibility** (cheap clicks to nearby content).
- Use it when users exhibit exploratory browsing across sibling pages or enter from interior links.
- At ≥4 tiers deep, prefer breadcrumbs over multilayer local nav.
