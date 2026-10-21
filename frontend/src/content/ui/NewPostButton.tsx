import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useBoot } from '../ContentProvider'
import { usePanel } from '../panel/PanelProvider'

/** New post in a page's header (spec 2026-10-21 §5): a new post on the venue's today, opened in the panel. */
export function NewPostButton() {
  const { t } = useTranslation()
  const boot = useBoot()
  const panel = usePanel()
  return (
    <button type="button" data-new-post="" onClick={() => panel.openNew({ date: boot.venue.today, platform: null })}
      aria-label={t('content.shell.new_post', 'New post')}
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-a-accent to-a-accent-deep px-3 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition sm:px-4 [@media(hover:hover)]:hover:-translate-y-px">
      <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('content.shell.new_post', 'New post')}</span>
    </button>
  )
}
