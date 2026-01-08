#!/usr/bin/env bash
set -Eeuo pipefail

# Simple dev runner: starts FastAPI (uvicorn --reload) and Next.js frontend together.

API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

APP_MODULE="src.api.app:app"
API_URL="http://${API_HOST}:${API_PORT}"
WS_URL="ws://${API_HOST}:${API_PORT}"

log() { printf "\033[1;34m[dev-up]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[dev-up]\033[0m %s\n" "$*" 1>&2; }

# Pick a uvicorn launcher
pick_uvicorn() {
  if [[ -x "venv/bin/uvicorn" ]]; then
    echo "venv/bin/uvicorn"
    return
  fi
  if command -v uvicorn >/dev/null 2>&1; then
    echo "uvicorn"
    return
  fi
  if python3 -c 'import uvicorn' >/dev/null 2>&1; then
    echo "python3 -m uvicorn"
    return
  fi
  err "uvicorn is not installed. Activate your venv and install deps:"
  err "  python3 -m venv venv && source venv/bin/activate && pip install -r requirements-dev.txt"
  exit 1
}

UVICORN_CMD=$(pick_uvicorn)

cleanup() {
  local ec=$?
  log "Shutting down..."
  # Try to stop backend first
  if [[ -n "${BACK_PID:-}" ]]; then
    kill "$BACK_PID" 2>/dev/null || true
    wait "$BACK_PID" 2>/dev/null || true
  fi
  exit "$ec"
}
trap cleanup EXIT INT TERM

log "API_URL: ${API_URL}"
log "WS_URL:  ${WS_URL}"
log "Starting FastAPI (reload) on ${API_HOST}:${API_PORT}..."

# Start backend in background
(
  export PYTHONPATH="${PYTHONPATH:-.}"
  exec ${UVICORN_CMD} "${APP_MODULE}" --reload --host "0.0.0.0" --port "${API_PORT}"
) &
BACK_PID=$!

sleep 1

log "Starting frontend on http://localhost:${FRONTEND_PORT}..."
(
  cd frontend
  if [[ ! -d node_modules ]]; then
    err "frontend/node_modules missing. Run 'npm install' in ./frontend first."
    kill "$BACK_PID" 2>/dev/null || true
    wait "$BACK_PID" 2>/dev/null || true
    exit 1
  fi
  NEXT_PUBLIC_API_URL="${API_URL}" \
  NEXT_PUBLIC_WS_URL="${WS_URL}" \
  npm run dev -- -p "${FRONTEND_PORT}"
)
