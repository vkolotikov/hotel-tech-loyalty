/** How long "Copied" shows before the copy button's own words come back (PostActions waits as long). */
export const COPIED_FOR_MS = 2000

/** After a copy, the button goes back to its words, so a second copy says so again (5B-2 review); a refusal's words stay. */
export function resetAfterCopied(state: 'idle' | 'copied' | 'failed', idle: () => void): (() => void) | undefined {
  if (state !== 'copied') return undefined
  const timer = setTimeout(idle, COPIED_FOR_MS)
  return () => clearTimeout(timer)
}
