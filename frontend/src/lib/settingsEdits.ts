/**
 * The Settings page's unsaved edits after a save of `sent`: an edit is
 * dropped only when that save sent its key with the value still in the form.
 * Edits the save never sent (a Style click saves only theme_style) and edits
 * typed again while it was in flight stay. Values compare as strings, the
 * way the API stores them.
 */
export function dropSaved(
  edited: Record<string, string>,
  sent: { key: string; value: unknown }[],
): Record<string, string> {
  const next = { ...edited }
  for (const { key, value } of sent) {
    if (key in next && next[key] === String(value)) delete next[key]
  }
  return next
}
