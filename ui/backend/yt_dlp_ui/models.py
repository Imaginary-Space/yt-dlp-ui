"""Pydantic models for the yt-dlp UI API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class InfoRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Video or playlist URL")
    no_playlist: bool = Field(True, description="If true, only extract single video")


class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=1)
    format_id: str | None = Field(None, description="yt-dlp -f value (e.g. best, 137+140)")
    extract_audio: bool = Field(False)
    audio_format: str | None = Field(None, description="mp3, m4a, etc. when extract_audio")
    output_path: str | None = Field(None, description="-P home path for downloads")
    write_subs: bool = Field(False)
    sub_langs: str = Field("en.*,es.*", description="--sub-langs value")
    embed_thumbnail: bool = Field(False)
    embed_metadata: bool = Field(False)
    merge_output_format: str | None = Field(None, description="mp4, mkv, etc.")
    format_sort: str | None = Field(None, description="-S value e.g. res:720")
    no_playlist: bool = Field(True)
    separate_streams: bool = Field(False, description="Download video and audio as separate files")


class DownloadResponse(BaseModel):
    download_id: str
    message: str = "Download started"


class CancelResponse(BaseModel):
    download_id: str
    cancelled: bool


class FormatPreset(BaseModel):
    id: str
    label: str
    format_arg: str
    description: str = ""
    format_sort: str | None = None
    extract_audio: bool = False
    audio_format: str | None = None
    merge_output_format: str | None = None
    separate_streams: bool = False


class FormatsResponse(BaseModel):
    presets: list[FormatPreset]


class DownloadRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    url: str
    status: str
    percent: float | None = None
    speed: str | None = None
    eta: str | None = None
    filename: str | None = None
    error: str | None = None
    file_ready: bool = False
    created_at: str = ""
    finished_at: str | None = None


class DownloadsListResponse(BaseModel):
    active: list[DownloadRecord]
    completed: list[DownloadRecord]


class ProgressMessage(BaseModel):
    type: str = "progress"
    download_id: str
    status: str
    percent: float | None = None
    speed: str | None = None
    eta: str | None = None
    filename: str | None = None
    raw_line: str | None = None


class InfoResponse(BaseModel):
    ok: bool = True
    data: dict[str, Any] | None = None
    error: str | None = None


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool = True


class BrowseResponse(BaseModel):
    current: str
    parent: str | None = None
    dirs: list[DirEntry]
