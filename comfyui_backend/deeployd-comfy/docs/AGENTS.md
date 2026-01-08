# Repository Guidelines

This guide helps contributors and tooling work effectively in this repo.

## Project Structure & Module Organization
- `src/` – Python backend (FastAPI). Key areas: `src/api/` (routes, app), `src/containers/` (Docker build logic), `src/workflows/` (parsing/validation), `src/db/`, `src/utils/`.
- `frontend/` – Next.js 15 + TypeScript dashboard.
- `tests/` – `unit/` and `integration/` pytest suites.
- `docker/` – Dockerfiles and compose configs; `docker/api/Dockerfile` for API image.
- `scripts/` – Dev helpers (e.g., `scripts/dev-up.sh`).
- `docs/` – Design notes and guides.

## Build, Test, and Development Commands
- `make install` – Create venv and install backend + frontend deps.
- `make dev-up` – Run FastAPI (reload) and Next.js together.
- `make backend-run` – Run API only via uvicorn.
- `make frontend-dev` – Run frontend dev server.
- `make test` – Run pytest with coverage (fails under 80%).
- `make lint` – Run pre-commit hooks (Ruff, mypy, bandit, docs/lint).
- `make type-check` – mypy (backend) + `npm run type-check` (frontend).
Examples:
```
pytest -m "not slow and not docker" -q
uvicorn src.api.app:app --reload --port 8000
docker compose up -d
```

## Coding Style & Naming Conventions
- Python: Ruff-managed style (line length 88, double quotes). Type hints required (`mypy` strict); 4-space indent; `snake_case` for modules/functions, `PascalCase` for classes.
- Frontend: TypeScript, Next.js; follow ESLint defaults and component co-location.
- Use small, focused modules under `src/<domain>/`. Keep public APIs in `__init__.py` minimal.

## Testing Guidelines
- Framework: `pytest`; tests live in `tests/` and follow `test_*.py` naming.
- Coverage: target ≥ 80% (HTML report in `htmlcov/`).
- Markers: `unit`, `integration`, `docker`, `slow` (e.g., `-m "unit"`).
- Prefer fast unit tests; gate Docker/integration locally before PR.

## Commit & Pull Request Guidelines
- Prefer Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- PRs must include: clear description, linked issues, test plan, and screenshots for UI changes.
- Ensure: `make lint type-check test` passes; update docs/examples when behavior changes.

## Security & Configuration Tips
- Do not commit secrets; use `frontend/.env.local` and runtime env vars for API (`API_HOST`, `API_PORT`).
- Run bandit via pre-commit for security checks.
- CORS and compression are configured in `src/api/app.py`; adjust via `APISettings` if needed.

## Agent-Specific Instructions
- Keep patches minimal and focused; place new backend code under the appropriate `src/` domain and add tests.
- Do not change build pipelines, licensing, or unrelated files. Obey this file’s conventions when editing.

