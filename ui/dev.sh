#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI="$ROOT/ui"
BACKEND="$UI/backend"
FRONTEND="$UI/frontend"
VENV="$BACKEND/.venv"
PYTHON="${PYTHON:-python3}"
API_PORT="${API_PORT:-8000}"
UI_PORT="${UI_PORT:-8001}"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
cyan()  { printf '\033[0;36m%s\033[0m\n' "$*"; }

cleanup() {
  cyan "Apagando procesos…"
  kill "$PID_API" "$PID_UI" 2>/dev/null || true
  wait "$PID_API" "$PID_UI" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── venv ──────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  cyan "Creando venv en $VENV …"
  "$PYTHON" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

# ── backend deps ──────────────────────────────────────
cyan "Instalando backend (editable) …"
pip install -q -e "$BACKEND"

# ── yt-dlp del repo (editable) ────────────────────────
if ! python -c "import yt_dlp" 2>/dev/null; then
  cyan "Instalando yt-dlp del repositorio en el venv …"
  pip install -q -e "$ROOT"
fi

# ── frontend deps ─────────────────────────────────────
if [ ! -d "$FRONTEND/node_modules" ]; then
  cyan "Instalando dependencias del frontend …"
  (cd "$FRONTEND" && bun install)
fi

# ── arrancar ──────────────────────────────────────────
green "Levantando API en :$API_PORT y UI en :$UI_PORT …"

(cd "$BACKEND" && uvicorn yt_dlp_ui.main:app \
  --host 127.0.0.1 --port "$API_PORT" --reload) &
PID_API=$!

(cd "$FRONTEND" && bun run dev) &
PID_UI=$!

green "──────────────────────────────────────"
green "  UI:  http://127.0.0.1:$UI_PORT"
green "  API: http://127.0.0.1:$API_PORT/docs"
green "──────────────────────────────────────"

wait
