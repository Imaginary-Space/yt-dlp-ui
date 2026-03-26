import { Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  cancelDownload,
  downloadFileUrl,
  getDownloads,
  getFormats,
  postDownload,
  postInfo,
  type DownloadRecord,
  type DownloadRequest,
  type FormatPreset,
} from './api/client'
import { APP_ICON } from './constants'
import { DownloadHistory } from './components/DownloadHistory'
import { DownloadQueue } from './components/DownloadQueue'
import { FormatSelector } from './components/FormatSelector'
import { SettingsPanel, type SettingsState } from './components/Settings'
import { UrlInput } from './components/UrlInput'
import { VideoInfo } from './components/VideoInfo'
import { useProgressWebSocket, type ProgressPayload } from './hooks/useWebSocket'

const defaultSettings = (): SettingsState => ({
  writeSubs: false,
  subLangs: 'en.*,es.*',
  embedThumbnail: false,
  embedMetadata: false,
  noPlaylist: true,
})

function buildDownloadRequest(
  url: string,
  preset: FormatPreset | undefined,
  settings: SettingsState,
): DownloadRequest {
  const req: DownloadRequest = {
    url,
    no_playlist: settings.noPlaylist,
    write_subs: settings.writeSubs,
    sub_langs: settings.subLangs,
    embed_thumbnail: settings.embedThumbnail,
    embed_metadata: settings.embedMetadata,
  }

  if (preset?.extract_audio) {
    req.extract_audio = true
    req.audio_format = preset.audio_format ?? 'mp3'
    return req
  }

  if (preset) {
    req.format_id = preset.format_arg || 'bv*+ba/b'
    if (preset.format_sort) req.format_sort = preset.format_sort
    if (preset.merge_output_format) req.merge_output_format = preset.merge_output_format
    if (preset.separate_streams) req.separate_streams = true
  } else {
    req.format_id = 'bv*+ba/b'
  }
  return req
}

