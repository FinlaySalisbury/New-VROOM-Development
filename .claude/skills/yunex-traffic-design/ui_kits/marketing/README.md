# Yunex Traffic — Marketing Web UI Kit

A high-fidelity recreation of the Yunex Traffic UK marketing surface
(home page composition), built from the brand guidelines provided.

## What's in here

| Component        | File                  | Role                                      |
|------------------|-----------------------|-------------------------------------------|
| `Header`         | `Header.jsx`          | Sticky nav with mega-dropdowns, search, EN, CTA |
| `Hero`           | `Hero.jsx`            | Yunex Silver gradient hero with stat row  |
| `Pillars`        | `Pillars.jsx`         | Three-column "Our purpose"                |
| `SolutionsGrid`  | `SolutionsGrid.jsx`   | Dark, four-card solutions grid w/ hover   |
| `CaseStudy`      | `CaseStudy.jsx`       | Split case-study panel with city visual   |
| `Quote`          | `Quote.jsx`           | Large pull quote with Royal Blue highlight|
| `Newsletter`     | `Newsletter.jsx`      | Frosted gradient capture form             |
| `Footer`         | `Footer.jsx`          | Dark footer with link columns + tagline   |

`index.html` composes them into a full marketing page.

## Design notes

- Header uses Inter Medium for nav links; brand wordmark uses Manrope at
  letter-spacing −0.04em.
- Body sections alternate **black**, **white**, and the **Yunex Silver**
  gradient. We stick to two flat tones plus one gradient per page —
  the brand guideline forbids combining multiple gradients in close
  proximity.
- Royal Blue (`#1E2ED9`) is the only inline highlight color.
- All buttons are full-radius pills (per the brand's clean,
  geometric character).
- All icons are inline `currentColor` SVGs from `assets/icons/`.

## Disclaimer

The official Yunex Traffic site was not provided as source. This is a
plausible reconstruction built strictly from the brand foundations
in the supplied PDFs. Treat it as a living, on-brand starting point —
not a pixel-perfect replication of the production site.
