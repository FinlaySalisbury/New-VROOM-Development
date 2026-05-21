# Account / avatar menu

The user-identity surface. Placed top-right by convention since Windows established the top-right as "exit" decades ago. ChatGPT puts theirs bottom-left and that is the exception that proves the rule.

Source: [Baymard — "My Account" Drop-Down Structure](https://baymard.com/blog/account-drop-down-structure) — 71% of e-commerce sites fail to distinguish primary from secondary paths inside the menu.

## The shape

Trigger: a circular avatar (32–40px) showing user initials, a photo, or a generic person glyph. **Not** a generic cog icon — "settings" is one item *inside* the menu.

```
┌─────────────────────────────────┐
│ 👤 Finlay Salisbury             │
│    finlay@yunex.com             │
├─────────────────────────────────┤
│ Account settings                │
│ Notifications                   │
│ Appearance / Theme              │
├─────────────────────────────────┤
│ Switch project           ›      │
│ All projects                    │
├─────────────────────────────────┤
│ Documentation               ↗   │
│ Keyboard shortcuts              │
│ Contact support             ↗   │
├─────────────────────────────────┤
│ Sign out                        │
└─────────────────────────────────┘
```

## Required contents (in order)

1. **Identity header** — name + email. Photo/initials. This is the "you are signed in as" surface. Always first.
2. **Account-scoped items** — settings, notifications, theme, billing (if applicable). Anything that lives at the *user* level, not the *project* level.
3. **Workspace/project shortcuts** — quick switch, link to project picker page. Optional if you have a dedicated project chip elsewhere; still helpful as a fallback.
4. **Help/external** — docs, shortcuts, support. Mark external links with `↗`.
5. **Sign out** — separated by a divider, at the very bottom. Never first or middle.

## Required behavior

- **Keyboard**: `Enter`/`Space` opens; `↑/↓` navigates; `Esc` closes; `Tab` cycles within. Type-ahead optional.
- **ARIA**: trigger has `aria-haspopup="menu"` and `aria-expanded`; menu has `role="menu"` and items `role="menuitem"`.
- **Closes on**: Esc, clicking outside, clicking an item that navigates, route change.
- **Doesn't close on**: hovering a submenu, focusing a non-interactive header.

## Logout specifics

- **Always confirmable for destructive context.** If the user has unsaved work, intercept with "You have unsaved changes — sign out anyway?".
- **Show a toast** after sign-out: "You've been signed out." Reassures the user the action took effect.
- **Clear local state** (selectedProjectId, filter state, draft content) on sign-out, not just the JWT.
- **Route**: send to a clean `/login` or `/`, not back to the page they were on (which they can't access).

## Distinguishing primary vs secondary (Baymard)

Six techniques in order of effectiveness:

1. **Multi-column layout** for menus with ≥10 items.
2. **Horizontal dividers** between sections. Use them.
3. **Icons** sparingly — only for the dashboard/profile entry and Sign out.
4. **Secondary text descriptions** for ambiguous items ("Billing — manage payment methods").
5. **Personalization** — show the current plan, role, or usage right inline.
6. **Dashboard anchor** — make "Account" or "Profile" the prominent, first item.

## What to keep OUT

- **Project-scoped settings** — those live under the project chip, not the user menu. The distinction matters: "Team members" is project, "Change my password" is account.
- **Theme switcher** is fine inside, but consider a dedicated icon button in the top bar if it's used often.
- **Anything destructive that isn't sign-out** — "delete account" should require a dedicated screen, not a menu item.

## Anti-patterns

- **Single "logout" button on the rail** with no avatar at all. This is the VROOM-pre-fix pattern. No identity surface, no settings escape.
- **Cog icon labeled "Settings" that opens project-team management.** Conflates account and project scope.
- **Long flat list of 15 items**, no grouping, no dividers.
- **"My Account" as the only label** with no name/email. The user has to click to confirm who they're signed in as.
- **Hover-only menu.** Excludes keyboard and touch.

## Reference implementations

| Product | Notes |
|---|---|
| GitHub | Top-right avatar; clear sections; "Your profile/repositories/stars/organizations" anchored at top. |
| Vercel | Top-right avatar; account + theme + sign-out, no project content (handled by separate chip). |
| Stripe | Top-right avatar; profile + workspace + sign out; minimal. |
| Linear | Combined into the workspace switcher (top-left); separate "Settings" route handles account vs workspace tabs. |
| Supabase | Top-right avatar; preferences, billing, sign-out. |

## Quick checklist

- [ ] Trigger is an avatar, not a cog.
- [ ] Header shows name + email.
- [ ] Sign out is at the bottom, separated by a divider.
- [ ] Esc closes the menu.
- [ ] Focus returns to the avatar on close.
- [ ] `aria-haspopup`, `aria-expanded`, `role="menu"`, `role="menuitem"` all set.
- [ ] Toast on sign-out.
- [ ] No project-scoped items inside.
