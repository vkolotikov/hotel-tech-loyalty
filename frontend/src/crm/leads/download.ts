/**
 * Hand the person a text file the server sent as the answer to a call (the leads CSV, `inquiries/export?format=csv`).
 * The byte-order mark the server writes is lost when the answer is read as text; it is put back so a spreadsheet
 * opens the file as UTF-8.
 */
export function csvText(text: string): string {
  return text.startsWith('﻿') ? text : `﻿${text}`
}

export function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([type === 'text/csv' ? csvText(text) : text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
