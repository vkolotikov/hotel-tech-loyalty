/** A person on a service, or a service on a person, as an editor holds it: ticked, own minutes and own price as typed. */
export interface LinkDraft { on: boolean; duration: string; price: string }

export const EMPTY_LINK: LinkDraft = { on: false, duration: '', price: '' }

/** The draft's entry, or an empty one for a service or person added elsewhere while the editor was open. */
export function linkOf(links: Record<number, LinkDraft>, id: number): LinkDraft {
  return links[id] ?? EMPTY_LINK
}
