#!/usr/bin/env bash
# Production start: build the frontend and serve everything from a single
# uvicorn process on PORT (default 8000).
# Use this when exposing the app via a Cloudflare Tunnel or any reverse proxy.
#
# Usage:
#   ./ui/start.sh              # port 8000
#   PORT=9000 ./ui/start.sh    # custom port
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI="$ROOT/ui"
BACKEND="$UI/backend"
FRONTEND="$UI/frontend"
VENV="$BACKEND/.venv"
PYTHON="${PYTHON:-python3}"
PORT="${PORT:-8000}"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
cyan()  { printf '\033[0;36m%s\033[0m\n' "$*"; }

# ── venv ──────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  cyan "Creating venv in $VENV …"
  "$PYTHON" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

# ── backend deps ──────────────────────────────────────
cyan "Installing backend dependencies …"
pip install -q -e "$BACKEND"

# ── yt-dlp ────────────────────────────────────────────
if ! python -c "import yt_dlp" 2>/dev/null; then
  cyan "Installing yt-dlp from repo …"
  pip install -q -e "$ROOT"
fi

# ── frontend deps & build ─────────────────────────────
if [ ! -d "$FRONTEND/node_modules" ]; then
  cyan "Installing frontend dependencies …"
  (cd "$FRONTEND" && bun install)
fi

cyan "Building frontend …"
(cd "$FRONTEND" && bun run build)
green "Frontend built → $FRONTEND/dist"

# ── start ─────────────────────────────────────────────
green "──────────────────────────────────────"
green "  App: http://0.0.0.0:$PORT"
green "  API docs: http://0.0.0.0:$PORT/docs"
green "──────────────────────────────────────"

exec uvicorn yt_dlp_ui.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --app-dir "$BACKEND"
