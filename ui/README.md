# yt-dlp Web UI

Interfaz web en `ui/` que no modifica el paquete `yt_dlp` del repositorio: el backend invoca el ejecutable **`yt-dlp`** del sistema (o via `python -m yt_dlp` del checkout).

## Inicio rápido (un solo comando)

```bash
./ui/dev.sh
```

Crea el venv, instala dependencias (backend + yt-dlp del repo + frontend) y levanta ambos procesos. Abrí **http://127.0.0.1:8001** en el navegador.

Se puede personalizar:

```bash
PYTHON=python3.12 API_PORT=9000 UI_PORT=9001 ./ui/dev.sh
```

## Inicio manual (dos terminales)

### Backend (Python) — puerto 8000

```bash
cd ui/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
pip install -e ../..           # yt-dlp del repo
uvicorn yt_dlp_ui.main:app --reload --host 127.0.0.1 --port 8000
```

Detalle en [backend/README.md](backend/README.md).

### Frontend (bun + Vite) — puerto 8001

```bash
cd ui/frontend
bun install
bun dev
```

El proxy de Vite envía `/api` y `/ws` al backend en `127.0.0.1:8000` (ver `vite.config.ts`).

## Requisitos

- **Python >= 3.10** y **bun**
- `yt-dlp` se resuelve solo: `dev.sh` instala el checkout del repo en el venv. También puede venir del `PATH` o de `YT_DLP_PATH`.
