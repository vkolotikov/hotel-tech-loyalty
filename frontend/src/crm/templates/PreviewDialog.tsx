import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Mail, UserRound } from 'lucide-react'
import { get } from '../lib/api'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import type { EmailTemplate } from './templateLogic'

interface Rendered { subject: string; html: string; member: string | null }

/**
 * A template as the server renders it (GET email-templates/{id}/preview): the subject and the email with its tags
 * filled from a member's details, or left empty when the venue has no member (round 5). The email is drawn in a frame
 * that runs nothing (`sandbox`), so a template's HTML cannot act on the page.
 */
export function PreviewDialog({ template, changed = false, onClose }: { template: Pick<EmailTemplate, 'id' | 'name'>; changed?: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['crm', 'templates', 'preview', template.id], queryFn: () => get<Rendered>(`email-templates/${template.id}/preview`), staleTime: 0 })
  return (
    <SidePanel title={t('crm.templates.preview_title', 'Preview: {{name}}', { name: template.name })} onClose={onClose}>
      <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }} rows={6}>
        {query.data && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-a-text">
              <Mail size={15} aria-hidden className="mt-0.5 shrink-0 text-a-text-2" />
              <span className="min-w-0"><span className="sr-only">{t('crm.templates.subject', 'Subject')}: </span>{query.data.subject}</span>
            </p>
            <p className="flex items-center gap-2 text-xs text-a-text-2">
              <UserRound size={13} aria-hidden className="shrink-0" />
              {query.data.member
                ? t('crm.templates.preview_member', 'Tags filled with the details of {{name}}.', { name: query.data.member })
                : t('crm.templates.preview_no_member', 'Member tags are left empty: no member to fill them.')}
            </p>
            {changed && <p className="text-xs text-a-st-pending">{t('crm.templates.preview_saved_only', 'This is the saved version. Save to see your changes here.')}</p>}
            <iframe title={t('crm.templates.preview_frame', 'The email')} srcDoc={query.data.html} sandbox=""
              className="h-[70vh] w-full rounded-xl border border-a-border bg-a-surface-2" />
          </div>
        )}
      </QueryState>
    </SidePanel>
  )
}
