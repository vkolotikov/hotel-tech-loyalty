/** A write the AI does for a post from outside its panel ("Write with AI" from a template): working, or the refusal's code. */
export interface OutsideWrite { failed: string | null }

/** The writes by post: one post's new state, or null when its write is done; every other post's is left as it is. */
export function withWriting(writes: Readonly<Record<number, OutsideWrite>>, id: number, state: OutsideWrite | null): Record<number, OutsideWrite> {
  const next = { ...writes }
  if (state) next[id] = state
  else delete next[id]
  return next
}
