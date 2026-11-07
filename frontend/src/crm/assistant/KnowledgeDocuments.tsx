import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileText, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { dateTime } from '../lib/format'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Pill } from '../ui/Pill'
import { useToast } from '../ui/Toast'
import { DOCUMENT_ACCEPT, DOCUMENT_TONE, fileProblem, fileSize, uploadRefused } from './knowledge'
import { IconButton } from './parts'
import { knowledgeChanged } from './queries'
import type { DocumentStatus, KnowledgeDocument } from './types'

/**
 * Documents the assistant reads (knowledge/documents): PDF, Word (.docx) or plain text, up to 10 MB — the old Word
 * format (.doc) is refused, since nothing can read its text. The server reads each one when it arrives and says whether
 * it could; one it could not is read again on request.
 */
export function DocumentsCard({ documents, canManage }: { documents: KnowledgeDocument[]; canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null)
  const typesLine = t('crm.assistant.documents.types', 'PDF, Word (.docx) or text (.txt), up to 10 MB.')
  const statusText: Record<DocumentStatus, string> = {
    pending: t('crm.assistant.documents.pending', 'Waiting'),
    processing: t('crm.assistant.documents.processing', 'Reading'),
    completed: t('crm.assistant.documents.completed', 'Read'),
    failed: t('crm.assistant.documents.failed', 'Could not be read'),
  }

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return send<KnowledgeDocument>('post', 'knowledge/documents', body)
    },
    onSuccess: doc => {
      knowledgeChanged(qc)
      say(doc.processing_status === 'failed'
        ? t('crm.assistant.documents.uploaded_failed', 'Uploaded, but the text could not be read. Try a PDF with selectable text.')
        : t('crm.assistant.documents.uploaded', 'Uploaded. The assistant can use it now.'), doc.processing_status === 'failed' ? 'danger' : 'success')
    },
    onError: error => say(uploadRefused(error) ? t('crm.assistant.documents.bad_type', 'This file cannot be read. Choose a PDF, a Word file (.docx) or a text file (.txt), up to 10 MB.') : errorText(t, error), 'danger'),
  })
  const reprocess = useMutation({
    mutationFn: (doc: KnowledgeDocument) => send<KnowledgeDocument>('post', `knowledge/documents/${doc.id}/reprocess`),
    onSuccess: () => { knowledgeChanged(qc); say(t('crm.assistant.documents.reread', 'Read again.')) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (doc: KnowledgeDocument) => send('delete', `knowledge/documents/${doc.id}`),
    onSuccess: () => { knowledgeChanged(qc); setDeleting(null); say(t('crm.assistant.knowledge.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const choose = (file: File | undefined) => {
    if (!file) return
    const problem = fileProblem(file)
    if (problem === 'type') say(t('crm.assistant.documents.bad_type', 'This file cannot be read. Choose a PDF, a Word file (.docx) or a text file (.txt), up to 10 MB.'), 'danger')
    else if (problem === 'size') say(t('crm.assistant.documents.too_big', 'This file is larger than 10 MB.'), 'danger')
    else upload.mutate(file)
  }

  const uploadButton = (small: boolean) => (
    <Button variant={small ? 'secondary' : 'primary'} size={small ? 'sm' : 'md'} onClick={() => input.current?.click()} loading={upload.isPending}>
      <Upload size={14} aria-hidden />{t('crm.assistant.documents.upload', 'Upload a document')}
    </Button>
  )

  return (
    <Card padded={false} title={t('crm.assistant.knowledge.documents', 'Documents')} icon={FileText} tone="neutral" description={t('crm.assistant.documents.line', 'Files the assistant reads.')}
      action={canManage && documents.length > 0 ? uploadButton(true) : undefined}>
      {canManage && (
        <input ref={input} type="file" accept={DOCUMENT_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden
          onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
      )}
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title={t('crm.assistant.documents.empty', 'No documents yet')}
          line={t('crm.assistant.documents.empty_line', 'A price list, a menu or your house rules: the assistant answers from what it reads.')}
          action={canManage ? uploadButton(false) : undefined} />
      ) : (
        <ul className="divide-y divide-a-border">
          {documents.map(doc => (
            <li key={doc.id} className="group px-4 py-3 transition-colors hover:bg-a-surface-2/60">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-a-surface-2 text-a-text-2"><FileText size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-a-text">{doc.file_name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-a-text-2">
                    <Pill tone={DOCUMENT_TONE[doc.processing_status] ?? 'neutral'}>{statusText[doc.processing_status] ?? doc.processing_status}</Pill>
                    {fileSize(doc.size_bytes, i18n.language) && <span>{fileSize(doc.size_bytes, i18n.language)}</span>}
                    {(doc.chunks_count ?? 0) > 0 && <span>{t('crm.assistant.documents.parts', '{{count}} parts', { count: doc.chunks_count ?? 0 })}</span>}
                    {doc.created_at && <span>{dateTime(doc.created_at, i18n.language, boot.venue.timezone)}</span>}
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-0.5">
                    {doc.processing_status !== 'completed' && (
                      <IconButton icon={RotateCcw} disabled={reprocess.isPending} label={t('crm.assistant.documents.read_again', 'Read {{name}} again', { name: doc.file_name })} onClick={() => reprocess.mutate(doc)} />
                    )}
                    <IconButton icon={Trash2} danger label={t('crm.assistant.documents.delete', 'Delete {{name}}', { name: doc.file_name })} onClick={() => setDeleting(doc)} />
                  </div>
                )}
              </div>
              {doc.extracted_text && (
                <details className="mt-2 pl-12">
                  <summary className="cursor-pointer text-xs font-medium text-a-accent-text">{t('crm.assistant.documents.preview', 'What the assistant read')}</summary>
                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-a-surface-2 p-3 text-xs text-a-text-2">
                    {doc.extracted_text.slice(0, 1500)}{doc.extracted_text.length > 1500 ? '…' : ''}
                  </p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-a-border px-4 py-2.5 text-xs text-a-text-2">{typesLine}</p>
      {deleting && (
        <Confirm title={t('crm.assistant.documents.delete_title', 'Delete {{name}}?', { name: deleting.file_name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {t('crm.assistant.documents.delete_line', 'The file is removed and the assistant stops answering from it.')}
        </Confirm>
      )}
    </Card>
  )
}
