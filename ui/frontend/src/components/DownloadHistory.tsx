import { AlertCircle, Check } from 'lucide-react'

import type { DownloadRecord } from '../api/client'

type Props = {
  items: DownloadRecord[]
}

export function DownloadHistory({ items }: Props) {
  if (items.length === 0) return null

  return (
    <div className="space-y-4">
      <h3 className="text-[18px] font-medium text-[var(--text-primary)]">Completed</h3>
      <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-white">
        <ul className="max-h-[300px] divide-y divide-[var(--border)] overflow-y-auto">
          {items.map((d) => (
            <li
              key={`${d.id}-${d.finished_at}`}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-2)]"
            >
              {d.status === 'completed' ? (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <Check className="size-4" />
                </div>
              ) : (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertCircle className="size-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                {d.filename ? (
                  <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                    {d.filename}
                  </p>
                ) : (
                  <p className="truncate text-[13px] text-[var(--text-secondary)]">{d.url}</p>
                )}
                {d.error && (
                  <p className="mt-1 text-[13px] text-red-500">{d.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
