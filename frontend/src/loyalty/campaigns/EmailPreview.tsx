import { useTranslation } from 'react-i18next'
import { previewDocument } from './campaignsMath'

/**
 * The email as the server rendered it (spec 2026-10-21 release 2 §6), in a frame that may do nothing: `sandbox=""`
 * runs no script and submits no form, so HTML a draft brought from the full admin cannot touch the workspace. The SPA
 * sends no Content-Security-Policy, so a `srcdoc` frame is allowed; the full admin previews its campaigns the same way.
 * Since release 3 it is the server's preview (`preview_subject`, `preview_html`): the tags filled with the viewer's own
 * sample, escaped by the server; `filled` says so under the frame.
 */
export function EmailPreview({ html, subject, filled = false }: { html: string; subject?: string; filled?: boolean }) {
  const { t } = useTranslation()
  if (html.trim() === '') {
    return <p className="rounded-xl border border-dashed border-a-border px-4 py-10 text-center text-sm text-a-text-2">{t('loyalty.campaigns.preview.empty', 'The email is empty. Add a heading or some text.')}</p>
  }
  return (
    <div className="space-y-2">
      {subject !== undefined && subject !== '' && (
        <p className="text-sm text-a-text"><span className="text-a-text-2">{t('loyalty.campaigns.preview.subject', 'Subject')}</span> {subject}</p>
      )}
      <iframe title={t('loyalty.campaigns.preview.title', 'Preview of the email')} sandbox="" srcDoc={previewDocument(html)}
        className="h-[32rem] w-full rounded-xl border border-a-border bg-a-surface-2" />
      {filled && <p className="text-xs text-a-text-2" data-sample="">{t('loyalty.campaigns.preview.sample', 'The tags show a sample — your own name, the first tier, made-up points — as your test email has them. Each member sees their own.')}</p>}
    </div>
  )
}
