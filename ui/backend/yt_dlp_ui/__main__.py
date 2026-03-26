"""Run API with: python -m yt_dlp_ui"""

from __future__ import annotations


def main() -> None:
    import uvicorn

    uvicorn.run(
        "yt_dlp_ui.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )


if __name__ == "__main__":
    main()
