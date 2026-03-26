# yt-dlp UI — backend

FastAPI API that runs the **yt-dlp** **CLI** as a subprocess. Same convention as the main repo: **`pyproject.toml`** + **Hatchling** (`hatchling.build`), Python **>= 3.10**.

## Editable install (recommended)

From this folder (`ui/backend`):

```bash
python3 -m pip install -e .
```

## Run

```bash
# After editable install
uvicorn yt_dlp_ui.main:app --reload --host 127.0.0.1 --port 8000
```

Or:

```bash
python3 -m yt_dlp_ui
```

Or the console script:

```bash
yt-dlp-ui-api
```

## Dependencies

Declared in `[project] dependencies` in `pyproject.toml` (no `requirements.txt`).

## Where `yt-dlp` is resolved

The API looks, in this order:

1. `YT_DLP_PATH` (executable path or name on `PATH`)
2. the `yt-dlp` command on `PATH`
3. **`python -m yt_dlp`** if the `yt_dlp` package is installed in **the same Python** that runs uvicorn
4. if the UI code lives inside a checkout that already contains the **`yt_dlp/`** folder at the repo root, it uses **`python -m yt_dlp`** with **`PYTHONPATH`** pointing at that root (so a separate `pip install -e .` for yt-dlp in the exact same venv as uvicorn is not strictly required)

If it still fails, from the repo root with the API venv active:

```bash
pip install -e .
```

Or install the CLI: `pip install yt-dlp`.

## Build (sdist/wheel)

Same as the main project with standard tools:

```bash
python3 -m pip install build
python3 -m build
```
