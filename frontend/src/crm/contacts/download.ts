import { api } from '../../lib/api'
import { crmUrl, get, params } from '../lib/api'
import { csvWithBom, exportName, type ExportFormat } from './contactsLogic'
import { saveTextFile } from './queries'

/**
 * The contacts export (GET guests/export), as the full admin's Export button asks for it: the styled workbook by
 * default, or CSV. The workbook is bytes, so it is read as a blob through the same address the workspace calls
 * (`crmUrl`: an area it lists, with its `brand_id`); the CSV as text, with its byte-order mark kept.
 */
export async function downloadContacts(query: Record<string, string>, format: ExportFormat, today: string): Promise<void> {
  if (format === 'csv') {
    const text = await get<string>(`guests/export${params(query)}`)
    saveTextFile(csvWithBom(typeof text === 'string' ? text : ''), exportName(today, 'csv'), 'text/csv;charset=utf-8')
    return
  }
  const answer = await api.get<Blob>(crmUrl(`guests/export${params(query)}`), { responseType: 'blob' })
  saveBlob(answer.data, exportName(today, 'xlsx'))
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
