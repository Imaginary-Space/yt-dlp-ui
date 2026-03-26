const API_BASE = import.meta.env.VITE_API_BASE ?? ''

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || res.statusText)
  }
  return res.json() as Promise<T>
}

export interface InfoRequest {
  url: string
  no_playlist?: boolean
}

export interface InfoResponse {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

export async function postInfo(body: InfoRequest): Promise<InfoResponse> {
  return json<InfoResponse>('/api/info', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface DownloadRequest {
  url: string
  format_id?: string | null
  extract_audio?: boolean
  audio_format?: string | null
  write_subs?: boolean
  sub_langs?: string
  embed_thumbnail?: boolean
  embed_metadata?: boolean
  merge_output_format?: string | null
  format_sort?: string | null
  no_playlist?: boolean
  separate_streams?: boolean
}

export interface DownloadResponse {
  download_id: string
  message?: string
}

export async function postDownload(body: DownloadRequest): Promise<DownloadResponse> {
  return json<DownloadResponse>('/api/download', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface DownloadRecord {
  id: string
  url: string
  status: string
  percent?: number | null
  speed?: string | null
  eta?: string | null
  filename?: string | null
  error?: string | null
  file_ready?: boolean
  created_at: string
  finished_at?: string | null
}

export interface DownloadsListResponse {
  active: DownloadRecord[]
  completed: DownloadRecord[]
}

export async function getDownloads(): Promise<DownloadsListResponse> {
  return json<DownloadsListResponse>('/api/downloads')
}

export async function cancelDownload(id: string): Promise<{ cancelled: boolean }> {
  return json<{ cancelled: boolean }>(`/api/downloads/${id}/cancel`, {
    method: 'POST',
  })
}

/** Returns the URL to trigger a browser file download for a completed download. */
export function downloadFileUrl(id: string): string {
  return `${API_BASE}/api/downloads/${id}/file`
}

export interface FormatPreset {
  id: string
  label: string
  format_arg: string
  description: string
  format_sort?: string | null
  extract_audio?: boolean
  audio_format?: string | null
  merge_output_format?: string | null
  separate_streams?: boolean
}

export interface FormatsResponse {
  presets: FormatPreset[]
}

export async function getFormats(): Promise<FormatsResponse> {
  return json<FormatsResponse>('/api/formats')
}

export function wsProgressUrl(): string {
  const base = import.meta.env.VITE_WS_BASE
  if (base) return `${base.replace(/\/$/, '')}/ws/progress`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/progress`
}
