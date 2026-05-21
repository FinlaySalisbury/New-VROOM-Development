# Anti-patterns — cataloged smells

Common nav failures and what makes them bad. Use this list to spot offenders during workflow 02.

## Shell-level

### "Settings cog as the only escape"

The only utility-nav affordance is a gear icon. Click → goes to *project* settings, not account settings. User has no obvious path to sign out, switch project, or see their identity.

- **Why bad:** Conflates account and project scope; no identity surface.
- **Fix:** Replace with a top-right avatar dropdown that contains account items; project settings get their own route or live under the project chip.

### "Logout-only nav rail"

Sign-out lives as a stand-alone button on the nav rail with no identity context.

- **Why bad:** Easy to click by accident; no confirmation; no toast; no identity.
- **Fix:** Move sign-out into the avatar menu, bottom slot, separated by a divider.

### "Hidden current project"

After selection, the current project name disappears from the chrome.

- **Why bad:** User can't answer "where am I?". Switching projects = signing out.
- **Fix:** Persistent project chip in the top-left of every authenticated screen.

### "Hamburger on desktop"

Hides primary nav behind a menu button at 1280px wide.

- **Why bad:** Adds a click for no space-saving reason; hurts discoverability.
- **Fix:** Show primary nav directly on desktop.

### "Logo as home" without home

The logo links to "/" but the app has no home page — so it loops to the project picker, or worse, redirects to login.

- **Why bad:** User expects "home" to mean something coherent.
- **Fix:** Either give the logo a clear destination (dashboard, project picker) or remove the link behavior.

## URL-level

### "Onclick view switching"

Navigation is JavaScript `onclick` handlers that toggle CSS classes. URL never changes.

- **Why bad:** Refresh resets to default view; nothing is shareable; back button broken; analytics blind.
- **Fix:** Real router. URL is the source of truth.

### "URL ID is opaque UUID"

`/projects/8c4a2f1e-9b7d-4e3a-a3f1-7e2a1b9d8c5e/engineers` is technically valid but visually impossible.

- **Why bad:** Unscannable, can't be remembered or typed.
- **Fix:** Slugs for human-facing IDs, or short codes; keep the UUID as a secondary identifier.

### "Modal state lives only in DOM"

The "review engineer" modal opens on click; its state is in the DOM, not the URL. Can't share a link directly to the modal.

- **Why bad:** Workflows that should be one-click-from-Slack become 5-click navigations.
- **Fix:** Route-aware modals (`?modal=…` or full-route modals).

## Modal-level

### "Z-index escalation"

Each new modal picks a higher z-index: 9999, 10000, 10001. The "rules" are ad-hoc.

- **Why bad:** Eventually two overlays fight; nothing is predictable.
- **Fix:** Named scale (`--z-modal`, `--z-popover`, `--z-toast`) + a runtime stack counter.

### "ESC closes nothing"

Modals don't respond to Escape.

- **Why bad:** Excludes keyboard users; breaks expectation.
- **Fix:** Topmost modal handles ESC; sub-1-hour fix.

### "Backdrop click is the only close"

No × button, no ESC, just backdrop click.

- **Why bad:** Half the users miss it; backdrop click is unsafe for destructive modals.
- **Fix:** × button, ESC handler, ARIA label.

### "Modal stacks on modal stacks"

Edit form opens a confirm dialog opens a help tooltip — three layers deep.

- **Why bad:** Sign of flow design problems; users get lost.
- **Fix:** Restructure the flow; merge or sequence the steps.

## Account-level

### "Avatar with no name"

Top-right avatar opens a menu that starts with "My Account" — no name, no email.

- **Why bad:** User has to click to confirm which account they're in (especially for multi-account users).
- **Fix:** Header row in the menu showing name + email.

### "Settings link without scope"

A single "Settings" link mixes account preferences with project team management.

- **Why bad:** Confused scope; depending where you are, "Settings" means different things.
- **Fix:** "Account settings" vs "Project settings" as distinct destinations.

### "Sign out without state cleanup"

Sign-out clears the JWT but leaves `localStorage` full of stale project data.

- **Why bad:** Next user on the same device sees leaked state.
- **Fix:** Clear all session-scoped state on sign-out; preserve only device-scoped data (like theme).

## Auth-level

### "Forgot password leads to 404"

The link exists but the route doesn't.

- **Why bad:** Anyone who forgets their password is locked out.
- **Fix:** Wire up `resetPasswordForEmail` and the reset form.

### "Silent 401"

The session expires mid-use; API calls fail silently; UI shows empty data or broken states.

- **Why bad:** Users blame the app, not the session.
- **Fix:** 401 interceptor that triggers a re-auth modal and preserves drafts.

### "Email exists" leak

Login error: "No account with that email."

- **Why bad:** Confirms valid accounts to attackers.
- **Fix:** Generic "Invalid email or password." Reset-password route returns the same generic message regardless.

## A11y-level

### "Div pretending to be a button"

`<div onclick="…">` that looks like a button.

- **Why bad:** Not focusable, not Enter-activatable, not announced as a button.
- **Fix:** Use `<button>`. Style it however you want.

### "Outline none, no replacement"

`*:focus { outline: none }` with nothing replacing the focus indicator.

- **Why bad:** Keyboard users can't see what's focused.
- **Fix:** Use `:focus-visible` for a clear ring that doesn't appear on mouse-click.

### "Icon-only button with no aria-label"

A magnifying glass icon button with no text or `aria-label`.

- **Why bad:** Screen reader says "button" with no name.
- **Fix:** `aria-label="Search"`.

### "Color as the only differentiator"

Red border for error, green for success — no icon, no text.

- **Why bad:** Colorblind users miss it; copying error to email loses the signal.
- **Fix:** Always pair color with an icon and/or text.

## Mobile-level

### "Shrunken desktop on mobile"

The 80px rail becomes a 64px rail at 768px and stops there.

- **Why bad:** Wastes 16% of phone screen width on chrome; touch targets cramped.
- **Fix:** Bottom tab bar or drawer below 768px.

### "Modal frozen at 400px on mobile"

A login modal with `max-width: 400px` sits awkwardly with margins on a 375px phone.

- **Why bad:** Looks broken; hard to read.
- **Fix:** Full-screen modal below 480px.

### "100vh on iOS"

`height: 100vh` cuts off content behind Safari's address bar.

- **Why bad:** Bottom content unreachable.
- **Fix:** `100dvh` or a JS `--vh` custom property.
