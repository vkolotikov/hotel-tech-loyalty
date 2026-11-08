import { initials } from '../lib/format'

/** A person's initials in a circle (no pictures of visitors are kept). */
export function Avatar({ name, size = 'md', tone = 'neutral' }: { name: string | null | undefined; size?: 'sm' | 'md' | 'lg'; tone?: 'neutral' | 'accent' | 'ai' }) {
  const box = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-sm'
  const fill = tone === 'accent' ? 'bg-a-accent text-a-accent-ink' : tone === 'ai' ? 'crm-ai-fill' : 'bg-a-surface-2 text-a-text'
  return <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-semibold ${box} ${fill}`}>{initials(name)}</span>
}