export default function App() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<Record<string, unknown> | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [presets, setPresets] = useState<FormatPreset[]>([])
  const [presetId, setPresetId] = useState<string | null>('best')
  const [settings, setSettings] = useState<SettingsState>(defaultSettings)
  const [activeMap, setActiveMap] = useState<Record<string, DownloadRecord>>({})
  const [completed, setCompleted] = useState<DownloadRecord[]>([])
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)
  const autoDownloadedIds = useRef(new Set<string>())

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === presetId),
    [presets, presetId],
  )

  useEffect(() => {
    getFormats()
      .then((r) => setPresets(r.presets))
      .catch(() => {})
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setFfmpegAvailable(d.ffmpeg === true))
      .catch(() => {})
  }, [])

  const triggerBrowserDownload = useCallback((id: string) => {
    if (autoDownloadedIds.current.has(id)) return
    autoDownloadedIds.current.add(id)
    const a = document.createElement('a')
    a.href = downloadFileUrl(id)
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])

  const refreshDownloads = useCallback(async () => {
    try {
      const r = await getDownloads()
      const next: Record<string, DownloadRecord> = {}
      for (const a of r.active) next[a.id] = a
      setActiveMap(next)
      setCompleted(r.completed)
      // Auto-trigger browser download for any ready file
      for (const rec of r.completed) {
        if (rec.file_ready) triggerBrowserDownload(rec.id)
      }
    } catch {
      /* ignore */
    }
  }, [triggerBrowserDownload])

  useEffect(() => {
    refreshDownloads()
    const t = setInterval(refreshDownloads, 4000)
    return () => clearInterval(t)
  }, [refreshDownloads])

  const onProgress = useCallback((msg: ProgressPayload) => {
    if (msg.type !== 'progress' || !msg.download_id) return
    setActiveMap((prev) => {
      const cur = prev[msg.download_id]
      const base: DownloadRecord = cur ?? {
        id: msg.download_id,
        url: '',
        status: msg.status ?? 'downloading',
        created_at: new Date().toISOString(),
      }
      const next: DownloadRecord = {
        ...base,
        status: msg.status ?? base.status,
        percent: msg.percent ?? base.percent,
        speed: msg.speed ?? base.speed,
        eta: msg.eta ?? base.eta,
        filename: msg.filename ?? base.filename,
        error: msg.error ?? base.error,
      }
      if (['finished', 'error', 'cancelled'].includes(msg.status ?? '')) {
        const { [msg.download_id]: _, ...rest } = prev
        // Give the server a moment to register the file before polling
        setTimeout(() => void refreshDownloads(), 800)
        return rest
      }
      return { ...prev, [msg.download_id]: next }
    })
  }, [refreshDownloads])

  useProgressWebSocket(onProgress)

  const handleAnalyze = async () => {
    setInfo(null)
    setInfoError(null)
    setAnalyzing(true)
    try {
      const r = await postInfo({ url: url.trim(), no_playlist: settings.noPlaylist })
      if (r.ok && r.data) setInfo(r.data)
      else setInfoError(r.error || 'Unknown error')
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleDownload = async () => {
    if (!url.trim()) return
    setDownloadBusy(true)
    try {
      const body = buildDownloadRequest(url.trim(), selectedPreset, settings)
      await postDownload(body)
      await refreshDownloads()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloadBusy(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelDownload(id)
      await refreshDownloads()
    } catch {
      /* ignore */
    }
  }

  const activeList = Object.values(activeMap)

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="hero-gradient" />

      <div className="relative mx-auto max-w-[720px] px-6 pb-32 pt-24 text-center">
        {/* header */}
        <header className="mb-14 flex animate-fade-in flex-col items-center">
          <div className="mb-6 flex items-center justify-center">
            <img
              src={APP_ICON}
              alt=""
              width={56}
              height={56}
              className="size-14 object-contain"
              decoding="async"
            />
          </div>
          <h1 className="max-w-xl text-[44px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--text-primary)] md:text-[56px]">
            Download your videos, simply.
          </h1>
          <p className="mt-5 max-w-lg text-[18px] leading-relaxed text-[var(--text-secondary)] md:text-[20px]">
            Paste a link, choose a quality, download. That is it.
          </p>
        </header>

        {/* URL input */}
        <section className="mx-auto max-w-xl animate-slide-up text-left" style={{ animationDelay: '0.05s' }}>
          <UrlInput url={url} onUrlChange={setUrl} onAnalyze={handleAnalyze} loading={analyzing} />
        </section>

        {infoError && (
          <div className="mx-auto mt-4 max-w-xl animate-fade-in rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-left text-[14px] text-red-600">
            {infoError}
          </div>
        )}

        {ffmpegAvailable === false && (
          <div className="mx-auto mt-4 max-w-xl animate-fade-in rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-left text-[13px] text-amber-800">
            <strong className="font-semibold">ffmpeg not found.</strong> Videos will be downloaded as a single pre-muxed stream (lower max quality). Install ffmpeg for best quality with audio.
          </div>
        )}

        <div className="mx-auto mt-16 max-w-2xl space-y-8 text-left">
          {info && (
            <section className="animate-slide-up">
              <VideoInfo info={info} />
            </section>
          )}

          <section className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <FormatSelector
              presets={presets}
              selectedId={presetId}
              onSelect={setPresetId}
            />
          </section>

          <section className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <SettingsPanel settings={settings} onChange={setSettings} />
          </section>

          {/* Download button */}
          <div className="animate-slide-up pt-4" style={{ animationDelay: '0.2s' }}>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!url.trim() || downloadBusy}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-full bg-[var(--accent)] px-8 py-4 text-[15px] font-medium text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {downloadBusy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Download className="size-5" />
              )}
              {downloadBusy ? 'Starting…' : 'Download'}
            </button>
          </div>

          {activeList.length > 0 && (
            <section className="animate-slide-up border-t border-[var(--border)] pt-8">
              <DownloadQueue active={activeList} onCancel={handleCancel} />
            </section>
          )}

          {completed.length > 0 && (
            <section className="animate-slide-up border-t border-[var(--border)] pt-8">
              <DownloadHistory items={completed} />
            </section>
          )}
        </div>
      </div>

      {/* Floating bar */}
      <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center rounded-full bg-black p-1.5 shadow-2xl">
        <div className="flex items-center gap-2.5 pl-4 pr-4">
          <img
            src={APP_ICON}
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-md object-contain"
            decoding="async"
          />
          <span className="text-[13px] font-medium text-white">yt-dlp ui</span>
        </div>
        <a
          href="https://github.com/yt-dlp/yt-dlp"
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black transition-colors hover:bg-gray-100"
        >
          View CLI
        </a>
      </div>
    </div>
  )
}
