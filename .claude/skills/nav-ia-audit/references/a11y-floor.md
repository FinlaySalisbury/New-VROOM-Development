# Accessibility floor for the shell

This is the *minimum* — what every shell-level component must meet. Feature-level a11y (forms, tables, charts) is out of scope for this skill; see WCAG 2.2 directly.

## Landmarks (the easy wins)

Use semantic HTML, not `<div>`s with classes:

```html
<body>
  <header>
    <a href="/" aria-label="Home">…logo…</a>
    <nav aria-label="Primary">…top bar…</nav>
  </header>
  <aside aria-label="Sections">
    <nav>…rail…</nav>
  </aside>
  <main id="main-content">
    <nav aria-label="Breadcrumb">…</nav>
    <h1>Page title</h1>
    …
  </main>
  <footer>…</footer>
</body>
```

- One `<main>` per page, with `id="main-content"`.
- Multiple `<nav>` elements are fine — distinguish with `aria-label`.
- Skip link as the first focusable element: `<a class="skip-link" href="#main-content">Skip to main content</a>` (visually hidden until focused).

## Focus management

- Every interactive element must be reachable by Tab.
- Tab order matches visual order.
- Focus ring is always visible — never `outline: none` without a replacement.
- Use `:focus-visible` (not `:focus`) to avoid the mouse-click focus ring.
- After a route change, move focus to the new page's `<h1>` (or `<main>` with `tabindex="-1"`).
- Modals: trap focus (see [`modals-overlays.md`](modals-overlays.md)).

## Color contrast

Minimums (WCAG 2.2 AA):
- **4.5:1** for normal text against background.
- **3:1** for large text (≥18pt regular / ≥14pt bold).
- **3:1** for UI components and graphical objects against their adjacent colors.

Tools: browser devtools "contrast" inspector, or [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/).

Common shell-level offenders:
- Nav rail icons at 40–60% opacity on dark backgrounds.
- "Inactive" or "disabled" states that fall below 3:1.
- Placeholder text in inputs.
- Caret/separator characters in breadcrumbs.

## Labels

- Every form field has a `<label for>` bound to the input's `id`. No exceptions.
- Icon-only buttons have `aria-label` describing the action ("Close", "Open menu", "Switch project").
- Decorative images: `alt=""`. Functional images: descriptive alt.
- Avoid `title` attribute as the only label — it's not announced reliably.

## Keyboard interactions (shell-level)

| Element | Key | Behavior |
|---|---|---|
| Avatar menu trigger | Enter/Space | Open menu, focus first item |
| Avatar menu | ↑/↓ | Move between items |
| Avatar menu | Esc | Close, return focus to trigger |
| Project chip | Enter/Space | Open switcher, focus search field |
| Project switcher list | Type | Filter list (type-ahead) |
| Nav rail items | Tab | Reach each in order |
| Modal | Esc | Close |
| Modal | Tab/Shift+Tab | Trap within |
| Skip link | Tab (first) | Focus, Enter to jump to main |

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Apply this default, then carefully restore animations that *aid* comprehension (e.g. a 100ms fade on route change is fine; a 500ms swoosh is not).

## Screen-reader announcements (live regions)

Use `aria-live="polite"` for toasts/notifications:

```html
<div aria-live="polite" aria-atomic="true" class="sr-only" id="announcer"></div>
```

When something happens (project switched, action saved, error appeared), write the message into this div for ~3s. Don't overuse — too many announcements become noise.

## Forms

- Errors next to the field, linked via `aria-describedby` to the input.
- `aria-invalid="true"` on fields with errors.
- Submit button labeled by what it does, not "Submit" ("Create project", "Save changes").
- Required fields marked visibly (`*`) and with `aria-required="true"`.

## Common shell-level a11y bugs

- `<div onclick>` instead of `<button>`. Keyboard users can't activate it.
- `<a href="#">` with `onclick`. Use `<button>` for actions, `<a>` for navigation.
- Icon buttons with no `aria-label`.
- Modal open/close with no focus management — focus stays on a hidden element.
- Color-only state indication ("red means error", "green means success") — pair with icon or text.
- Forms where `Enter` doesn't submit.
- Forms where `Tab` order skips fields (caused by `tabindex` ≥ 1 — never use positive tabindex values; only `0` and `-1`).

## Testing

- Run [axe DevTools](https://www.deque.com/axe/devtools/) once a quarter at minimum.
- Manual keyboard pass: unplug the mouse, navigate the whole shell with Tab/Shift+Tab/Enter/Esc/arrows.
- Manual screen-reader pass: NVDA on Windows, VoiceOver on Mac, TalkBack on Android. The first 10 minutes are awkward; do it anyway.
- Test with `prefers-reduced-motion: reduce` and `prefers-contrast: more`.
- Zoom to 200% — does layout still work?

## Quick win order

If you have 1 day to ship a11y improvements:

1. Replace `<div>` shell wrappers with `<header>`/`<nav>`/`<main>`/`<aside>`/`<footer>`.
2. Add `aria-label` to every icon-only button.
3. Add `:focus-visible` styles app-wide.
4. Add a skip link.
5. Add `prefers-reduced-motion` overrides.
6. Audit contrast on nav rail, breadcrumbs, placeholders.
7. Bind `<label for>` to inputs everywhere.
8. Make Escape close modals.
9. Trap focus in modals.
10. Add a polite live region for toasts.
