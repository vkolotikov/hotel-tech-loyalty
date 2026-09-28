import type { PortalBooking } from './types'

/** `TextEncoder` exists in both the browser bundle and the node test environment; `Buffer` does not. */
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 folding: lines longer than 75 octets continue on the next line after a single space. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (byteLength(cur + ch) > (out.length === 0 ? 75 : 74)) { out.push(cur); cur = ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function buildIcs(b: PortalBooking, venue: { name: string; timezone: string }): string {
  const start = b.starts_at ?? new Date().toISOString()
  const end = b.ends_at ?? start
  // Joined with a real newline: `escape()` writes it as the single `\n` RFC 5545 expects.
  const description = [`Reference ${b.reference}`, b.subtitle ?? '', b.notes ?? ''].filter(Boolean).join('\n')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hexa-Tech//Member portal//EN', 'BEGIN:VEVENT',
    `UID:${b.reference}@hexa-tech`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(b.title)}`, `DESCRIPTION:${escape(description)}`, `LOCATION:${escape(venue.name)}`, 'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(text: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
