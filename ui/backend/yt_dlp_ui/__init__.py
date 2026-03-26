"""Web UI API for yt-dlp (FastAPI + subprocess)."""

from importlib.metadata import version

try:
    __version__ = version("yt-dlp-ui-backend")
except Exception:  # noqa: BLE001
    __version__ = "0.0.0"
