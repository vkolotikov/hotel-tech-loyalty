import { useState } from 'react'
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GraduationCap, Lightbulb, MessageSquare, Quote, Send, ThumbsDown } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
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
import { AiButton, CharCount, ReadOnlyNote, SectionIntro } from './parts'
import { GAPS_KEY, knowledgeChanged } from './queries'
import { CORRECTION_MAX, correctionValid, sortGaps, startingAnswer, teachMode, teachOutcome, teachPayload } from './teach'

/**
 * Answers to fix (new in HexaTech CRM): the answers somebody rated wrong in the inbox that nobody has taught yet
 * (crm/bot-gaps), each with the visitor's question beside the fix. A manager writes the right answer — prefilled with a
 * staff member's suggestion when there is one — and it is saved through the inbox's own feedback endpoint, which adds
 * it to the knowledge; the answer then leaves the list. A staff member sees the list, opens the conversation, and may
 * suggest the right answer for a manager to check (round 2: the server keeps it, teaches nothing).
 */
export function TeachTab({ gaps, canManage }: { gaps: UseQueryResult<BotGap[]>; canManage: boolean }) {
  const { t } = useTranslation()
  const list = sortGaps(gaps.data ?? [])
  return (
    <QueryState loading={gaps.isLoading} error={gaps.error} onRetry={() => { void gaps.refetch() }}>
      <div className="space-y-4">
        <SectionIntro line={canManage
          ? t('crm.assistant.teach.line', 'Answers your team rated wrong in the inbox. Write the right one and the assistant uses it from now on.')
          : t('crm.assistant.teach.line_staff', 'Answers your team rated wrong in the inbox, waiting for a manager to write the right one.')}
          action={list.length > 0 ? <Pill tone="danger">{t('crm.assistant.teach.waiting', '{{count}} to fix', { count: list.length })}</Pill> : undefined} />
        {!canManage && (
          <ReadOnlyNote>{t('crm.assistant.teach.staff_note', 'A manager writes the right answer. You can suggest one here; a manager checks it before the assistant uses it.')}</ReadOnlyNote>
        )}
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={GraduationCap} title={t('crm.assistant.teach.empty', 'Nothing to fix')}
              line={t('crm.assistant.teach.empty_line', 'When someone marks an answer of the assistant as wrong in the inbox, it shows here to be corrected.')} />
          </Card>
        ) : (
          <ul className="space-y-4">
            {list.map(gap => <li key={`${gap.message_id}-${gap.suggested_answer ?? ''}`}><GapCard gap={gap} canManage={canManage} /></li>)}
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
  const mode = teachMode(gap, canManage)
  const [answer, setAnswer] = useState(() => (mode === 'teach' ? startingAnswer(gap) : ''))
  const teach = useMutation({
    mutationFn: () => send<unknown>('post', `chat-inbox/messages/${gap.message_id}/feedback`, teachPayload(gap, answer, boot.staff.id)),
    onSuccess: response => {
      void qc.invalidateQueries({ queryKey: GAPS_KEY })
      const outcome = teachOutcome(response)
      if (outcome === 'taught') {
        knowledgeChanged(qc)
        say(t('crm.assistant.teach.taught', 'Thank you. The assistant uses this answer from now on.'))
      } else if (outcome === 'suggested') {
        setAnswer('')
        say(t('crm.assistant.teach.suggested', 'Thank you. A manager will check your suggestion.'))
      } else {
        say(t('crm.assistant.teach.kept', 'Saved, but nothing was taught. Open the conversation to see why.'))
      }
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-a-border px-4 py-2.5 text-xs text-a-text-2">
        <Pill tone="danger"><ThumbsDown size={12} aria-hidden />{gap.ratings > 1
          ? t('crm.assistant.teach.rated_many', 'Rated wrong by {{count}} people', { count: gap.ratings })
          : t('crm.assistant.teach.rated_one', 'Rated wrong')}</Pill>
        {gap.rated_by && <span>{t('crm.assistant.teach.by', 'by {{name}}', { name: gap.rated_by })}</span>}
        {gap.rated_at && <span>· {timeAgo(gap.rated_at, i18n.language)}</span>}
        <Link to={conversationPath(gap.conversation_id)} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-medium text-a-accent-text hover:bg-a-accent/10 focus-visible:outline-2 focus-visible:outline-a-accent">
          <MessageSquare size={13} aria-hidden />{t('crm.assistant.teach.open_chat', 'Open the conversation')}
        </Link>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="max-w-[92%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm crm-bubble-visitor">
            <span className="block text-xs font-medium text-a-text-2">{gap.visitor ?? t('crm.common.visitor', 'Visitor')}</span>
            <span className="whitespace-pre-line">{gap.question ?? t('crm.assistant.teach.no_question', 'No question was found before this answer.')}</span>
          </div>
          <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm crm-bubble-ai">
            <span className="block text-xs font-medium crm-ai-text">{t('crm.assistant.teach.the_answer', 'The assistant answered')}</span>
            <span className="whitespace-pre-line">{gap.answer}</span>
          </div>
          {gap.comment && (
            <p className="flex gap-2 rounded-xl border border-a-border px-3 py-2 text-sm text-a-text-2">
              <Quote size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span><span className="font-medium text-a-text">{t('crm.assistant.teach.comment', 'Comment:')}</span> {gap.comment}</span>
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {gap.suggested_answer && (
            <div className="rounded-xl border border-a-accent/30 bg-a-accent/8 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-a-accent-text">
                <Lightbulb size={13} aria-hidden />
                {gap.suggested_by ? t('crm.assistant.teach.suggested_by', 'Suggested by {{name}}', { name: gap.suggested_by }) : t('crm.assistant.teach.suggested_anon', 'A suggested answer')}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-a-text">{gap.suggested_answer}</p>
            </div>
          )}
          {mode === 'none' && (
            <Notice>{t('crm.assistant.teach.not_teachable', 'This answer was not given to a question, so there is nothing to teach here. Open the conversation to see what happened.')}</Notice>
          )}
          {mode === 'teach' && (
            <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (correctionValid(answer)) teach.mutate() }}>
              <Field label={t('crm.assistant.teach.right', 'The right answer')}
                hint={gap.suggested_answer ? t('crm.assistant.teach.prefilled', 'Filled in with the suggestion. Check it before you teach it.') : undefined}>
                <TextArea rows={4} value={answer} onChange={e => setAnswer(e.target.value)} />
              </Field>
              <CharCount value={answer} max={CORRECTION_MAX} />
              <div className="flex justify-end">
                <AiButton fill type="submit" disabled={!correctionValid(answer) || teach.isPending}>
                  <GraduationCap size={15} aria-hidden />{teach.isPending ? t('crm.assistant.teach.teaching', 'Saving…') : t('crm.assistant.teach.teach', 'Teach the assistant')}
                </AiButton>
              </div>
            </form>
          )}
          {mode === 'suggest' && (
            <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (correctionValid(answer)) teach.mutate() }}>
              <Field label={t('crm.assistant.teach.suggest', 'Suggest the right answer')} hint={t('crm.assistant.teach.suggest_hint', 'A manager checks it before the assistant uses it.')}>
                <TextArea rows={3} value={answer} onChange={e => setAnswer(e.target.value)} />
              </Field>
              <CharCount value={answer} max={CORRECTION_MAX} />
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" disabled={!correctionValid(answer)} loading={teach.isPending}>
                  <Send size={14} aria-hidden />{t('crm.assistant.teach.send_suggestion', 'Send the suggestion')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Card>
  )
}
