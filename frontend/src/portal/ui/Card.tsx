import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Paper by default. `spotlight` is the one dark band the page is allowed —
 * the member card — and it inverts the surface tokens locally so children
 * keep using `p-*` classes and read correctly on it in both modes.
 */
export function Card({ tone = 'paper', className = '', children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'paper' | 'spotlight'; children: ReactNode }) {
  const spotlight = tone === 'spotlight'
  return (
    <div
      {...rest}
      data-portal-theme={spotlight ? 'dark' : undefined}
      data-portal={spotlight ? '' : undefined}
      className={`rounded-p-card border border-p-border bg-p-surface shadow-p ${spotlight ? 'overflow-hidden' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
