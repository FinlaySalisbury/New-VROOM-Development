# Auth edges — the unglamorous flows

The login form is easy. The edges around it are where users actually live. A complete auth surface handles:

1. Sign in (happy path).
2. Sign up + email confirmation.
3. Password reset.
4. Magic link / OAuth (if supported).
5. Session expiry mid-use.
6. Idle / inactivity timeout.
7. Sign out.
8. Re-auth for sensitive actions ("step-up auth").
9. Account locked / rate-limited.
10. Deep link gating.

## Sign in

- Email + password by default, plus SSO/magic-link buttons if available.
- **Always include "Forgot password?"** link below the form.
- **Disable submit while in-flight**, show a spinner *inside* the button, never just change its text.
- **Error messages name the problem** ("Wrong password" vs "Login failed").
- Don't reveal whether an email exists in the system — for both sign-in errors and password-reset prompts, return a generic "If that account exists…" message.
- Auto-focus the email field on page load. If the email is prefilled (e.g., from invite link), focus the password.
- Support `Enter` to submit.
- Remember the email (not the password) on this device.

## Sign up

- Same fields as sign-in plus name (optional) and password confirmation.
- Validate password strength inline, not after submit.
- After submit, send confirmation email and show a clear "Check your email" state — not just a green toast.
- On the "Check your email" screen, include: the email address used, "Didn't get it? Resend" with a 60s rate-limit countdown, "Wrong email? Use a different one" link.
- Once confirmed, route directly to the project picker / onboarding, not back to login.

## Password reset

- Trigger from "Forgot password?" link.
- Single email field. Submit always shows "If that account exists, we've sent a reset link." regardless of whether the email is registered.
- Reset link expires in 1 hour. Show that on the form: "We'll send a link valid for 1 hour."
- Reset screen requires the new password twice; validate strength inline.
- After reset, auto-log-in and route to the app. Optionally invalidate all other sessions for this user — if you do, tell them.

## Session expiry (mid-use)

This is the most-forgotten flow. The user is happily using the app; their JWT expires; the next API call returns 401.

Bad pattern: silent failure or generic "something went wrong" toast.

Good pattern:

1. API client intercepts 401.
2. Save in-progress form drafts to local storage with a key like `draft:projects/abc/engineers:1234`.
3. Show a modal/page: "Your session expired. Please sign in to continue."
4. Pre-fill the email if known.
5. After re-auth, restore drafts and resume on the same URL.

A token-refresh flow can extend sessions silently — preferred where available. Even with refresh tokens, plan for the expiry case for users who close the laptop for two weeks.

## Idle timeout (optional but common for sensitive apps)

- Detect: no mouse/keyboard activity for N minutes.
- 1–2 minutes before timeout, show a non-blocking banner: "You'll be signed out in 60s — stay signed in?".
- On click, refresh the session and dismiss.
- On timeout, save drafts, sign out, redirect with a "You were signed out for inactivity" notice.

## Sign out

- Trigger from the avatar menu, not a button on the rail.
- **Confirm** if there are unsaved changes (`onbeforeunload` style check).
- Clear: JWT, in-memory state, sensitive local-storage keys (drafts may be OK to keep).
- Redirect to `/login` (or `/` if there's a marketing page).
- Show a toast on the destination: "You've been signed out."

## Re-auth for sensitive actions

For actions like "change email", "delete project", "rotate API keys":

- Don't trust the existing session for these. Prompt for the password (or 2FA challenge) again, even if signed in.
- A small modal with the password field + the action button is fine.
- Document which actions require re-auth so users aren't surprised.

## Account locked / rate-limited

- After 5 failed sign-ins from the same IP+email, lock for 15 min and email the user.
- Communicate clearly: "Too many failed sign-ins. Try again in 15 minutes, or reset your password."
- Don't soft-lie ("Wrong password") when the account is locked — that wastes the user's time.

## Deep link gating

If an unauthenticated user follows a link to `/projects/abc/engineers/123`:

1. Detect missing session, route to `/login?next=<encoded original URL>`.
2. After sign-in, send them to `next` (validated to be a same-origin path).
3. If they don't have access to that project, show a clear "You don't have access to this project. [Switch project] [Request access]" — don't 404.

## Surfacing the user

Anywhere the user might forget which account they're signed into, show:

- Email in the avatar menu header.
- Email in the top-right tooltip on hover.
- Multi-account UI? Show all signed-in accounts in the menu (Notion-style).

## Anti-patterns

- **Forgot-password page that 404s** because nobody implemented it.
- **Silent 401s** that produce empty data and confused users.
- **Logout button as the only escape on the nav rail.** No identity, no confirmation, no toast.
- **Sign-up that doesn't confirm email** then sends users into a half-broken state.
- **OAuth-only sign-in** with no fallback for users whose provider account is gone.
- **Session that lasts forever** with no refresh strategy. Either short with refresh, or explain the choice.
