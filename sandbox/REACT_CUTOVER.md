# React frontend — cutover runbook

The React SPA lives in `sandbox/frontend-react/` and is served by the existing
FastAPI backend (it serves whatever is in `FRONTEND_DIR = /app/frontend`). This
runbook switches production from the vanilla frontend to the React build, and
back. **Cutover is deferred until the React app reaches feature parity** — see
the parity checklist at the bottom.

The vanilla frontend in `sandbox/frontend/` is **never deleted** — it stays as
the instant rollback target.

---

## How serving works today (vanilla)

- `docker-compose.yml` → `sandbox` service builds `Dockerfile` and mounts
  `./frontend:/app/frontend` (a host bind-mount). **That bind-mount is what's
  actually served** — it overrides whatever the image baked in.
- So to serve React, two things must change: build the React image, and stop the
  bind-mount from shadowing it.

## The React image (already built & tested)

`Dockerfile.react` is a multi-stage build: Node stage compiles the Vite SPA →
`dist`, Python stage copies that into `/app/frontend`. No backend code changes.
The public Supabase config is passed as build args (the `.env` is `.dockerignore`d):

```
--build-arg VITE_SUPABASE_URL=...   --build-arg VITE_SUPABASE_ANON_KEY=...
```

---

## Cutover (when ready)

Edit `sandbox/docker-compose.yml`, `sandbox` service, three changes:

```yaml
  sandbox:
    build:
      context: .
      dockerfile: Dockerfile.react          # was: Dockerfile
      args:                                  # add — reuse the VM's public values
        VITE_SUPABASE_URL: ${SUPABASE_URL:-}
        VITE_SUPABASE_ANON_KEY: ${SUPABASE_KEY:-}
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]  # drop --reload
    volumes:
      - sandbox-data:/data
      - ./backend:/app/backend
      # REMOVE this line so the baked React dist is served, not the vanilla dir:
      # - ./frontend:/app/frontend
```

Then deploy as normal:

```powershell
.\deploy_to_vm.ps1
```

`deploy_to_vm.ps1` robocopies `sandbox/` (which now includes `frontend-react/`,
excluding `node_modules`) to the VM and runs `docker compose up -d --build`. The
**React build happens inside Docker on the VM** — no Node needed on the host or
VM. Content-hashed asset filenames handle cache-busting; `index.html` is served
`no-cache`, so returning users get the new app immediately.

### Verify after cutover
- `https://www.yuroute.com/api/health` → `{"status":"ok"}`
- View source: the page loads `/assets/index-<hash>.js` (React) not `app.js?v=...`
- Log in and click through the views.

---

## Rollback (instant)

Revert the three `docker-compose.yml` edits (back to `dockerfile: Dockerfile`,
restore the `./frontend:/app/frontend` volume, drop the build args) and redeploy.
The vanilla files are untouched, so this is a clean revert with no data impact.
`git revert` of the cutover commit does the same.

---

## Parity checklist — do NOT cut over until these are ported

Features the live vanilla app has that the React app does not yet:

- [ ] Map: route **animation** (play / scrub engineers over time)
- [ ] Map: **AI chat** panel (`/api/chat`)
- [ ] Map: **history → map replay** (render a stored `test_run`)
- [ ] Map: **real-engineer rota optimisation** (solve using the project's actual
      engineers + shift matrix, not just the random sandbox scenario)
- [ ] Jobs: **AI CSV skill-classification** (currently stubbed)
- [ ] Admin: **invite-request** approve/reject flow
- [ ] Engineers: map **skill IDs → human names** (skills.json parity)
- [ ] Premium-strategy **cost guide** refinement
- [ ] Final `ux-a11y-audit` pass over all views at 375 / 768 / 1024 / 1440
