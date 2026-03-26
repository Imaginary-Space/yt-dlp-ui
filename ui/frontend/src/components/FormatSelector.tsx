import { Check } from 'lucide-react'

import type { FormatPreset } from '../api/client'

type Props = {
  presets: FormatPreset[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function FormatSelector({ presets, selectedId, onSelect }: Props) {
  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-medium text-[var(--text-primary)]">
        Quality and format
      </h3>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p) => {
          const active = selectedId === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`group relative text-left transition-colors overflow-hidden border border-black px-6 py-5 ${
                active ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'
              }`}
            >
              {active ? (
                <>
                  <span className="absolute right-4 top-4">
                    <Check className="size-4 text-white" />
                  </span>
                  <span className="relative block text-[14px] font-semibold text-white pr-6">{p.label}</span>
                  {p.description && (
                    <span className="relative mt-2 block text-[13px] text-white/70">
                      {p.description}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="block text-[14px] font-semibold text-black pr-6">{p.label}</span>
                  {p.description && (
                    <span className="mt-2 block text-[13px] text-[var(--text-secondary)]">
                      {p.description}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
