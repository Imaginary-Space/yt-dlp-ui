"""FastAPI server for yt-dlp Web UI."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from yt_dlp_ui.download_manager import DownloadManager, _ffmpeg_available, run_info
from yt_dlp_ui.models import (
    CancelResponse,
    DownloadRecord,
    DownloadRequest,
    DownloadResponse,
    DownloadsListResponse,
    FormatPreset,
    FormatsResponse,
    InfoRequest,
    InfoResponse,
)

PRESETS: list[FormatPreset] = [
    FormatPreset(
        id="best",
        label="Best quality (.mp4)",
        format_arg="bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b",
        merge_output_format="mp4",
        description="Best video and audio merged into one file",
    ),
    FormatPreset(
        id="720p",
        label="720p (.mp4)",
        format_arg="bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b",
        format_sort="res:720",
        merge_output_format="mp4",
        description="Up to 720p, merged to .mp4",
    ),
    FormatPreset(
        id="1080p",
        label="1080p (.mp4)",
        format_arg="bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b",
        format_sort="res:1080",
        merge_output_format="mp4",
        description="Up to 1080p, merged to .mp4",
    ),
    FormatPreset(
        id="audio_mp3",
        label="Audio only (MP3)",
        format_arg="",
        extract_audio=True,
        audio_format="mp3",
        description="Extract audio as MP3",
    ),
    FormatPreset(
        id="audio_m4a",
        label="Audio only (M4A)",
        format_arg="",
        extract_audio=True,
        audio_format="m4a",
        description="Extract audio as M4A",
    ),
]


class ConnectionManager:
    """Broadcast JSON messages to all connected WebSocket clients."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        text = json.dumps(message, ensure_ascii=False)
        for ws in self._connections:
            try:
                await ws.send_text(text)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


connection_manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def on_progress(msg: dict[str, Any]) -> None:
        await connection_manager.broadcast(msg)

    app.state.dm = DownloadManager(on_progress=on_progress)
    yield


app = FastAPI(title="yt-dlp UI API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8001", "http://127.0.0.1:8001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _dm() -> DownloadManager:
    return app.state.dm


@app.get("/", response_class=HTMLResponse)
async def root() -> str:
    """Shown only when the frontend has not been built yet."""
    if _FRONTEND_DIST.is_dir():
        # Serve index.html directly — the SPA mount handles it normally,
        # but FastAPI routes take precedence over mounts so we forward here.
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
    return """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>yt-dlp UI API</title></head>
<body style="font-family: system-ui; max-width: 40rem; margin: 2rem; line-height: 1.5;">
  <h1>yt-dlp UI — API</h1>
  <p>This process (<strong>uvicorn</strong>) serves only the REST and WebSocket API.</p>
  <p><strong>The web UI</strong> is the Vite project. In another terminal:</p>
  <pre style="background: #f4f4f5; padding: 1rem; border-radius: 8px;">cd ui/frontend
bun dev</pre>
  <p>Or build and serve everything together:</p>
  <pre style="background: #f4f4f5; padding: 1rem; border-radius: 8px;">./ui/start.sh</pre>
  <p>Interactive API docs: <a href="/docs">/docs</a></p>
</body>
</html>"""


@app.post("/api/info", response_model=InfoResponse)
async def api_info(body: InfoRequest) -> InfoResponse:
    try:
        data = await run_info(body.url, no_playlist=body.no_playlist)
        return InfoResponse(ok=True, data=data)
    except json.JSONDecodeError as e:
        return InfoResponse(ok=False, error=f"Invalid JSON: {e}")
    except RuntimeError as e:
        return InfoResponse(ok=False, error=str(e))
    except Exception as e:  # noqa: BLE001
        return InfoResponse(ok=False, error=str(e))


@app.post("/api/download", response_model=DownloadResponse)
async def api_download(body: DownloadRequest) -> DownloadResponse:
    try:
        download_id = await _dm().start(body)
        return DownloadResponse(download_id=download_id)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/api/downloads", response_model=DownloadsListResponse)
async def api_downloads() -> DownloadsListResponse:
    active_raw, completed_raw = _dm().list_downloads()
    active = [DownloadRecord(**r) for r in active_raw]
    completed = [DownloadRecord(**r) for r in completed_raw]
    return DownloadsListResponse(active=active, completed=completed)


@app.post("/api/downloads/{download_id}/cancel", response_model=CancelResponse)
async def api_cancel(download_id: str) -> CancelResponse:
    ok = await _dm().cancel(download_id)
    return CancelResponse(download_id=download_id, cancelled=ok)


@app.get("/api/downloads/{download_id}/file")
async def api_download_file(download_id: str, background_tasks: BackgroundTasks) -> FileResponse:
    """Stream the completed download file to the browser, then delete it from the server."""
    file_path = _dm().get_file_path(download_id)
    if file_path is None or not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="File not found. It may have already been downloaded or the download failed.",
        )

    # Determine a clean download filename
    filename = file_path.name

    # Schedule deletion after response is sent
    background_tasks.add_task(_dm().delete_files, download_id)

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/formats", response_model=FormatsResponse)
async def api_formats() -> FormatsResponse:
    return FormatsResponse(presets=PRESETS)


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "ffmpeg": _ffmpeg_available()}


@app.websocket("/ws/progress")
async def ws_progress(websocket: WebSocket) -> None:
    await connection_manager.connect(websocket)
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.disconnect(websocket)


# ── SPA static file serving ───────────────────────────────────────────────────
# Serve the built Vite frontend (ui/frontend/dist/) when it exists.
# This allows a single `uvicorn` process to serve both the API and the UI,
# which is required when exposing the app via a tunnel on a single port.

_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


class _SPAStaticFiles(StaticFiles):
    """Serve static files; fall back to index.html for unknown paths (SPA routing)."""

    async def get_response(self, path: str, scope: Any) -> Any:  # type: ignore[override]
        try:
            return await super().get_response(path, scope)
        except Exception:  # noqa: BLE001
            return await super().get_response("index.html", scope)


if _FRONTEND_DIST.is_dir():
    app.mount("/", _SPAStaticFiles(directory=str(_FRONTEND_DIST), html=True), name="spa")
