import { Clock, Film, User } from 'lucide-react'

function pickThumbnail(info: Record<string, unknown>): string | undefined {
  const t = info.thumbnail as string | undefined
  if (t) return t
  const thumbs = info.thumbnails as { url?: string }[] | undefined
  if (thumbs?.length) return thumbs[thumbs.length - 1]?.url
  return undefined
}

function formatDuration(sec: unknown): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Props = {
  info: Record<string, unknown> | null
}

export function VideoInfo({ info }: Props) {
  if (!info) return null

  const title = (info.title as string) || 'Untitled'
  const uploader = (info.uploader as string) || (info.channel as string) || '—'
  const duration = formatDuration(info.duration)
  const thumb = pickThumbnail(info)
  const formats =
    (info.formats as { format_id?: string; ext?: string; resolution?: string }[]) || []
  const preview = formats.slice(0, 3)

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* thumbnail */}
        <div className="group aspect-video w-full shrink-0 overflow-hidden bg-[var(--surface-3)] sm:max-w-[280px]">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Film className="size-10 text-[var(--text-muted)] opacity-50" />
            </div>
          )}
        </div>

        {/* meta */}
        <div className="min-w-0 flex-1 p-6">
          <h2 className="text-[18px] font-medium leading-tight text-[var(--text-primary)]">
            {title}
          </h2>
          <div className="mt-4 flex flex-col gap-2 text-[14px] text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-2">
              <User className="size-4 shrink-0 text-[var(--text-muted)]" />
              {uploader}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-[var(--text-muted)]" />
              {duration}
            </span>
          </div>

          {preview.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <p className="mb-3 text-[12px] font-medium tracking-wide uppercase text-[var(--text-muted)]">
                Detected formats
              </p>
              <div className="flex flex-wrap gap-2">
                {preview.map((f) => (
                  <span key={`${f.format_id}-${f.ext}`} className="inline-flex items-center rounded-md bg-[var(--surface-3)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)]">
                    {f.resolution ?? f.ext ?? f.format_id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
