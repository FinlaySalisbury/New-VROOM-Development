# CLAUDE.md — InView VROOM Simulation Sandbox

> **Project:** InView VROOM — Vehicle Route Optimisation for Fault Management
> **Owner:** Yunex Traffic (InView Division)
> **Live Domain:** https://yuroute.com
> **Repository:** `FinlaySalisbury/New-VROOM-Development`

---

## 1. Project Overview

InView VROOM is a **Vehicle Routing Problem (VRP) engine** built for Yunex Traffic's field-service division. It automatically plans the most efficient daily schedules for field engineers across London by:

1. Ingesting engineer profiles (skills, shift windows, depot locations) and job manifests (required skills, priority, service time, location).
2. Computing time-dependent travel matrices using TomTom or an in-house London traffic model.
3. Solving the VRP with the open-source VROOM engine (via Docker), enforcing hard constraints (skill matching, time windows).
4. Visualising optimised routes on an interactive Mapbox GL JS map with animated playback, activity timelines, and GeoJSON layers.

The system is exposed through the **Simulation Sandbox** — a full-stack web application where users generate scenarios, run solves across three routing strategies (Naive / In-House / TomTom Premium), compare results, and replay routes.

---

## 2. Repository Structure

```
.
├── src/                          # Python VROOM Orchestrator (MVP engine)
│   ├── ingestion/                # IngestionAdapter, mock_parser
│   ├── temporal/                 # TomTom client, matrix weighter, tomtom_matrix_v2
│   ├── solver/                   # vroom_interface.py
│   └── output/                   # geojson_formatter.py
│
├── sandbox/                      # Simulation Sandbox (full-stack app)
│   ├── docker-compose.yml        # nginx + sandbox + vroom + certbot
│   ├── Dockerfile                # Python 3.12-slim, FastAPI + static frontend
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py           # FastAPI entrypoint
│   │   │   ├── config.py         # Pydantic Settings (env-based)
│   │   │   ├── secrets.py        # GCP Secret Manager loader
│   │   │   ├── database.py       # Supabase client
│   │   │   ├── models.py         # Pydantic models
│   │   │   ├── routers/          # auth, simulation, history, chat, classify, invitations, profile
│   │   │   ├── services/         # convergence_solver, execution_pipeline, data_generator,
│   │   │   │                     # matrix_engine, matrix_weighter, tomtom_matrix_v2,
│   │   │   │                     # foursquare_formatter, route_explainer, email_service
│   │   │   └── core/             # here_client, here_matrix_v8, tomtom_client, tomtom_matrix_v2,
│   │   │                         # matrix_weighter, vroom_interface
│   │   ├── requirements.txt
│   │   └── database_schema.sql   # Supabase multi-tenant schema with RLS
│   ├── frontend/
│   │   ├── index.html            # SPA shell
│   │   ├── app.js                # Main application logic (~193 KB)
│   │   ├── state.js              # AppState pub/sub store
│   │   ├── router.js             # Hash-based SPA router
│   │   ├── modal.js              # Modal system
│   │   ├── toast.js              # Toast notification system
│   │   ├── config.js             # Supabase public config
│   │   ├── yunex-design-system.css  # Full design system tokens
│   │   ├── styles.css            # Application styles
│   │   └── assets/               # Logos, favicons
│   └── nginx/nginx.conf          # Reverse proxy + SSL termination
│
├── data/mock/                    # Mock engineer/job/skills JSON
├── legacy_reference/             # Original scripts for audit parity
├── Docs/                         # System documentation, walkthroughs, design system exports
│   ├── VROOM_System_Documentation.md
│   └── yunex-traffic-design-system/  # Claude Design handoff bundle
├── design-system/                # Logo assets
├── tests/                        # Test directory
│
├── morning_planner.py            # Standalone morning shift planner
├── build_map.py                  # Map generation utilities
├── build_triple_map.py           # Triple comparison map builder
├── stress_test.py                # 2,500+ location pair benchmarking
├── deploy_to_vm.ps1              # GCP VM deployment script
├── requirements.txt              # Root Python dependencies
├── .mcp.json                     # MCP server configuration
├── .env.local                    # Local environment variables (gitignored)
└── CLAUDE.md                     # This file
```

---

## 3. Tech Stack

