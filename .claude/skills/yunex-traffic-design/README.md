# Yunex Traffic — Design System

A design system for **Yunex Traffic UK** — a global leader in intelligent
traffic management technology. Yunex Traffic offers an end-to-end
portfolio for adaptive traffic control, highway and tunnel automation,
V2X, and tolling, helping cities and transport authorities improve road
safety, reduce congestion, and create more sustainable mobility networks.

This system codifies the visual + verbal foundations from the official
brand guidelines so any agent or designer can produce on-brand artefacts
without re-reading source PDFs.

---

## Index

| Path                              | What it is                                       |
|-----------------------------------|--------------------------------------------------|
| `colors_and_type.css`             | All design tokens (colors, gradients, type, spacing, motion) |
| `assets/`                         | Logos, icon set, gradient backgrounds, illustrations |
| `assets/icons/bw/`               | 16 curated Streamline B&W traffic/safety icons (PNG, 140×140) |
| `assets/icons/colour/`           | 16 curated RGB gradient icons (SVG) — most-used subset |
| `assets/icons/colour-full/`      | **All 85** RGB gradient illustrations (SVG, numbered 01–85) |
| `assets/icons/digital/`          | 12 curated Digital scene icons (SVG) |
| `assets/icons/digital-full/`     | **All 48** Digital scene icons (SVG) — vehicles, signals, people, infra |
| `assets/icons/vehicles/`         | 16 standalone vehicle / cloud / tunnel SVGs |
| `preview/`                        | Per-token spec cards rendered in the Design System tab |
| `slides/index.html`               | 7 sample slide layouts (deck-stage)              |
| `ui_kits/marketing/`              | Marketing-site UI kit (homepage composition)     |
| `SKILL.md`                        | Agent skill manifest (Claude Code compatible)    |

---

## Sources used

The following brand artefacts were supplied and are the canonical source
of truth for everything in this system:

- `uploads/Colour Palette.pdf` — primary, accent, and gradient-exclusive colors + four signature gradients
- `uploads/Logo Design.pdf` — wordmark, exclusion zones, micro logo, don'ts
- `uploads/Typography.pdf` — Jeko + Inter pairing, scale, basic rules
- `uploads/Visual Storytelling.pdf` — imagery, data-visuals, illustration, iconography
- `uploads/Who We Are.pdf` — company context, vision, purpose, brand stance, tone of voice

Note: A `Powerpoint Template.potx` was referenced in the brief but was
**not present** in the uploads. Slide layouts were therefore constructed
from the typography + visual storytelling guidelines rather than from a
template file. If the .potx exists, please re-upload so layouts can be
matched to the actual master slides.

---

## Company context

**Vision.** *We connect the dots of a new mobility revolution that will
transform cities all over the world.*

**Mission.** Enable cities, highway authorities, and mobility operators
to make road networks and fleets intelligent, enhance safety, and
increase value sustainably over the lifecycle.

**Three purposes.** Liveable cities · safer streets · healthier planet.

**Brand stance.**
- We are uniting what's next in traffic.
- We are a digital leader.
- We don't talk about innovation. We do it. It's our DNA.
- Technology is our craft.

---

## Content fundamentals

How copy is written for Yunex Traffic.

**Tone of voice (from `Who We Are.pdf` p.6).**
*Efficient · friendly · authentic. A balance of emotional (purpose,
human benefit) and rational (technology, facts). Market / thought-leader
attitude, with a partner attitude that is open and reliable.*

**Casing.**
- Sentence case for headlines and body. Headlines often use a contraction
  ("what's", "we're") to feel direct.
- All-caps **only** for short eyebrows, tags, and small navigational
  labels — paired with letter-spacing of about 0.08–0.12em.
- Numbers use thousands separators with a comma (`1,936`).

