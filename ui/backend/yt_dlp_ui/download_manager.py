"""Manage yt-dlp subprocess downloads, queue, and history."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]

DATA_DIR = Path(__file__).resolve().parent / "data"
HISTORY_FILE = DATA_DIR / "history.json"
DEFAULT_MAX_CONCURRENT = 3

# Template: pipe-separated for parsing (newline mode prints one line per tick)
PROGRESS_TEMPLATE = (
    "download:%(progress.status)s|%(progress.downloaded_bytes)s|"
    "%(progress.total_bytes)s|%(progress.speed)s|%(progress.eta)s|%(progress.filename)s"
)

# Temp dirs older than this (seconds) are cleaned up on startup
TMPDIR_MAX_AGE_SECS = 3600


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_yt_dlp_source_root() -> Path | None:
    """Directory containing the ``yt_dlp`` package (checkout of this repository)."""
    here = Path(__file__).resolve()
    for base in here.parents:
        if (base / "yt_dlp" / "__init__.py").is_file():
            return base
    return None


def _env_with_pythonpath(root: Path) -> dict[str, str]:
    env = os.environ.copy()
    r = str(root.resolve())
    if env.get("PYTHONPATH"):
        env["PYTHONPATH"] = r + os.pathsep + env["PYTHONPATH"]
    else:
        env["PYTHONPATH"] = r
    return env


def yt_dlp_invocation() -> tuple[list[str], dict[str, str] | None]:
    """Return ``(argv, env)``. ``env`` is ``None`` to inherit the environment; otherwise the full subprocess env."""
    raw = os.environ.get("YT_DLP_PATH", "").strip()
    if raw:
        p = Path(raw).expanduser()
        if p.is_file() and os.access(p, os.X_OK):
            return ([str(p.resolve())], None)
        w = shutil.which(raw)
        if w:
            return ([w], None)
    w = shutil.which("yt-dlp")
    if w:
        return ([w], None)
    if importlib.util.find_spec("yt_dlp") is not None:
        return ([sys.executable, "-m", "yt_dlp"], None)
    root = _find_yt_dlp_source_root()
    if root is not None:
        return ([sys.executable, "-m", "yt_dlp"], _env_with_pythonpath(root))
    return ([], None)


def _yt_dlp_not_found_error() -> RuntimeError:
    return RuntimeError(
        "yt-dlp not found: install the CLI (pip install yt-dlp), "
        "or install the project in editable mode from the repo root (pip install -e .) "
        "in the same environment as the API, or set YT_DLP_PATH to the executable path."
    )


async def run_info(url: str, no_playlist: bool = True) -> dict[str, Any]:
    """Run yt-dlp -J to fetch JSON info."""
    prefix, sub_env = yt_dlp_invocation()
    if not prefix:
        raise _yt_dlp_not_found_error()
    args = [*prefix, "-J", "--ignore-config"]
    if no_playlist:
        args.append("--no-playlist")
    args.append(url)

    popen_kw: dict[str, Any] = {
        "stdout": asyncio.subprocess.PIPE,
        "stderr": asyncio.subprocess.PIPE,
    }
    if sub_env is not None:
        popen_kw["env"] = sub_env

    proc = await asyncio.create_subprocess_exec(*args, **popen_kw)
    out, err = await proc.communicate()
    text_out = out.decode("utf-8", errors="replace")
    text_err = err.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        raise RuntimeError(text_err.strip() or text_out.strip() or f"yt-dlp exited {proc.returncode}")

    line = text_out.strip().splitlines()[-1] if text_out.strip() else ""
    if not line:
        raise RuntimeError("Empty output from yt-dlp -J")
    return json.loads(line)


def build_download_args(req: Any, tmp_dir: str) -> tuple[list[str], dict[str, str] | None]:
    """Build argv and optional subprocess env for yt-dlp download.

    Files are always saved to *tmp_dir* regardless of any user-supplied path.
    """
    prefix, sub_env = yt_dlp_invocation()
    if not prefix:
        raise _yt_dlp_not_found_error()
    args: list[str] = [
        *prefix,
        "--ignore-config",
        "--newline",
        "--no-colors",
        "--progress",
        "--progress-template",
        PROGRESS_TEMPLATE,
        "--progress-delta",
        "0.5",
        "-P",
        tmp_dir,
    ]

    if req.no_playlist:
        args.append("--no-playlist")

    separate = getattr(req, "separate_streams", False)

    has_ffmpeg = _ffmpeg_available()

    if req.extract_audio:
        args.append("-x")
        if req.audio_format:
            args.extend(["--audio-format", req.audio_format])
    elif separate:
        args.extend(["-f", "bv*,ba"])
    elif not has_ffmpeg:
        # Without ffmpeg we cannot merge streams — download a single pre-muxed stream
        if req.format_sort:
            # Resolution-limited: pick best pre-muxed stream up to that height
            args.extend(["-f", "b[ext=mp4]/b"])
        else:
            args.extend(["-f", "b[ext=mp4]/b"])
    elif req.format_id:
        args.extend(["-f", req.format_id])
    else:
        args.extend(["-f", "bv*+ba/b"])

    if req.format_sort and not req.extract_audio:
        args.extend(["-S", req.format_sort])

    if has_ffmpeg and req.merge_output_format and not separate:
        args.extend(["--merge-output-format", req.merge_output_format])

    if req.write_subs:
        args.extend(["--write-subs", "--sub-langs", req.sub_langs])

    if req.embed_thumbnail:
        args.append("--embed-thumbnail")
    if req.embed_metadata:
        args.append("--embed-metadata")

    args.append(req.url)
    return args, sub_env


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _scan_output_files(tmp_dir: str) -> list[str]:
    """Return paths of non-hidden files in *tmp_dir*, sorted by size desc."""
    root = Path(tmp_dir)
    files = [
        str(p)
        for p in root.iterdir()
        if p.is_file() and not p.name.startswith(".")
    ]
    files.sort(key=lambda p: Path(p).stat().st_size, reverse=True)
    return files


def _cleanup_old_tmpdirs() -> None:
    """Remove ytdlp_ temp dirs older than TMPDIR_MAX_AGE_SECS from the OS temp area."""
    tmp_root = Path(tempfile.gettempdir())
    cutoff = time.time() - TMPDIR_MAX_AGE_SECS
    for entry in tmp_root.iterdir():
        if entry.is_dir() and entry.name.startswith("ytdlp_"):
            try:
                if entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry, ignore_errors=True)
            except OSError:
                pass


@dataclass
class ActiveDownload:
    id: str
    url: str
    proc: asyncio.subprocess.Process | None
    task: asyncio.Task[None]
    tmp_dir: str = ""
    created_at: str = field(default_factory=_utc_now_iso)
    percent: float | None = None
    speed: str | None = None
    eta: str | None = None
    filename: str | None = None
    status: str = "starting"
    output_files: list[str] = field(default_factory=list)


class DownloadManager:
    def __init__(
        self,
        max_concurrent: int = DEFAULT_MAX_CONCURRENT,
        on_progress: Optional[ProgressCallback] = None,
    ) -> None:
        self._max = max_concurrent
        self._sem = asyncio.Semaphore(max_concurrent)
        self._active: dict[str, ActiveDownload] = {}
        self._completed: list[dict[str, Any]] = []
        self._on_progress = on_progress
        self._load_history()

    def _load_history(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        _cleanup_old_tmpdirs()
        if not HISTORY_FILE.exists():
            return
        try:
            raw = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            self._completed = raw.get("completed", [])[-200:]
        except (json.JSONDecodeError, OSError):
            self._completed = []

    def _save_history(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        # Don't persist tmp_dir or output_files paths — they won't survive restarts
        safe = []
        for rec in self._completed[-500:]:
            safe.append({k: v for k, v in rec.items() if k not in ("tmp_dir", "output_files")})
        HISTORY_FILE.write_text(
            json.dumps({"completed": safe}, indent=2),
            encoding="utf-8",
        )

    def _record_completed(self, rec: dict[str, Any]) -> None:
        self._completed.append(rec)
        self._save_history()

    async def _emit(self, payload: dict[str, Any]) -> None:
        if self._on_progress:
            await self._on_progress(payload)

    def _parse_progress_line(self, line: str) -> dict[str, Any] | None:
        line = line.strip()
        if not line.startswith("download:"):
            return None
        rest = line[len("download:"):]
        parts = rest.split("|")
        if len(parts) < 5:
            return None
        status, dbytes, tbytes, speed, eta = parts[:5]
        fname = parts[5] if len(parts) > 5 else None
        percent: float | None = None
        try:
            db = int(dbytes) if dbytes not in ("None", "", "NA") else None
            tb = int(tbytes) if tbytes not in ("None", "", "NA") else None
            if db is not None and tb is not None and tb > 0:
                percent = round(100.0 * db / tb, 2)
        except (ValueError, TypeError):
            pass
        return {
            "status": status or "unknown",
            "percent": percent,
            "speed": speed or None,
            "eta": eta or None,
            "filename": fname or None,
        }

    async def _run_process(
        self,
        download_id: str,
        url: str,
        args: list[str],
        sub_env: dict[str, str] | None = None,
    ) -> None:
        proc: asyncio.subprocess.Process | None = None
        try:
            async with self._sem:
                popen_kw: dict[str, Any] = {
                    "stdout": asyncio.subprocess.PIPE,
                    "stderr": asyncio.subprocess.STDOUT,
                }
                if sub_env is not None:
                    popen_kw["env"] = sub_env
                proc = await asyncio.create_subprocess_exec(*args, **popen_kw)
                ad = self._active.get(download_id)
                if ad:
                    ad.proc = proc
                    ad.status = "downloading"

                assert proc.stdout is not None
                buf = b""
                try:
                    while True:
                        chunk = await proc.stdout.read(4096)
                        if not chunk:
                            break
                        buf += chunk
                        while b"\n" in buf:
                            line, buf = buf.split(b"\n", 1)
                            text = line.decode("utf-8", errors="replace")
                            parsed = self._parse_progress_line(text)
                            if parsed and download_id in self._active:
                                ad = self._active[download_id]
                                ad.percent = parsed.get("percent")
                                ad.speed = parsed.get("speed")
                                ad.eta = parsed.get("eta")
                                ad.filename = parsed.get("filename")
                                ad.status = parsed.get("status", "downloading")
                            await self._emit(
                                {
                                    "type": "progress",
                                    "download_id": download_id,
                                    **(parsed or {"status": "log", "raw_line": text}),
                                }
                            )
                    await proc.wait()
                except asyncio.CancelledError:
                    if proc.returncode is None:
                        proc.kill()
                        await proc.wait()
                    raise

                code = proc.returncode or 0
                finished = _utc_now_iso()
                ad = self._active.pop(download_id, None)

                if code == 0:
                    # Scan what yt-dlp wrote to the temp dir
                    output_files = _scan_output_files(ad.tmp_dir) if ad and ad.tmp_dir else []
                    top_filename = Path(output_files[0]).name if output_files else (ad.filename if ad else None)

                    await self._emit(
                        {
                            "type": "progress",
                            "download_id": download_id,
                            "status": "finished",
                            "percent": 100.0,
                            "filename": top_filename,
                        }
                    )
                    self._record_completed(
                        {
                            "id": download_id,
                            "url": url,
                            "status": "completed",
                            "error": None,
                            "filename": top_filename,
                            "tmp_dir": ad.tmp_dir if ad else "",
                            "output_files": output_files,
                            "file_ready": bool(output_files),
                            "created_at": ad.created_at if ad else finished,
                            "finished_at": finished,
                        }
                    )
                else:
                    err = f"yt-dlp exited with code {code}"
                    # Clean up temp dir on failure
                    if ad and ad.tmp_dir:
                        shutil.rmtree(ad.tmp_dir, ignore_errors=True)
                    await self._emit(
                        {
                            "type": "progress",
                            "download_id": download_id,
                            "status": "error",
                            "error": err,
                        }
                    )
                    self._record_completed(
                        {
                            "id": download_id,
                            "url": url,
                            "status": "failed",
                            "error": err,
                            "filename": ad.filename if ad else None,
                            "tmp_dir": "",
                            "output_files": [],
                            "file_ready": False,
                            "created_at": ad.created_at if ad else finished,
                            "finished_at": finished,
                        }
                    )
        except asyncio.CancelledError:
            ad = self._active.pop(download_id, None)
            finished = _utc_now_iso()
            if ad and ad.tmp_dir:
                shutil.rmtree(ad.tmp_dir, ignore_errors=True)
            await self._emit(
                {
                    "type": "progress",
                    "download_id": download_id,
                    "status": "cancelled",
                }
            )
            if ad:
                self._record_completed(
                    {
                        "id": download_id,
                        "url": url,
                        "status": "cancelled",
                        "error": None,
                        "filename": ad.filename,
                        "tmp_dir": "",
                        "output_files": [],
                        "file_ready": False,
                        "created_at": ad.created_at,
                        "finished_at": finished,
                    }
                )
            raise
        except Exception as exc:  # noqa: BLE001
            ad = self._active.pop(download_id, None)
            finished = _utc_now_iso()
            if ad and ad.tmp_dir:
                shutil.rmtree(ad.tmp_dir, ignore_errors=True)
            err = str(exc)
            await self._emit(
                {
                    "type": "progress",
                    "download_id": download_id,
                    "status": "error",
                    "error": err,
                }
            )
            self._record_completed(
                {
                    "id": download_id,
                    "url": url,
                    "status": "failed",
                    "error": err,
                    "filename": None,
                    "tmp_dir": "",
                    "output_files": [],
                    "file_ready": False,
                    "created_at": finished,
                    "finished_at": finished,
                }
            )

    async def start(self, req: Any) -> str:
        download_id = str(uuid.uuid4())
        tmp_dir = tempfile.mkdtemp(prefix="ytdlp_")
        args, sub_env = build_download_args(req, tmp_dir)

        async def runner() -> None:
            await self._run_process(download_id, req.url, args, sub_env)

        task = asyncio.create_task(runner())
        self._active[download_id] = ActiveDownload(
            id=download_id,
            url=req.url,
            proc=None,
            task=task,
            tmp_dir=tmp_dir,
        )
        return download_id

    async def cancel(self, download_id: str) -> bool:
        ad = self._active.get(download_id)
        if not ad:
            return False
        ad.task.cancel()
        if ad.proc and ad.proc.returncode is None:
            ad.proc.kill()
        try:
            await ad.task
        except asyncio.CancelledError:
            pass
        return True

    def get_completed_record(self, download_id: str) -> dict[str, Any] | None:
        """Return the completed record dict for *download_id*, or None."""
        for rec in reversed(self._completed):
            if rec.get("id") == download_id:
                return rec
        return None

    def get_file_path(self, download_id: str) -> Path | None:
        """Return the Path to serve for *download_id*.

        - Single file  → that file.
        - Multiple files → the largest one (e.g. video stream when ffmpeg is unavailable).
        - No files or temp dir gone → None.
        """
        rec = self.get_completed_record(download_id)
        if not rec:
            return None
        files = [Path(p) for p in rec.get("output_files", []) if Path(p).is_file()]
        if not files:
            return None
        if len(files) == 1:
            return files[0]
        # Multiple files: return the largest one (typically the video)
        return max(files, key=lambda p: p.stat().st_size)

    def delete_files(self, download_id: str) -> None:
        """Remove the temp dir for *download_id* (called after file delivery)."""
        rec = self.get_completed_record(download_id)
        if not rec:
            return
        tmp_dir = rec.get("tmp_dir", "")
        if tmp_dir and Path(tmp_dir).is_dir():
            shutil.rmtree(tmp_dir, ignore_errors=True)
        # Mark as no longer available
        rec["file_ready"] = False
        rec["output_files"] = []
        rec["tmp_dir"] = ""

    def list_downloads(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        active = []
        for d in self._active.values():
            active.append(
                {
                    "id": d.id,
                    "url": d.url,
                    "status": d.status,
                    "percent": d.percent,
                    "speed": d.speed,
                    "eta": d.eta,
                    "filename": d.filename,
                    "error": None,
                    "file_ready": False,
                    "created_at": d.created_at,
                    "finished_at": None,
                }
            )
        completed = []
        for rec in reversed(self._completed[-50:]):
            # Check if the temp dir still actually exists
            tmp = rec.get("tmp_dir", "")
            files_exist = bool(tmp and Path(tmp).is_dir() and list(Path(tmp).iterdir()))
            entry = dict(rec)
            entry["file_ready"] = files_exist and bool(rec.get("output_files"))
            completed.append(entry)
        return active, completed
