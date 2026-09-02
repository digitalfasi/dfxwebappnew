# DFX Solution — Jewellery Relationship Operating System

A white-label, multi-tenant SaaS platform letting jewellers (tenants) run digital
gold-savings schemes under their own brand.

## Repository layout

```
/                 Next.js (App Router) + TypeScript frontend — project root
  src/            Frontend application source (see src/ for details)
  package.json    Frontend dependencies/scripts (npm run dev / build)

Backend/          FastAPI backend (separate Python project, own venv/deps)
  app/            Application source (models, schemas, repositories, services, api)
  tests/          pytest suite (api/services/repositories/security)
  alembic/        Database migrations
  scripts/        Standalone/manual scripts (not part of the pytest suite)
  SESSION_HANDOFF.md   Living log of what's been built, module by module —
                       read this first when picking up work on this project

docs/             Product specification & reference material
  jros-product-bible_3.html          Full 24-chapter formal product spec
  jros-interactive-prototype 1.html  Click-through UI mockup
  Phase 3 Cart Implementation.md     Historical chat log for the cart feature build
```

The frontend runs at the repository root (not in a `frontend/` subfolder) — this
matches its `package.json` name (`jros-frontend`) and its existing CI workflow
(`.github/workflows/test-backend.yml`), which already assumes `Backend/` is a
sibling directory at repo root.

## Running locally

- **Backend**: `cd Backend && venv\Scripts\activate && uvicorn app.main:app --reload` (port 8000)
- **Frontend**: `npm run dev` (port 3000)

Both talk to a live Supabase Postgres instance — there is no local/Docker DB.
See `Backend/.env.example` and `.env.example` for required environment variables.

## Where to start

Read `Backend/SESSION_HANDOFF.md` in full before making changes — it is the
single source of truth for what has been built, why, and what's intentionally
left out of scope.