**Voice.**
- Speaks as **we** ("We protect your assets", "We make cities more
  livable") — collective, confident, never "the company" in third
  person.
- Addresses the reader as **you** when explaining benefits, not "the
  customer" or "the user".
- Verbs lead. Headlines often start with a verb or a present-tense claim
  ("Uniting what's next in traffic", "Connect every junction").

**What it sounds like (lifted phrasing).**
- "Uniting what's next in traffic." (signature line)
- "We protect your assets." (subheadline example)
- "We don't talk about innovation. We do it. It's our DNA." (stance)

**Writing rules.**
- Aim for ≤15 words per line. Long lines lose legibility.
- Don't be afraid of white space. Let the typography breathe.
- Always prefer left-aligned text over center- or right-aligned.
- Highlight a single short run inside a paragraph in **Royal Blue**
  (Inter Medium) — never use accent colors as run highlights.

**Emoji.** Not used. Yunex Traffic copy is professional and confident;
emoji would dilute the technology-leader stance.

**Unicode glyphs.** Sparingly. Em dash (—) for asides, single arrow (→)
inside CTA pills, plus (+) and minus (−) signs in stats — minus is
proper U+2212 not a hyphen.

---

## Visual foundations

Answers the *what does it look like* question.

### Colors

A small palette by design — three primary colors, six accents, three
gradient-exclusive colors, four signature gradients.

- **Primary.** Orange `#F47738` · Yellow `#FFE564` · Purple `#A483FF`.
  Used as solid colors only when the palette demands an accent.
- **Accent.** White, Black, Royal Blue `#1E2ED9`, Lavender `#9DBBFF`,
  Green `#00E38C`, Gray `#E4EDED`. **Royal Blue** is the workhorse — the
  only sanctioned highlight for inline runs of body copy and the only
  color allowed for links.
- **Gradient-exclusive.** Steel `#688ABA`, Sky `#DEECFF`, Pistachio
  `#AFFAD7`. Never appear as flat fills.
- **Signature gradients.**
  1. **Yunex Silver** (primary) — Steel → White → Sky → Pistachio.
     The hero gradient. Backgrounds, full-bleeds, openers.
  2. **Frosted** — Lavender → Sky → White. Soft secondary surface.
  3. **Spring** — Sky → Gray → Pistachio. Calm, neutral panels.
  4. **Deep Blue** — Royal Blue → Lavender. Rich highlight surface.
  5. **Lagoon** (icons only) — Royal Blue → Lavender → Pistachio.

**Rules.** Never combine multiple highlight colors. Never combine
multiple gradients in the same composition. Stick to black and white
typography on colored / gradient backgrounds. Always ensure good
contrast.

### Type

- **Display** — *Jeko SemiBold* for headlines and *Jeko Regular* for
  callouts/quotes at large sizes.
- **Body** — *Inter Regular* for body and small sizes; *Inter Medium*
  for highlighting short runs and small subheadlines.
- **Editable docs** — Arial Regular / Bold (system-safe).

**Substitution.** Jeko is a paid commercial font from
[Ellen Luff Type Foundry](https://ellenlufftype.com/jeko/) and is **not
on Google Fonts**. We currently substitute it with **Manrope** (700/600)
— a geometric sans with similar high x-height, optical correction, and
sharp cuts. *Please supply the licensed Jeko `.woff2` files so we can
replace this substitute and drop them into a `fonts/` folder.*

**Scale.**
Display 72 · H1 56 · H2 40 · H3 28 · H4 22 · Lead 20 · Body 16 · Small 14 · Micro 12.
Headlines tighten letter-spacing −0.02em and run line-height 1.05.

### Backgrounds

Three families:

1. **Flat black** for sections that need authority — section dividers,
   solutions, footer.
2. **Flat white** for content-dense, text-first sections.
3. **One signature gradient per page** — full-bleed, never tiled or
   repeated. The gradient *is* the decoration.

No textures, no patterns, no noise overlays. Hand-drawn illustration is
not part of the brand language; instead, illustrations are reduced
geometric compositions (city silhouettes + a single focal object).

### Imagery

Per `Visual Storytelling.pdf`. Four asset families:
1. **Brand imagery** — documentary photography. Clear, positive, forward
   thinking, authentic. Cities + people. Always include life — never
   empty streets, never nighttime, never motion-blur, never stocky/posy.
2. **Data visuals** — black or white silhouettes of brand imagery
   overlaid with one Royal-Blue or Green highlight + simple typography.
3. **3D renderings** — for stories of transformation that go beyond
   real-life footage.
4. **Illustration & icons** — see Iconography below.

Color correction across photography pulls toward the silver gradient,
shades of blue, with green as a highlight color.

### Animation & motion

Confident, never bouncy. Easing functions are smooth (`cubic-bezier(0.22,
0.61, 0.36, 1)` for out, `cubic-bezier(0.65, 0, 0.35, 1)` for in-out).
Durations: fast 140ms, base 220ms, slow 360ms. No spring physics. Hover
on cards: subtle 4–6px translate of an accent element. Hover on links:
opacity 0.7. Press: no bounce — just the underlying color shift.

### Hover & press states

- **Buttons** — primary darkens (`#000` → `#1E2ED9`); secondary inverts
  (white → black).
- **Links** — opacity 0.7, no underline change.
- **Cards** — small translate or arrow shift on a single sub-element;
  the card itself does not lift or scale.

### Borders, shadows, transparency

- Borders are 1px and almost always `#000` or `#E4EDED` (Yunex Gray).
  Never colored borders.
- Shadows are subtle and **cool-tinted** (`rgba(15,28,64,…)`), never
  warm grey. Three steps: `sm` (1/2), `md` (6/16), `lg` (18/48). A
  fourth `focus glow` is a 4px Royal-Blue ring at 18% alpha.
- Transparency is reserved for gradient overlays on imagery — never on
  the logo (per logo don'ts) and rarely on type.

### Layout

- Container max-width: 1200px.
- Section padding: 96–120px vertical, 64px horizontal at desktop.
- Headlines text-wrap balance; body text-wrap pretty.
- Always left-aligned. Stats and metrics may sit on a baseline grid for
  bold visual rhythm.

### Corner radii & cards

- Buttons + badges: full pill (`999px`). The brand language is
  geometric and confident — pill buttons fit it cleanly.
- Cards: 16–18px (`--radius-lg`).
- Inputs: 8px (`--radius-md`).
- Cards do not use the "rounded with colored left-border accent" cliché.
  Instead, they rely on photography or gradient blocks at the top.

---

## Iconography

From `Visual Storytelling.pdf` p.11–13:
*"For small use and as part of our data visuals we use simple black and
white line icons."* Mini illustrations introduce the icon-specific
**Lagoon** gradient as a highlight. Larger illustrations use a focal
object + reduced city silhouette behind.

**Implementation in this system.**
- Three official icon libraries ship with the system:
  - `assets/icons/bw/` — 16 curated Streamline B&W PNG icons (140×140) covering the traffic/safety subset most relevant to Yunex (traffic lights, e-bike, hybrid car, dashboard, cone, shield-check, biking, etc). The full Streamline set (~465 icons) is a generic third-party stock library — request bulk import only if needed.
  - `assets/icons/colour/` — 16 curated + `assets/icons/colour-full/` — **all 85** numbered RGB SVG illustrations (01–85) in the Royal Blue → Lavender → Pistachio gradient family. Use as feature illustrations, not as inline UI.
  - `assets/icons/digital/` — 12 curated + `assets/icons/digital-full/` — **all 48** Digital scene SVGs (traffic lights, VMS, C-ITS, detection zones, vehicles, pedestrians) for diagramming intersections and scenes.
  - `assets/icons/vehicles/` — 16 standalone vehicle / cloud / tunnel SVGs (ambulance, fire-brigade, train, truck, bridge, etc) extracted from the same colour pack.
- Pick **one set per surface.** Don't mix B&W line icons next to colour gradient icons in the same row — they read as different products.
- **Emoji** are not used.
- **Unicode glyphs** appear for arrows in CTAs (`→`), em dashes (`—`),
- Icons inherit text color via `currentColor`, so they pick up Royal
  Blue / White / Black depending on context.
- **Emoji** are not used.
- **Unicode glyphs** appear for arrows in CTAs (`→`), em dashes (`—`),
  plus / minus signs in stats.

For larger marks, see `assets/illustration-city.svg` and
`assets/data-visual-intersection.svg` — reduced geometric compositions
in the brand's data-visual style.

---

## Logo

`assets/logo-yunex-traffic-black.png` — primary horizontal wordmark for light backgrounds.
`assets/logo-yunex-traffic-white.png` — for dark / black backgrounds.
`assets/logo-yunex-traffic-gradient.png` — wordmark over Silver gradient panels.

The wordmark sets `yunex` in the display weight (Manrope/Jeko 700) and
`traffic` in regular weight, both at the same size, with no separator
glyph and no affix — per the brand's "DON'T use the affix anymore" rule.
Used `currentColor` so the same SVG works on light and dark backgrounds.

**Don'ts** (from logo guidelines): no transparency, no rotation, no
shadows or effects, no proportional changes, no overlays, no partial
crops, no typeface substitution, no use of the affix.

**Substitution flag.** The original wordmark is set in Jeko; on-screen
text uses Manrope as a substitute. The supplied PNG logos in
`assets/logo-yunex-traffic-*.png` are the genuine artwork.

---

## Caveats / things to flag

- **Jeko font is substituted with Manrope.** Please supply licensed
  `.woff2` for Jeko (SemiBold + Regular at minimum) — drop into
  `fonts/` and update `colors_and_type.css`.
- **No `.potx`** was actually present in `uploads/`. Sample slides in
  `slides/` derive from typography + visual rules, not master layouts.
- **No production icon library** was supplied. Icons are bespoke,
  brand-aligned recreations.
- **No production codebase or Figma file** was supplied — the marketing
  UI kit is a plausible reconstruction from brand foundations, not a
  pixel-perfect copy of yunextraffic.com.