### Backend
- **Language:** Python 3.12
- **Framework:** FastAPI with Uvicorn
- **Database:** Supabase (PostgreSQL) with Row-Level Security (RLS) and multi-tenant project isolation
- **Auth:** Supabase Auth (JWT-based, verified in middleware)
- **Secrets:** GCP Secret Manager (production), `.env` files (local development)
- **Email:** Resend API (team invitations)
- **AI:** Google Gemini (route explanations), Anthropic Claude (skill classification)
- **Routing APIs:** TomTom Routing API, HERE Matrix Routing v8
- **Solver:** VROOM via Docker (`ghcr.io/vroom-project/vroom-docker:latest`)

### Frontend
- **Architecture:** Vanilla HTML/CSS/JS single-page application (no framework)
- **State Management:** Custom `AppState` pub/sub store (`state.js`)
- **Routing:** Hash-based SPA router (`router.js`)
- **Maps:** Mapbox GL JS
- **Auth UI:** Supabase Auth JS SDK
- **Design System:** Custom CSS design system (`yunex-design-system.css`)

### Infrastructure
- **Hosting:** GCP Compute Engine VM (`vroom-sandbox-server`, `europe-west2-c`)
- **Containerisation:** Docker Compose (nginx, sandbox, vroom, certbot)
- **SSL:** Let's Encrypt via Certbot (auto-renewal)
- **Domain:** yuroute.com
- **CI/CD:** Manual deployment via `deploy_to_vm.ps1` (robocopy → gcloud scp → docker compose)

---

## 4. Design System

> **Source of truth:** This section codifies the official **Yunex Traffic Design System** (canonical brand guidelines). YuRoute is a Yunex application and inherits it in full. The token implementation lives in `sandbox/frontend/yunex-design-system.css`; the full reference bundle + `SKILL.md` live in `.claude/skills/yunex-traffic-design/`.

### 4.1 Design Philosophy
- **Style:** Confident, geometric, technical minimalism. Black + white dominate; a single signature gradient carries the brand feel per surface. Generous white space, left-aligned, ≤15 words per line.
- **Voice:** Speaks as "we"/"you", sentence case, headlines often lead with a verb. No emoji.
- **Performance:** WCAG AA compliance target.

### 4.2 Color Palette

**Primary** (solid fills):

| Role | Hex | Usage |
|------|-----|-------|
| Black | `#000000` | Primary surfaces, buttons, headings, body type |
| White | `#FFFFFF` | Backgrounds, cards, inverse text |
| Royal Blue | `#1E2ED9` | **The workhorse highlight** — links, active states, inline run highlights, button hover. The ONLY sanctioned link/highlight colour. |
| Green | `#00E38C` | Success / positive highlight |
| Lavender | `#9DBBFF` | Info / supporting |
| Gray | `#E4EDED` | Subtle surfaces, borders, dividers |

**Accent** (use ONLY when the primary palette is insufficient — never as link/highlight runs): Orange `#F47738` · Yellow `#FFE564` · Purple `#A483FF`.

**Gradient-exclusive** (only ever inside gradients, never flat fills): Steel `#688ABA` · Sky `#DEECFF` · Pistachio `#AFFAD7`.

**Signature gradients** (one per composition, full-bleed, never tiled, never mixed):
- **Yunex Silver** (primary/hero) — `Steel → White → Sky → Pistachio`. Openers, full-bleed backgrounds.
- **Frosted** — `Lavender → Sky → White`. Soft secondary surface.
- **Spring** — `Sky → Gray → Pistachio`. Calm neutral panels.
- **Deep Blue** — `Royal Blue → Lavender`. Rich highlight surface (avatars, accents).
- **Lagoon** (icons only) — `Royal Blue → Lavender → Pistachio`.

**Status** (mapped on-brand — there is no red in the brand): Success `#00E38C` · Warning `#FFE564` · Danger `#1E2ED9` (Royal Blue) · Info `#9DBBFF`.

### 4.3 Typography

Brand pairing is **Jeko** (display) + **Inter** (body). Jeko is a commercial font (Ellen Luff Type Foundry), not on Google Fonts — substituted with **Manrope** until licensed `.woff2` files are supplied.

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Display | Manrope (→Jeko) | 600 | `clamp(48px, 6vw, 72px)` |
| H1 | Manrope (→Jeko) | 600 | `clamp(36px, 5vw, 56px)` |
| H2 | Manrope (→Jeko) | 600 | `clamp(28px, 4vw, 40px)` |
| H3 | Manrope (→Jeko) | 600 | `clamp(22px, 3vw, 28px)` |
| Body | Inter | 400 | `16px` |
| Small | Inter | 400 | `14px` |
| Micro | Inter | 500 | `12px` |

