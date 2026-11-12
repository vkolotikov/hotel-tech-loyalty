import { api } from '../../lib/api'
import { crmUrl } from '../lib/api'
import type { ExportFormat } from './leadLogic'

/**
 * Hand the person a file the server made: the leads (and the deals) as the full admin's export gives them
 * (`GET inquiries/export`, a styled Excel workbook by default, `format=csv` for the plain CSV). Round 5: the CSV was read
 * from `GET inquiries`, which answers JSON, so the file came out empty; both now come from the export itself, as a file.
 * The file's name: what it holds, the venue's day, its kind.
 */
export function exportName(what: 'leads' | 'deals', today: string, format: ExportFormat): string {
  return `${what}-${today}.${format}`
}

/** GET a file (through `crmUrl`, which names the area and the brand), as it comes. */
export function getFile(path: string): Promise<Blob> {
  return api.get<Blob>(crmUrl(path), { responseType: 'blob' }).then(r => r.data)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
