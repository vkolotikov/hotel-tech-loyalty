import { useTranslation } from 'react-i18next'
import { previewTitle } from './pushMath'

/**
 * A push as a phone's lock screen shows it (spec 2026-10-22 release 3 §5): the venue's app name and initial, "now",
 * the title cut after about the guide's characters as phones cut it, and the message's first lines. Phones differ;
 * this is the common case, not a promise.
 */
export function PhonePreview({ title, body, appName, titleGuide }: { title: string; body: string; appName: string; titleGuide: number }) {
  const { t } = useTranslation()
  const shown = previewTitle(title, titleGuide)
  const initial = appName.trim().charAt(0).toUpperCase() || 'H'
  return (
    <figure className="space-y-2" data-phone-preview="">
      <div className="mx-auto w-full max-w-[320px] rounded-[2.25rem] border border-a-border bg-a-surface-2 px-3 pb-8 pt-3 shadow-a-sm">
        <div aria-hidden className="mx-auto h-1.5 w-16 rounded-full bg-a-border" />
        <p aria-hidden className="mt-6 text-center font-a-display text-5xl font-light tabular-nums text-a-text">9:41</p>
        <div className="mt-8 rounded-2xl border border-a-border bg-a-surface p-3 shadow-a-sm">
          <div className="flex items-center gap-2 text-xs text-a-text-2">
            <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-a-accent text-xs font-semibold text-a-accent-ink">{initial}</span>
            <span className="min-w-0 flex-1 truncate font-medium uppercase tracking-wide">{appName}</span>
            <span>{t('loyalty.push.preview.now', 'now')}</span>
          </div>
          <p className={`mt-2 break-words text-sm font-semibold ${shown.text ? 'text-a-text' : 'text-a-text-2'}`} data-preview-title="">
            {shown.text || t('loyalty.push.preview.no_title', 'Your title')}
          </p>
          <p className={`mt-0.5 line-clamp-4 whitespace-pre-line break-words text-sm ${body.trim() ? 'text-a-text' : 'text-a-text-2'}`}>
            {body.trim() || t('loyalty.push.preview.no_body', 'Your message')}
          </p>
        </div>
      </div>
      <figcaption className="text-center text-xs text-a-text-2">
        {shown.cut
          ? t('loyalty.push.preview.cut', 'Phones cut a title after about {{guide}} characters, as here.', { guide: titleGuide })
          : t('loyalty.push.preview.caption', 'How it shows on a lock screen. Phones differ; a long message is cut after a few lines.')}
      </figcaption>
    </figure>
  )
}
