---
name: yunex-traffic-design
description: Use this skill to generate well-branded interfaces and assets for Yunex Traffic, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

- Tokens: `colors_and_type.css` — drop in via `<link>` and use CSS vars
- Brand colors: Royal Blue `#1E2ED9` is the highlight; black + white dominate; gradients (Silver, Frosted, Spring, Deep Blue) carry the brand feel
- Type: Manrope (Jeko substitute) for display, Inter for body; left-aligned, ≤15 words / line
- Logo: `assets/logo-yunex-traffic-black.png` (light bg), `-white.png` (dark bg), `-gradient.png` (Silver gradient bg) — never recolor with accents, never add effects
- Icons: `assets/icons/*.svg` — currentColor line icons at 24px
- Components: see `ui_kits/marketing/` for full marketing-site recreation
- Slides: see `slides/index.html` for 7 layouts on the deck-stage shell
- Cards: full pill buttons, 16–18px card radius, no colored borders, cool-tinted shadows
- Voice: confident "we" / "you", no emoji, sentence case, headlines often start with a verb
