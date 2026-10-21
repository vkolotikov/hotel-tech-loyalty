import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** "Page 2 of 7" with Previous and Next; nothing while everything fits on one page. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const { t } = useTranslation()
  if (pages <= 1) return null
  const button = 'inline-flex items-center gap-1 rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text enabled:hover:bg-a-surface-2 disabled:opacity-50'
  return (
    <nav aria-label={t('loyalty.common.pages', 'Pages')} className="flex items-center justify-between gap-3 pt-3">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={15} aria-hidden />{t('loyalty.common.previous', 'Previous')}
      </button>
      <span className="text-sm text-a-text-2">{t('loyalty.common.page_of', 'Page {{page}} of {{pages}}', { page, pages })}</span>
      <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('loyalty.common.next', 'Next')}<ChevronRight size={15} aria-hidden />
      </button>
    </nav>
  )
}
