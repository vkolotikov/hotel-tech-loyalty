import { useTranslation } from 'react-i18next'
import { previewDocument } from './campaignsMath'

/**
 * The email as the server rendered it (spec 2026-10-21 release 2 §6), in a frame that may do nothing: `sandbox=""`
 * runs no script and submits no form, so HTML a draft brought from the full admin cannot touch the workspace. The SPA
 * sends no Content-Security-Policy, so a `srcdoc` frame is allowed; the full admin previews its campaigns the same way.
 */
export function EmailPreview({ html }: { html: string }) {
  const { t } = useTranslation()
  if (html.trim() === '') {
    return <p className="rounded-xl border border-dashed border-a-border px-4 py-10 text-center text-sm text-a-text-2">{t('loyalty.campaigns.preview.empty', 'The email is empty. Add a heading or some text.')}</p>
  }
  return (
    <iframe title={t('loyalty.campaigns.preview.title', 'Preview of the email')} sandbox="" srcDoc={previewDocument(html)}
      className="h-[32rem] w-full rounded-xl border border-a-border bg-a-surface-2" />
  )
}