**Google Fonts import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
```

**Letter spacing:** `--tracking-tight: -0.02em` for headings. `--tracking-caps: 0.08em` for uppercase labels.

### 4.4 Spacing Scale

```
--space-1: 4px    --space-6: 32px
--space-2: 8px    --space-7: 48px
--space-3: 12px   --space-8: 64px
--space-4: 16px   --space-9: 96px
--space-5: 24px   --space-10: 128px
```

### 4.5 Border Radii

```
--radius-sm: 4px     --radius-xl: 24px
--radius-md: 8px     --radius-pill: 999px
--radius-lg: 16px
```

### 4.6 Shadows (Cool-Tinted)

```css
--shadow-sm:   0 1px 2px rgba(15, 28, 64, 0.06);
--shadow-md:   0 6px 16px rgba(15, 28, 64, 0.08);
--shadow-lg:   0 18px 48px rgba(15, 28, 64, 0.12);
--shadow-glow: 0 0 0 4px rgba(30, 46, 217, 0.15);
```

### 4.7 Motion

```css
--ease-out:    cubic-bezier(0.22, 0.61, 0.36, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--dur-fast:    140ms;
--dur-base:    220ms;
--dur-slow:    360ms;
```

### 4.8 Component Classes

The design system provides these CSS component primitives (all prefixed `yx-`):

- **Buttons:** `.yx-btn`, `.yx-btn-primary`, `.yx-btn-secondary`, `.yx-btn-ghost`, `.yx-btn-link`, `.yx-btn-grad`, `.yx-btn-sm`, `.yx-btn-lg`
- **Badges:** `.yx-badge`, `.yx-badge-dark`, `.yx-badge-light`, `.yx-badge-outline`, `.yx-badge-blue`, `.yx-badge-success`, `.yx-badge-warn`, `.yx-badge-danger`
- **Tags:** `.yx-tag` (uppercase label style)
- **Cards:** `.yx-card`, `.yx-card-dark`
- **Inputs:** `.yx-field label`, `.yx-field input/select/textarea`
- **Utilities:** `.yx-arrow` (CTA arrow helper), `.yx-dot` (status indicator)

### 4.9 Anti-Patterns — DO NOT USE
- ❌ Combining two signature gradients in one composition, or tiling/repeating a gradient
- ❌ Textures, patterns, or noise overlays on backgrounds
- ❌ Coloured borders — borders are 1px `#000` or `#E4EDED` (Yunex Gray) only
- ❌ Accent colours (orange/yellow/purple) as link or inline-highlight runs — only Royal Blue `#1E2ED9` highlights
- ❌ Red for danger — the brand has no red; danger maps to Royal Blue
- ❌ Generic off-palette colours (plain `#2563EB`, `#F97316`, indigo, amber) — use the curated tokens
- ❌ Emojis as icons — use the brand SVG line icons (`assets/icons/` from the design-system skill); one icon set per surface
- ❌ Default browser typography — always load Manrope + Inter

### 4.10 Pre-Delivery Checklist
- [ ] `cursor: pointer` on all clickable elements
- [ ] Hover states with smooth transitions (140–300ms); buttons darken black → Royal Blue
- [ ] Light mode: text contrast 4.5:1 minimum; prefer black type
- [ ] Focus states visible for keyboard navigation (`--shadow-glow` ring)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive breakpoints: 375px, 768px, 1024px, 1440px
- [ ] One signature gradient per surface, full-bleed, never tiled
- [ ] No emojis as icons — use the brand line-icon sets

---

## 5. Architecture & Domain Model

### 5.1 Four-Stage Processing Pipeline

```
Data Ingestion → Traffic Matrix → VROOM Solver → GeoJSON Visualisation
```

1. **Data Ingestion:** Parses engineer profiles and job manifests. Supports mock JSON and Supabase live data. Skills are dynamically mapped from human-readable strings (e.g., `"high_voltage"`) to VROOM integer constraints via `skills.json`.

2. **Traffic Matrix:** Computes NxN travel time/distance matrices between all locations. Three strategies:
   - **Naive:** Straight-line distance ÷ 30 km/h. Free, instant.
   - **In-House:** Straight-line distance adjusted by a built-in London traffic model with 6 time periods × 3 geographic zones (Central/Inner/Outer London). Free, instant.
   - **TomTom Premium:** Real road data + predictive traffic from TomTom APIs. Paid, most accurate.

3. **VROOM Solver:** Submits the weighted matrix and constraints as a VROOM VRP JSON payload to the local Docker solver. Hard constraints: dynamic skill matching, strict time windows.

4. **GeoJSON Visualisation:** Decodes route geometries (Google Encoded Polylines) into GeoJSON `[Longitude, Latitude]` format. Supports both high-fidelity polyline decoding and straight-line step fallback.

### 5.2 Iterative Convergence Loop (TomTom Premium Only)

When using TomTom Premium, routes are refined in a feedback loop:
1. Calculate travel times at shift start (07:00)
2. Solve optimal routes
3. Simulate the day forward to determine actual departure times per leg
4. Query TomTom for real travel times at those exact departure times
5. If any leg differs by >25%, adjust and re-solve (max 3 iterations)
6. Central London jobs auto-restricted to non-peak hours (10:00–15:30)

### 5.3 Skill System

Six skill categories: Traffic Light Repair, CCTV Maintenance, Fibre Splicing, High Voltage, Sign Installation, Road Marking.

Skill matching is a **hard constraint** — a job can only be assigned to an engineer who possesses ALL of that job's required skills. Unmatched jobs are flagged as unassigned.

### 5.4 Database Schema (Supabase)

Multi-tenant with project-based isolation:
- `projects` — workspace containers
- `project_members` — RBAC roles: owner, admin, user, viewer
- `invitations` — email-based team invites
- `engineers` — JSONB engineer profiles per project
- `sites` — JSONB site data per project
- `job_lists` — JSONB job manifests per project
- `global_settings` — key-value config per project
- `test_runs` — full solve results with scenario state, VROOM solution, routes, GeoJSON layers, costs
- `profiles` — user profiles (first_name, last_name, department, onboarding_complete)

All tables have RLS policies enforced via `get_user_role()` helper function.

### 5.5 Frontend Architecture

The frontend is a vanilla JS SPA with:
- **`AppState`** — global pub/sub store with keys: `boot`, `session`, `userId`, `userProfile`, `projectId`, `projectRole`, `projects`, `route`
- **Hash Router** — URL contract: `#/login`, `#/profile`, `#/projects`, `#/projects/<id>/<section>`
- **Sections:** `map`, `engineers`, `jobs`, `history`
- **Boot sequence:** Supabase `getSession()` → set `boot: 'ready'` → router evaluates

---

## 6. Environment & Secrets

### Required Environment Variables

```
TOMTOM_API_KEY          # TomTom routing API key
HERE_API_KEY            # HERE matrix routing API key
GEMINI_API_KEY          # Google Gemini for route explanations
CLAUDE_API_KEY          # Anthropic Claude for skill classification
VROOM_ENDPOINT          # VROOM solver URL (default: http://localhost:3000/)
SUPABASE_URL            # Supabase project URL
SUPABASE_KEY            # Supabase anon key
SUPABASE_JWT_SECRET     # JWT verification secret
SUPABASE_SERVICE_ROLE_KEY  # Service role for admin operations
RESEND_API_KEY          # Resend email API key
APP_URL                 # Application URL (default: https://yuroute.com)
```

### Secret Loading Priority
1. **Production:** GCP Secret Manager (`app/secrets.py`)
2. **Local dev:** `.env` file in `sandbox/backend/`

### Corporate Network Constraints
All external HTTPS requests must use `verify=False` and `urllib3.disable_warnings()` to bypass the corporate SSL proxy. This is already implemented in `tomtom_client.py` and `here_client.py`.

---

## 7. Development Workflows

### Local Development

```bash
# Start VROOM solver
docker run --rm -p 3000:3000 ghcr.io/vroom-project/vroom-docker:latest

# Start backend (from sandbox/backend/)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Or start everything via Docker Compose (from sandbox/)
docker compose up -d --build
```

### Deployment to GCP VM

```powershell
# From project root
.\deploy_to_vm.ps1
```

This script:
1. Creates `sandbox_deploy/` via robocopy (excludes `node_modules`, `__pycache__`, `*.db`)
2. Transfers via `gcloud compute scp` to `vroom-sandbox-server` (zone: `europe-west2-c`)
3. SSH in and runs `docker compose up -d --build`
4. Cleans up local temp files

### Running the Orchestrator (MVP Engine)

```bash
# From project root
python morning_planner.py
```

### Stress Testing

```bash
python stress_test.py  # Generates 2,500+ location pairs
```

---

## 8. Coding Standards

### Python
- **Version:** 3.12
- **Type hints:** Use throughout. Pydantic models for all API request/response schemas.
- **Imports:** Standard library → third-party → local, separated by blank lines.
- **Docstrings:** Module-level and function-level docstrings required. Use triple-quote `"""` format.
- **Error handling:** Never silently swallow exceptions. Log with context.
- **Async:** Use `async/await` for all I/O-bound operations in FastAPI routers.
- **Configuration:** Always via environment variables through Pydantic Settings. Never hardcode secrets.

### JavaScript
- **Style:** IIFE module pattern (`(function() { 'use strict'; ... })()`)
- **No framework:** Vanilla JS only. No React, Vue, Angular, or similar.
- **DOM manipulation:** Direct DOM queries. Use `getElementById`, `querySelector`.
- **State:** All shared state through `AppState` pub/sub store. No global variable pollution.
- **Events:** Use event delegation where practical. Clean up listeners on teardown.
- **Error handling:** Wrap async operations in try/catch. Surface errors via `toast()`.

### CSS
- **Architecture:** Design system tokens in `yunex-design-system.css`, application styles in `styles.css`
- **No utility frameworks:** No TailwindCSS, Bootstrap, etc. unless explicitly requested.
- **Custom properties:** Use `var(--token)` references from the design system. Never hardcode values that have token equivalents.
- **Responsive:** Mobile-first. Breakpoints at 375px, 768px, 1024px, 1440px.
- **Transitions:** Always use design system duration/easing tokens.

### General
- **Coordinate format:** Always `[Longitude, Latitude]` (GeoJSON standard). Never `[Lat, Lng]`.
- **Timestamps:** Unix timestamps for shift/access windows. ISO 8601 for display.
- **Comments:** Preserve all existing comments and docstrings unrelated to your changes.
- **File encoding:** UTF-8. Be aware some files may have UTF-16LE BOM (legacy Windows).

---

## 9. API Routes

All API routes are prefixed with `/api/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/cost-estimate` | TomTom cost estimation |
| POST | `/api/simulation/generate` | Generate random scenario |
| POST | `/api/simulation/solve` | Execute routing solve |
| GET | `/api/history` | List past test runs |
| GET | `/api/history/{id}` | Get specific test run |
| POST | `/api/auth/verify` | Verify JWT token |
| GET | `/api/profile` | Get user profile |
| PUT | `/api/profile` | Update user profile |
| POST | `/api/invitations` | Create team invitation |
| GET | `/api/invitations` | List invitations |
| POST | `/api/chat` | AI route explanation |
| POST | `/api/classify` | AI skill classification |

Frontend files are served as static assets with SPA fallback to `index.html`.

---

## 10. Testing

### Acceptance Criteria
- **Temporal Routing Validation:** A route generated at 08:00 (Rush Hour) MUST differ from a route generated at 23:00 (Free Flow) for the same distance and locations.
- **Skill Matching:** Jobs must only be assigned to engineers with ALL required skills.
- **GeoJSON Compliance:** All coordinates in `[Longitude, Latitude]` format.

### Running Tests
```bash
# From project root
python -m pytest tests/
```

### Stress Test
```bash
python stress_test.py  # Validates 2,500+ matrix pairs
```

---

## 11. Key Files Reference

| File | Purpose |
|------|---------|
| `sandbox/frontend/yunex-design-system.css` | **Master design system** — all tokens, component primitives |
| `sandbox/frontend/app.js` | **Main frontend logic** — all UI rendering, map interaction, simulation flow |
| `sandbox/frontend/state.js` | AppState pub/sub store |
| `sandbox/frontend/router.js` | Hash-based SPA router |
| `sandbox/backend/app/main.py` | FastAPI entrypoint |
| `sandbox/backend/app/services/execution_pipeline.py` | Core solve execution orchestration |
| `sandbox/backend/app/services/convergence_solver.py` | Iterative convergence loop |
| `sandbox/backend/app/core/tomtom_client.py` | TomTom API client |
| `sandbox/backend/app/core/here_client.py` | HERE API client |
| `sandbox/backend/app/core/vroom_interface.py` | VROOM solver interface |
| `sandbox/backend/database_schema.sql` | Supabase schema with RLS |
| `src/temporal/matrix_weighter.py` | In-house traffic model |
| `Docs/VROOM_System_Documentation.md` | Full system documentation |
| `vroom_design_system.md` | Design system specification |
| `design.md` | System architecture document |
| `requirements.md` | EARS-format requirements |
| `tasks.md` | Implementation checklist |
| `validation_audit.md` | Legacy parity audit results |

---

## 12. Agent Behavioral Instructions

### Planning Mode
When a request requires major architectural changes, extensive research, significant decision-making, or complex multi-file changes:
1. **Research** the task thoroughly before making changes. Do NOT modify source code during research.
2. **Create an implementation plan** documenting proposed changes, open questions, and verification strategy.
3. **Wait for user approval** before proceeding to execution.
4. **Execute** the approved plan, tracking progress.
5. **Verify** changes work (run tests, check builds, validate UI).
6. **Summarise** what was accomplished.

For simple, targeted changes (fix a typo, add a comment, tweak alignment), proceed directly without a formal plan.

### Web Application Development
When building or modifying web UI:
1. **Core stack:** HTML + vanilla JavaScript + vanilla CSS. No frameworks unless explicitly requested.
2. **Styling:** Use the design system tokens from `yunex-design-system.css`. Use CSS custom properties, never hardcode values.
3. **Aesthetics are critical:** Rich, premium feel. Vibrant curated palette. Smooth micro-animations. Modern typography (Fira Code + Fira Sans). Never create generic-looking MVPs.
4. **Responsive:** Mobile-first, test at 375px / 768px / 1024px / 1440px.
5. **Accessibility:** WCAG AA contrast, keyboard navigation, focus states, `prefers-reduced-motion`.
6. **No placeholders:** Generate real images/assets if needed rather than using placeholder content.
7. **SEO:** Proper title tags, meta descriptions, semantic HTML, single `<h1>` per page.
8. **Unique IDs:** All interactive elements must have unique, descriptive IDs.

### Documentation Integrity
- Preserve all existing comments and docstrings that are unrelated to your code changes.
- When adding new code, always include module-level and function-level docstrings.

### Communication
- Keep responses concise.
- Provide a summary of work completed at the end of each turn.
- Use GitHub-style markdown formatting.
- Create clickable file links using `[filename](file:///path/to/file)` syntax.
- Ask for clarification rather than assuming when intent is ambiguous.

---

## 13. MCP Servers

The project connects to these MCP servers (configured in `.mcp.json`):

- **Supabase:** Database operations, project management, SQL execution
- **GCP Compute:** VM management for the sandbox server
- **Resend:** Email delivery for team invitations

---

## 14. Sandbox Launch Procedure

To start the full Simulation Sandbox locally:

```bash
cd sandbox
docker compose up -d --build
# Open http://localhost:8000 in browser
```

Services:
- **nginx** — Reverse proxy + SSL (ports 80/443)
- **sandbox** — FastAPI backend + static frontend (port 8000, internal)
- **vroom** — VROOM routing engine (port 3000)
- **certbot** — Let's Encrypt auto-renewal

---

## 15. Common Pitfalls

1. **Coordinate order:** VROOM and GeoJSON use `[Longitude, Latitude]`. Google Maps and many APIs use `[Latitude, Longitude]`. Always verify.
2. **SSL proxy:** Corporate firewall intercepts HTTPS. All `requests` calls must use `verify=False` with `urllib3.disable_warnings()`.
3. **Skill IDs:** The current numeric skill IDs (1–8) are mock data. The system supports dynamic string-based skill definitions mapped via `skills.json`.
4. **Frontend caching:** HTML files are served with `no-cache` headers. Static assets (JS/CSS) use cache-busting query params (e.g., `app.js?v=15`).
5. **AppState boot gate:** The router waits for `AppState.boot === 'ready'` before evaluating routes, preventing the auth overlay flash on cold start.
6. **Polyline decoding:** The GeoJSON formatter attempts to decode `route.geometry` polylines first, falling back to straight-line step coordinates only if geometry is unavailable.
7. **Docker networking:** Services reference each other by Docker Compose service names (e.g., `http://vroom:3000/`), not `localhost`.
