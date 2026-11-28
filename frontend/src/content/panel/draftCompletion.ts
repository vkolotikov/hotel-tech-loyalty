import { isDirty, rebase, type Editing, type PostForm } from './panelState'

/** A save acknowledges exactly the submitted snapshot, not the old loaded base. */
export const completedSave = (editing: Editing, submitted: PostForm, fresh: PostForm): PostForm => rebase(submitted, editing.draft, fresh)
/** An intentional undo during Save is still an edit relative to its eventual acknowledgement. */
export const hasPendingEdits = (editing: Editing, submitted: PostForm | null): boolean =>
  isDirty(editing.base, editing.draft) || (submitted !== null && isDirty(submitted, editing.draft))

/** A clean, prefilled Create still owns a pending request and must survive Back. */
export const needsDraftProtection = (editing: Editing, submitted: PostForm | null): boolean =>
  submitted !== null || hasPendingEdits(editing, submitted)

export const sameOpening = (owner: string, seq: number, currentOwner: string, currentSeq: number | undefined): boolean => owner === currentOwner && seq === currentSeq

export const sameBrandPlaceholder = <T>(brand: number | null, previousKey: readonly unknown[] | undefined, previous: T | undefined): T | undefined =>
  previousKey?.[1] === brand ? previous : undefined
