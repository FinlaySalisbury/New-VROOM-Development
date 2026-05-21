# IA laws — depth, breadth, scent, hierarchy

A short list of the principles that consistently survive contact with reality. Apply *before* picking a navigation pattern.

## 1. Depth vs breadth

- Flatter is usually better. Each extra click costs you ~10% of users (rough rule of thumb).
- A wide-and-shallow IA (one click to most things) beats narrow-and-deep, until you exceed ~7±2 visible options at a single level, at which point chunk into groups with headers.
- Beyond 4 tiers of hierarchy, you almost always need breadcrumbs *and* a search/command palette.

## 2. Information scent

Users decide where to click based on the "scent" of the label — does it smell like what they want?

- Labels must use the user's vocabulary, not the team's.
- Test labels with the trunk test: cover everything but the nav and ask "do you know where you are and what you can do?"
- Strong scent = obvious next action. Weak scent = users guess wrong, click back, distrust the nav.

## 3. Hierarchy on screen ≈ hierarchy in the model

- A user's mental model is built from what they see, not what's in the database.
- If two screens are at different IA levels but look identical, users will conflate them.
- Visual prominence (size, weight, position, color) must map to actual importance.

## 4. Persistent vs contextual nav

- **Persistent** elements never move and never disappear. The user can always find them. Reserve persistence for primary nav, project context, and account.
- **Contextual** elements appear only when relevant. Local nav, sub-tabs, action bars.
- A common failure: making contextual elements look persistent (or vice versa). Users learn to expect them, then are confused when they vanish.

## 5. The five questions a navigation system must answer at all times

For any page:

1. **Where am I?** (page name, breadcrumbs, active state in nav)
2. **What is this place?** (page title, context)
3. **How did I get here?** (breadcrumbs, browser back, recent history)
4. **Where can I go?** (visible nav, contextual links)
5. **How do I leave / start over?** (escape hatches: home, project switcher, account menu, sign out)

If any of these can't be answered on every screen, you have a nav bug.

## 6. The URL is part of the IA

- A URL is a persistent, shareable, refresh-safe pointer to a single page in the IA.
- If your URL doesn't change as you navigate, your IA is invisible to: bookmarks, browser history, analytics, sharing, search engines, and the user who refreshes.
- Treat the URL as the authoritative state for "what is on screen." UI state derives from URL, not the other way round.

## 7. Roles change the IA, not the chrome

- An admin and a viewer should see *the same shell* with *fewer items*. Don't redesign the nav per role.
- Hide what a role can't access. Don't show disabled-greyed-out items unless there's a clear "upgrade to unlock" path.
- The current role should be visible (in the account menu or near the project name) so the user can self-diagnose "why can't I see X?".

## 8. The 3-second rule for orientation

- Drop a user on any page cold. They should know within ~3 seconds: where they are, what this is, and how to get back to a known place.
- Test by asking someone to refresh a deep page and describe what they see. If they can't anchor themselves, the IA is leaking.
