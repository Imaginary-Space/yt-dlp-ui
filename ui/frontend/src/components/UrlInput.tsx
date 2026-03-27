import { Loader2 } from 'lucide-react'

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

type Props = {
  url: string
  onUrlChange: (v: string) => void
  onAnalyze: () => void
  loading: boolean
  disabled?: boolean
}

export function UrlInput({ url, onUrlChange, onAnalyze, loading, disabled }: Props) {
  const hasInput = url.trim().length > 0
  const valid = !hasInput || isValidUrl(url.trim())
  const showError = hasInput && !valid

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && valid && url.trim() && !loading && !disabled) onAnalyze()
  }

  return (
    <div className="space-y-2">
      <div className={`border bg-white p-1 transition-shadow hover:shadow-md ${showError ? 'border-red-400' : 'border-black'}`}>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-3 pl-4">
            <input
              type="url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste a YouTube, Twitter, TikTok link…"
              disabled={disabled || loading}
              className="w-full bg-transparent py-4 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!url.trim() || !valid || loading || disabled}
            className="group inline-flex shrink-0 items-center gap-3 bg-black px-6 py-4 text-sm font-medium uppercase tracking-widest text-white transition-colors hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Analyze
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transform transition-transform group-hover:translate-x-1">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
      {showError && (
        <p className="pl-1 text-[13px] text-red-500">
          Enter a valid URL (https://…)
        </p>
      )}
    </div>
  )
}

export { isValidUrl }
