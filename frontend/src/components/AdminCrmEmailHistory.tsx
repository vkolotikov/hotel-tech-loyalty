import { CrmEmailHistory } from './CrmEmailHistory'
import { useTheme } from '../hooks/useTheme'

export function AdminCrmEmailHistory({ resource, id }: { resource: 'guests' | 'inquiries'; id: number }) {
  const theme = useTheme()
  return <div data-workspace="" data-theme={theme.theme_style === 'light' ? 'light' : 'dark'} className="rounded-2xl"><CrmEmailHistory resource={resource} id={id} /></div>
}
