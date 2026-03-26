import { ChevronDown, Settings2 } from 'lucide-react'
import { useState } from 'react'

export type SettingsState = {
  writeSubs: boolean
  subLangs: string
  embedThumbnail: boolean
  embedMetadata: boolean
  noPlaylist: boolean
}

type Props = {
  settings: SettingsState
  onChange: (s: SettingsState) => void
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <div className="flex-1">
        <span className="block text-[14px] font-medium text-[var(--text-primary)]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] text-[var(--text-secondary)]">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-black' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

export function SettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const patch = (partial: Partial<SettingsState>) => onChange({ ...settings, ...partial })

  return (
    <div className="overflow-hidden bg-white border border-black transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-gray-50"
      >
        <span className="flex items-center gap-3 text-sm font-medium uppercase tracking-widest text-black">
          <Settings2 className="size-5" />
          Download settings
        </span>
        <ChevronDown
          className={`size-5 text-black transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-1 border-t border-black bg-white px-6 py-3">
          <div className="divide-y divide-black/10">
            <Toggle
              checked={settings.noPlaylist}
              onChange={(v) => patch({ noPlaylist: v })}
              label="Single video only"
              description="If the link is a playlist, download only the linked video."
            />
            <Toggle
              checked={settings.writeSubs}
              onChange={(v) => patch({ writeSubs: v })}
              label="Download subtitles"
              description="Download English and Spanish subtitles when available."
            />
            <Toggle
              checked={settings.embedThumbnail}
              onChange={(v) => patch({ embedThumbnail: v })}
              label="Embed thumbnail"
              description="Save the cover image inside the file."
            />
            <Toggle
              checked={settings.embedMetadata}
              onChange={(v) => patch({ embedMetadata: v })}
              label="Embed metadata"
              description="Add title, artist, and description to the file."
            />
          </div>
        </div>
      )}
    </div>
  )
}
