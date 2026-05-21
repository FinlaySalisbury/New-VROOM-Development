# Modals & overlay management

Primary source: [W3C WAI-ARIA APG — Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## The ten-point modal checklist

A modal that fails any of these is a bug, regardless of how it looks:

1. **Container has `role="dialog"` and `aria-modal="true"`.**
2. **Labeled** via `aria-labelledby` (pointing to a visible title) or `aria-label`.
3. **Initial focus** moves to a meaningful element inside the modal on open. For destructive actions, focus the least destructive option.
4. **Focus is trapped** — Tab and Shift+Tab cycle within; cannot escape via keyboard.
5. **Escape closes** the modal. No exceptions.
6. **Click outside** the dialog (on the backdrop) closes it, unless the dialog is destructive or has unsaved input.
7. **Return focus** to the element that opened the modal when it closes. If that element no longer exists, return to a logical place.
8. **Body scroll is locked** while modal is open.
9. **Background is inert** — content behind cannot be tabbed into, screen-reader-read, or clicked.
10. **Close button** exists, visible, labeled (`aria-label="Close"`), minimum 44×44px tap target.

## ARIA structure

```html
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-desc"   <!-- optional -->
>
  <h2 id="dialog-title">Create new project</h2>
  <p id="dialog-desc">Projects group engineers, jobs, and runs.</p>
  <!-- form fields, buttons -->
  <button aria-label="Close" class="modal-close">×</button>
</div>
```

## Keyboard table (verbatim from APG)

| Key | Action |
|---|---|
| Tab | Move focus to the next focusable element inside the dialog. From last, wrap to first. |
| Shift + Tab | Move focus to the previous focusable. From first, wrap to last. |
| Escape | Close the dialog. |

## One primitive, not five

A common smell: every modal in the app implements its own backdrop, z-index, close button, and Escape handler. The result is N copies of bugs.

Fix: one `<Modal>` primitive (or, in vanilla JS, one `openModal({title, content, onClose})` function) that:

- Renders a backdrop and a dialog container.
- Manages a stack of open modals so the topmost gets focus + Escape.
- Locks body scroll while ≥1 modal is open.
- Handles `aria-hidden` on background content while a modal is open.
- Returns focus to `document.activeElement` (captured at open) when closed.
- Accepts a `destructive` flag that disables backdrop-click-to-close.

## Z-index management

Hard-coded z-indexes (9998, 9999, 10000, …) are a symptom that overlay stacking is ad-hoc. Replace with:

- A **named scale**: `--z-base: 1; --z-popover: 10; --z-modal: 100; --z-toast: 200;`.
- A **stack counter** for nested modals: each new modal's z-index = `--z-modal + (stackDepth * 10)`.
- Backdrop z-index = modal z-index − 1.

## Focus trap (vanilla JS sketch)

```js
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
}
```

## Body scroll lock

```js
let scrollY = 0;
function lockBody() {
  scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
}
function unlockBody() {
  document.body.style.position = '';
  document.body.style.top = '';
  window.scrollTo(0, scrollY);
}
```

## Initial focus, by modal type

- **Form modal (create / edit)** → first input.
- **Confirmation modal (delete)** → Cancel button (the safer option).
- **Information modal** → close button or "Got it".
- **Long content modal** → the title element with `tabindex="-1"` so screen readers anchor.

## Background inert

When a modal opens, the rest of the document should become inert: `aria-hidden="true"` on the app root, optionally `inert` attribute (broadly supported now). Reverse on close.

```js
document.getElementById('app-root').setAttribute('aria-hidden', 'true');
document.getElementById('app-root').inert = true;
// ...
// on close:
document.getElementById('app-root').removeAttribute('aria-hidden');
document.getElementById('app-root').inert = false;
```

## Modal vs route

- Use a **modal** for short, focused, ephemeral tasks (confirm delete, edit a single field, quick form ≤5 fields).
- Use a **route** (full page) for anything with substantial content, multiple sections, or shareability needs.
- Use a **route-aware modal** (modal whose open state is in the URL) for things that fit a modal but benefit from URL-sharing (e.g. "review engineer #123").

## Anti-patterns

- **Modal inside modal inside modal.** Almost always means you've conflated several flows; restructure.
- **No close button, only backdrop click.** Half the users won't discover the dismissal.
- **Escape closes the wrong modal** (parent instead of topmost). Use a proper stack.
- **Modal that's also the route's only content.** Just make it a page.
- **Modal that uses `display: none/block`** without ARIA changes. Screen readers see nothing happen.
- **Modal that doesn't trap focus.** Tabbing escapes into the page behind it.
