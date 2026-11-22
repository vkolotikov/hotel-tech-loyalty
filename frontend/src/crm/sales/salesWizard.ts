export const FIELD_STEPS = ['company', 'market', 'services'] as const
export const STEPS = ['sources', ...FIELD_STEPS, 'review'] as const
export type FieldStep = (typeof FIELD_STEPS)[number]
export type Step = (typeof STEPS)[number]

export type Fields = Record<string, string>

export type Evidence = { type: 'website' | 'web' | 'attachment'; title: string; url?: string }
export type Suggestion = { value: string; sources: Evidence[] }
export type Capture = {
  id: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  fields?: Record<string, Suggestion>
  warnings?: string[]
  error?: string | null
}
export type Limits = { count: number; each_bytes: number; total_bytes: number; extensions: string[] }
export type CaptureData = { capture: Capture | null; limits: Limits }
export type Sources = { website: string; search: boolean; name: string; files: File[] }

export type Profile = {
  brand: { id: number; name: string }
  steps: Record<FieldStep, string[]>
  fields: Fields
  manual: Fields
  inherited: Fields
  sources: Record<string, Evidence[]>
  revision: number
}

export const isCapturing = (capture: Capture | null | undefined) => capture?.status === 'queued' || capture?.status === 'running'

export function websiteAddress(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function validWebsite(value: string): boolean {
  try {
    const address = new URL(value)
    return (address.protocol === 'https:' || address.protocol === 'http:') && Boolean(address.hostname)
      && !address.username && !address.password && !/\s/.test(value)
  } catch {
    return false
  }
}

export function effectiveValue(profile: Profile, draft: Fields, key: string): string {
  return draft[key]?.trim() || profile.inherited[key] || (key === 'name' ? profile.brand.name : '')
}

export function missingSuggestions(profile: Profile, draft: Fields, suggestions: Record<string, Suggestion>): Fields {
  return Object.fromEntries(Object.entries(suggestions)
    .filter(([key]) => !effectiveValue(profile, draft, key))
    .map(([key, finding]) => [key, finding.value]))
}

export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function addFiles(current: File[], incoming: File[], limits: Limits):
  { files: File[]; error?: 'file_type' | 'file_size' | 'file_count' | 'file_total' } {
  const selected = [...current]
  const keys = new Set(current.map(fileKey))
  for (const file of incoming) {
    if (keys.has(fileKey(file))) continue
    if (!limits.extensions.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) return { files: current, error: 'file_type' }
    if (!file.size || file.size > limits.each_bytes) return { files: current, error: 'file_size' }
    selected.push(file)
    keys.add(fileKey(file))
  }
  if (selected.length > limits.count) return { files: current, error: 'file_count' }
  if (selected.reduce((size, file) => size + file.size, 0) > limits.total_bytes) return { files: current, error: 'file_total' }
  return { files: selected }
}
