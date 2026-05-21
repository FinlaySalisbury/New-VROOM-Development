# Responsive checklist

Four breakpoints, four behaviors. Don't ship until each one has been tested in a real browser at that width.

## Breakpoints

| Width | Device class | Layout |
|---|---|---|
| ≤480px | Phone | Bottom tab bar; full-screen modals; single-column content |
| 481–768px | Phone landscape / small tablet | Bottom tab bar OR drawer; modals 90% width; single-column |
| 769–1024px | Tablet / small laptop | Left rail + top bar; modals fixed-width; two-column max |
| ≥1025px | Desktop | Default layout; max-width clamps on content |

## Phone (≤480px)

- [ ] **Primary nav** is a **bottom tab bar**, max 5 items. Icons + tiny labels. Active state filled.
- [ ] **Secondary actions** live behind a hamburger or an avatar menu top-right.
- [ ] **Project chip** is short or shows an icon only; tap opens a sheet that's at least 75% screen height.
- [ ] **Modals are full-screen**, with a clear back arrow or × top-left/right.
- [ ] **Breadcrumbs** are truncated to "… › Current section › Page" or hidden in favor of a back arrow.
- [ ] **Tap targets** are ≥44×44px and at least 8px apart.
- [ ] **Forms** are single column; labels above inputs, never side-by-side.
- [ ] **Text** is 16px minimum (smaller triggers iOS auto-zoom on input focus).
- [ ] **Safe-area insets** respected — content not hidden behind notches, status bar, home indicator.

## Phone landscape / small tablet (481–768px)

- [ ] **Layout still mobile-first.** Don't introduce the rail yet; landscape phones are still phones.
- [ ] **Bottom tab bar** remains; consider adding a 6th slot if needed via "More".
- [ ] **Modals** centered with ~90% width, max-height with scrolling content.

## Tablet / small laptop (769–1024px)

- [ ] **Left rail + top bar** layout active.
- [ ] **Rail** at 64–80px wide; icons + small text labels.
- [ ] **Top bar** holds project chip, breadcrumbs, avatar.
- [ ] **Modals** at a fixed width (~480px) or `min(90vw, 600px)`.
- [ ] **Project switcher popover** ≤ 90% screen height.

## Desktop (≥1025px)

- [ ] **Default layout**, no special handling needed.
- [ ] **Content has a max-width** (typically 1280–1440px) and centers horizontally; otherwise text becomes unreadable on ultrawide displays.
- [ ] **Side panels** (chat, activity log) can be open simultaneously without crushing the main content.

## Common bugs to test for

- [ ] **iOS Safari address-bar shift** — `100vh` should be replaced with `100dvh` or `min-height: 100vh` + JS adjustment.
- [ ] **Pinch-zoom**: doesn't break layout (avoid `user-scalable=no`).
- [ ] **Landscape rotation** mid-flow: state preserved.
- [ ] **Sticky elements** that overlap the keyboard on iOS — test focusing an input mid-page.
- [ ] **Horizontal scroll** on any page is a bug. Hunt down the overflowing element.

## Testing tools

- Chrome devtools device emulation — Pixel 7, iPhone 14, iPad Mini, iPad Pro.
- Real device for at least one phone and one tablet — emulators miss touch and safe-area quirks.
- Playwright responsive tests at the four breakpoints.

## Mobile nav decision tree

```
≤480px AND ≤5 primary sections?
  → Bottom tab bar
≤480px AND >5 primary sections?
  → Bottom tab bar with 4 + "More" sheet
≤768px AND content needs full width?
  → Drawer (hamburger) instead of tab bar
>768px?
  → Left rail + top bar
```
