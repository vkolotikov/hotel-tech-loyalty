import { useTranslation } from 'react-i18next'
import { Megaphone } from 'lucide-react'

/** The page a promotion post promotes (spec 2026-10-20 §4.7), opening in a new tab. */
export function PromotesLine({ page }: { page: { id: number; title: string; url: string } }) {
  const { t } = useTranslation()
  return (
    <p data-promotes="" className="flex flex-wrap items-center gap-1.5 text-sm text-a-text-2">
      <Megaphone size={14} aria-hidden className="shrink-0" />
      <span>{t('content.panel.promotes', 'Promotes:')}</span>
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words font-medium text-a-accent-text hover:underline">{page.title}</a>
    </p>
  )
}
