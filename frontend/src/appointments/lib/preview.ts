import type { Impact } from './types'

/**
 * A setup save that can strand appointments (owner decision: warn, list,
 * still allow). Ask the server first with nothing saved; with nothing
 * stranded, save at once; otherwise save only if the person confirms after
 * seeing the list. Null when they went back.
 */
export async function previewThenSave<T extends Impact>(
  save: (dryRun: boolean) => Promise<T>,
  confirm: (impact: Impact) => Promise<boolean>,
): Promise<T | null> {
  const preview = await save(true)
  if (preview.total > 0 && !(await confirm({ affected: preview.affected, total: preview.total }))) return null
  return save(false)
}
