import { Info } from 'lucide-react'

/**
 * Round 5 (owner 2026-11-12, "minimize copy"): what used to be a sentence under a title is a small (i) beside it. The
 * words show on hover or focus; a screen reader hears them as the button's name. The bubble is not drawn while hidden,
 * so it never widens the page.
 */
export function InfoTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  return (
    <span className="group/tip relative inline-flex shrink-0 align-middle">
      <button type="button" aria-label={text}
        className="grid h-5 w-5 place-items-center rounded-full text-a-text-2 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-a-accent">
        <Info size={13} aria-hidden />
      </button>
      <span aria-hidden="true"
        className={`pointer-events-none absolute top-full z-40 mt-1.5 hidden w-max max-w-[min(18rem,calc(100vw-2rem))] whitespace-normal rounded-lg border border-a-border bg-a-surface-2 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-a-text shadow-a-lg group-hover/tip:block group-focus-within/tip:block ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {text}
      </span>
    </span>
  )
}
