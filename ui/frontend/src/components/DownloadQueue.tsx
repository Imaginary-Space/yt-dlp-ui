import { Ban, Loader2 } from 'lucide-react'

import type { DownloadRecord } from '../api/client'

type Props = {
  active: DownloadRecord[]
  onCancel: (id: string) => void
}

export function DownloadQueue({ active, onCancel }: Props) {
  if (active.length === 0) return null

  return (
    <div className="space-y-4">
      <h3 className="text-[18px] font-medium text-[var(--text-primary)]">Active downloads</h3>
      <ul className="space-y-3">
        {active.map((d) => (
          <li key={d.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {d.filename ? (
                  <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                    {d.filename}
                  </p>
                ) : (
                  <p className="truncate font-mono text-[13px] text-[var(--text-secondary)]">
                    {d.url}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[var(--text-secondary)]">
                  <span className="inline-flex items-center rounded-full bg-[var(--surface-3)] px-2.5 py-0.5 font-medium capitalize text-[var(--text-primary)]">
                    {d.status}
                  </span>
                  {d.speed && <span className="font-mono">{d.speed}</span>}
                  {d.eta && <span>ETA {d.eta}</span>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCancel(d.id)}
                className="mt-0.5 shrink-0 rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                title="Cancel"
              >
                <Ban className="size-5" />
              </button>
            </div>

            {/* progress bar */}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-full bg-black transition-all duration-300"
                  style={{
                    width: `${d.percent != null ? Math.min(100, d.percent) : d.status === 'finished' ? 100 : 3}%`,
                  }}
                />
              </div>
              {d.percent != null && (
                <span className="w-10 text-right text-[12px] font-medium text-[var(--text-secondary)]">
                  {d.percent.toFixed(0)}%
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DownloadsLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-[14px] text-[var(--text-secondary)]">
      <Loader2 className="size-4 animate-spin" />
      Syncing…
    </div>
  )
}
