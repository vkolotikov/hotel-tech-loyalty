import type { ReactNode } from 'react'

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

export function Figure({ children }: { children: ReactNode }) {
  return <p className="font-a-display text-3xl font-light leading-tight tracking-tight tabular-nums text-a-text">{children}</p>
}
