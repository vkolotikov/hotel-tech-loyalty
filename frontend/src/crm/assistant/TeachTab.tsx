import { useState } from 'react'
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GraduationCap, MessageSquare, ThumbsDown } from 'lucide-react'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { conversationPath } from '../lib/links'
import type { BotGap } from '../lib/types'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { TextArea } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { CharCount, ReadOnlyNote } from './parts'
import { GAPS_KEY, knowledgeChanged } from './queries'
import { CORRECTION_MAX, canTeach, correctionValid, sortGaps, teachPayload } from './teach'

/**
 * Teach the assistant (new in HexaTech CRM): the answers somebody rated wrong in the inbox that nobody has corrected
 * yet (crm/bot-gaps). A manager writes the right answer; it is saved through the inbox's own feedback endpoint, which
 * adds it to the knowledge as an "AI Corrections" answer for the visitor's question, and the answer leaves the list.
 */
export function TeachTab({ gaps, canManage }: { gaps: UseQueryResult<BotGap[]>; canManage: boolean }) {
  const { t } = useTranslation()
  const list = sortGaps(gaps.data ?? [])
  return (
    <QueryState loading={gaps.isLoading} error={gaps.error} onRetry={() => { void gaps.refetch() }}>
      <div className="space-y-4">
        <p className="text-sm text-a-text-2">{t('crm.assistant.teach.line', 'Answers your team rated wrong in the inbox. Write the right one and the assistant uses it from now on.')}</p>
        {!canManage && <ReadOnlyNote />}
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={GraduationCap} title={t('crm.assistant.teach.empty', 'Nothing to fix')}
              line={t('crm.assistant.teach.empty_line', 'When someone marks an answer of the assistant as wrong in the inbox, it shows here to be corrected.')} />
          </Card>
        ) : (
          <ul className="space-y-3">
            {list.map(gap => <li key={gap.message_id}><GapCard gap={gap} canManage={canManage} /></li>)}
          </ul>
        )}
      </div>
    </QueryState>
  )
}

function GapCard({ gap, canManage }: { gap: BotGap; canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const [answer, setAnswer] = useState('')
  const teach = useMutation({
    mutationFn: () => send('post', `chat-inbox/messages/${gap.message_id}/feedback`, teachPayload(gap, answer, boot.staff.name)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GAPS_KEY })
      knowledgeChanged(qc)
      say(t('crm.assistant.teach.taught', 'Thank you. The assistant uses this answer from now on.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-a-text-2">
          <Pill tone="danger"><ThumbsDown size={12} aria-hidden />{gap.ratings > 1
            ? t('crm.assistant.teach.rated_many', 'Rated wrong by {{count}} people', { count: gap.ratings })
            : t('crm.assistant.teach.rated_one', 'Rated wrong')}</Pill>
          {gap.rated_by && <span>{t('crm.assistant.teach.by', 'by {{name}}', { name: gap.rated_by })}</span>}
          {gap.rated_at && <span>{timeAgo(gap.rated_at, i18n.language)}</span>}
          <Link to={conversationPath(gap.conversation_id)} className="ml-auto inline-flex items-center gap-1 font-medium text-a-accent-text hover:underline">
            <MessageSquare size={13} aria-hidden />{t('crm.assistant.teach.open_chat', 'Open the conversation')}
          </Link>
        </div>

        <div className="space-y-2">
          <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm crm-bubble-visitor">
            <span className="block text-xs font-medium text-a-text-2">{gap.visitor ?? t('crm.common.visitor', 'Visitor')}</span>
            <span className="whitespace-pre-line">{gap.question ?? t('crm.assistant.teach.no_question', 'No question was found before this answer.')}</span>
          </div>
          <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm crm-bubble-ai">
            <span className="block text-xs font-medium crm-ai-text">{t('crm.assistant.teach.the_answer', 'The assistant answered')}</span>
            <span className="whitespace-pre-line">{gap.answer}</span>
          </div>
          {gap.comment && (
            <p className="text-sm text-a-text-2"><span className="font-medium text-a-text">{t('crm.assistant.teach.comment', 'Comment:')}</span> {gap.comment}</p>
          )}
        </div>

        {!gap.teachable ? (
          <Notice>{t('crm.assistant.teach.not_teachable', 'This answer was not given to a question, so there is nothing to teach here. Open the conversation to see what happened.')}</Notice>
        ) : canTeach(gap, canManage) ? (
          <div className="space-y-2">
            <Field label={t('crm.assistant.teach.right', 'The right answer')}>
              <TextArea rows={3} value={answer} onChange={e => setAnswer(e.target.value)} />
            </Field>
            <CharCount value={answer} max={CORRECTION_MAX} />
            <div className="flex justify-end">
              <button type="button" onClick={() => teach.mutate()} disabled={!correctionValid(answer) || teach.isPending}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold crm-ai-fill disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent">
                <GraduationCap size={15} aria-hidden />{teach.isPending ? t('crm.assistant.teach.teaching', 'Saving…') : t('crm.assistant.teach.teach', 'Teach the assistant')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
