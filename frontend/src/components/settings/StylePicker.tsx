import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { clsx } from 'clsx'
import type { ThemeStyle } from '../../hooks/useTheme'
import { glowsFor } from '../../theme/glass'

type StyleId = ThemeStyle | 'light'

interface StyleOption {
  id: StyleId
  name: string
  blurb: string
}

/** The styles, in the order the card row shows them. Clean light ships in part 2. */
export const STYLE_OPTIONS: StyleOption[] = [
  { id: 'glass', name: 'Glass', blurb: 'Frosted panels over a backdrop tinted by your brand colour.' },
  { id: 'classic', name: 'Classic', blurb: 'The original dark admin. Palettes also set its fonts and corners.' },
  { id: 'light', name: 'Clean light', blurb: 'Bright paper and quiet lines.' },
]

const isAvailable = (id: StyleId): id is ThemeStyle => id !== 'light'

/**
 * Settings → Branding → Style. One card per style with a small sample of
 * it. The samples use fixed colours (inline, not tokens) so each one shows
 * its own style whichever style the admin is in. Hook-free on purpose.
 */
export function StylePicker({ value, brand, onPick }: {
  value: ThemeStyle
  brand: string
  onPick: (style: ThemeStyle) => void
}) {
  return (
    <div role="radiogroup" aria-label="Admin style" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {STYLE_OPTIONS.map(option => {
        const id = option.id
        const available = isAvailable(id)
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            data-style-option={id}
            aria-checked={active}
            disabled={!available}
            onClick={available ? () => onPick(id) : undefined}
            className={clsx(
              'text-left rounded-2xl border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
              active ? 'border-primary-400 bg-primary-500/10' : 'border-dark-border hover:border-dark-border2',
              !available && 'opacity-60 cursor-not-allowed hover:border-dark-border',
            )}
          >
            <StyleSample id={id} brand={brand} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-t-primary">{option.name}</span>
              {active && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary">
                  <Check size={10} /> Active
                </span>
              )}
              {!available && (
                <span className="rounded-full border border-dark-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-t-secondary">
                  Coming next
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-t-secondary">{option.blurb}</p>
          </button>
        )
      })}
    </div>
  )
}

const SAMPLES: Record<StyleId, { canvas: string; card: CSSProperties; ink: string; dim: string }> = {
  glass: {
    canvas: 'linear-gradient(160deg, #0B1120 0%, #0D1426 55%, #0A0F1C 100%)',
    card: { background: 'rgb(255 255 255 / 0.08)', border: '1px solid rgb(255 255 255 / 0.16)', borderRadius: 10, boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.1)' },
    ink: '#F3F6FB',
    dim: '#C3CCD9',
  },
  classic: {
    canvas: '#0d0d0d',
    card: { background: '#161616', border: '1px solid #2c2c2c', borderRadius: 8 },
    ink: '#ffffff',
    dim: '#8e8e93',
  },
  light: {
    canvas: '#F5F5F7',
    card: { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, boxShadow: '0 1px 2px rgb(0 0 0 / 0.06)' },
    ink: '#1D1D1F',
    dim: '#6E6E73',
  },
}

function StyleSample({ id, brand }: { id: StyleId; brand: string }) {
  const sample = SAMPLES[id]
  const background = id === 'glass'
    ? `radial-gradient(circle at 15% 10%, ${glowsFor(brand)[0]}66, transparent 60%), ${sample.canvas}`
    : sample.canvas
  return (
    <div aria-hidden="true" className="h-24 rounded-xl p-3 overflow-hidden" style={{ background }}>
      <div className="h-full p-2.5 flex flex-col gap-1.5" style={sample.card}>
        <div className="h-1.5 w-8 rounded-full" style={{ background: brand }} />
        <div className="h-2 w-3/4 rounded-full" style={{ background: sample.ink, opacity: 0.9 }} />
        <div className="h-2 w-1/2 rounded-full" style={{ background: sample.dim, opacity: 0.8 }} />
      </div>
    </div>
  )
}
