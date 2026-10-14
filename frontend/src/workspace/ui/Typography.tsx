import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { emsOf, fitCqi } from './fitFigure'

/** Atelier type roles (spec 4.4): display serif for titles and figures, mono for small labels. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-a-display text-3xl font-normal leading-tight tracking-tight text-a-text">{children}</h1>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-a-display text-xl font-normal leading-snug text-a-text">{children}</h2>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{children}</div>
}

/**
 * A big figure in the display face. `fit` (the Today strip): sized to its tile,
 * up to the display size: its width in ems is measured before paint, for each
 * value and again once the display face has loaded, and workspace.css
 * ([data-fit]) turns it into a size in the tile's own units (ui/fitFigure.ts).
 */
export function Figure({ children, fit = false }: { children: ReactNode; fit?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null
  useLayoutEffect(() => {
    const el = ref.current
    if (!fit || !el) return undefined
    const measure = () => {
      const n = fitCqi(emsOf(el))
      if (n === null) el.style.removeProperty('--a-fit')
      else el.style.setProperty('--a-fit', n.toFixed(2))
    }
    measure()
    // The display face is swapped in when it arrives (font-display: swap), and is wider or narrower than the fallback.
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.addEventListener('loadingdone', measure)
    return () => fonts?.removeEventListener('loadingdone', measure)
  }, [fit, text])
  return (
    <p ref={ref} className="font-a-display text-3xl font-light leading-tight tracking-tight tabular-nums text-a-text" data-fit={fit ? '' : undefined}>
      {children}
    </p>
  )
}
