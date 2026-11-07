import { useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Mic, Paperclip, Send, Smile, Sparkles, Square, Undo2, X, Zap } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { crmApi, get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { CONTROL } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import {
  UPLOAD_ACCEPT, cannedReplies, checkUpload, draftInstruction, draftState, insertText, mergeMessages, messageBody,
  shouldPingTyping, withDraft,
} from './inboxLogic'
import { inboxKeys, useInboxRefresh } from './inboxQueries'
import type { ConversationDetail, ConvStatus, Message } from './types'
import { canDictate, useDictation } from './useDictation'
import { DICTATION_ERROR_DEFAULTS, UPLOAD_ERROR_DEFAULTS } from './words'

const EMOJIS = ['😊', '😀', '😂', '😍', '🙏', '👍', '👏', '🎉', '❤️', '🔥', '✨', '💯', '👋', '🤝', '☺️', '😎', '🙌', '💪', '🌟', '✅']

/**
 * The reply box: type or dictate a reply, add a canned reply, an emoji or a file, or let the AI draft one — the draft
 * lands in the box for the person to read, change and send; nothing is ever sent without them pressing Send.
 */
export function Composer({ conversationId, status, messages, aiOn, onTakeOver, takingOver }: {
  conversationId: number
  status: ConvStatus
  messages: Message[]
  aiOn: boolean
  onTakeOver: () => void
  takingOver: boolean
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const refresh = useInboxRefresh()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState<null | 'canned' | 'emoji'>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [drafted, setDrafted] = useState<{ previous: string | null } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const lastPing = useRef(0)

  const canned = useQuery({
    queryKey: inboxKeys.canned,
    queryFn: () => get<{ canned_responses?: unknown }>('chat-inbox-canned'),
    staleTime: 60_000,
    enabled: menu === 'canned',
  })

  const landed = (message: Message) => {
    qc.setQueryData<ConversationDetail>(inboxKeys.detail(conversationId), old => old && { ...old, messages: mergeMessages(old.messages, [message]) })
    refresh(conversationId)
  }

  const reply = useMutation({
    mutationFn: (body: { content: string }) => send<Message>('post', `chat-inbox/${conversationId}/messages`, body),
    onSuccess: message => { setText(''); setDrafted(null); landed(message); box.current?.focus() },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const upload = useMutation({
    mutationFn: (picked: File) => {
      const body = new FormData()
      body.append('file', picked)
      return send<Message>('post', `chat-inbox/${conversationId}/upload`, body)
    },
    onSuccess: message => { landed(message); toast(t('crm.inbox.file_sent', 'File sent')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const draft = useMutation({
    mutationFn: () => crmApi.draft(conversationId, draftInstruction(instruction)),
    onSuccess: answer => {
      const next = withDraft(text, String(answer?.draft ?? ''))
      if (!next.text) { toast(t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.'), 'danger'); return }
      setText(next.text)
      setDrafted({ previous: next.previous })
      setAiOpen(false)
      setInstruction('')
      box.current?.focus()
    },
  })

  const dictation = useDictation({
    onText: spoken => setText(current => insertText(current, spoken)),
    onFail: why => toast(t(`crm.inbox.dictation_error.${why}`, DICTATION_ERROR_DEFAULTS[why]), 'danger'),
  })

  const ai = draftState({ chatbot: boot.features.chatbot, aiStatus: boot.ai.status, status, messages })
  const body = messageBody(text)
  const submit = () => { if (body && !reply.isPending) reply.mutate(body) }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
  }
  const typed = (value: string) => {
    setText(value)
    const now = Date.now()
    if (value.trim() && shouldPingTyping(lastPing.current, now)) {
      lastPing.current = now
      send('post', `chat-inbox/${conversationId}/typing`, { typing: true }).catch(() => { /* the indicator is a nicety */ })
    }
  }
  const pickFile = (picked: File | undefined) => {
    if (file.current) file.current.value = ''
    if (!picked) return
    const problem = checkUpload(picked)
    if (problem) { toast(t(`crm.inbox.upload_error.${problem}`, UPLOAD_ERROR_DEFAULTS[problem]), 'danger'); return }
    upload.mutate(picked)
  }
  const tool = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50'

  return (
    <div className="relative border-t border-a-border bg-a-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      {aiOn && boot.features.chatbot && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl crm-ai-soft px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{t('crm.inbox.ai_on_line', 'The assistant answers this chat. Take it over so it stops while you reply.')}</span>
          <button type="button" onClick={onTakeOver} disabled={takingOver} className="shrink-0 rounded-full crm-ai-fill px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
            {t('crm.inbox.take_over', 'Take over')}
          </button>
        </div>
      )}

      {aiOpen && ai.show && (
        <form className="mb-2 rounded-xl border crm-ai-border crm-ai-soft p-2.5" onSubmit={e => { e.preventDefault(); if (!ai.blocked) draft.mutate() }}>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={16} aria-hidden className="shrink-0" />
            <label className="min-w-0 flex-1 basis-48">
              <span className="sr-only">{t('crm.inbox.draft_instruction', 'What the reply should do (optional)')}</span>
              <input value={instruction} maxLength={300} onChange={e => setInstruction(e.target.value)} disabled={draft.isPending}
                placeholder={t('crm.inbox.draft_placeholder', 'Optional: shorter, offer Friday…')} className={CONTROL} />
            </label>
            <button type="submit" disabled={draft.isPending || ai.blocked !== null}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full crm-ai-fill px-3.5 py-2 text-sm font-semibold disabled:opacity-60">
              {draft.isPending ? <Loader2 size={15} aria-hidden className="animate-spin" /> : <Sparkles size={15} aria-hidden />}
              {draft.isPending ? t('crm.inbox.drafting', 'Writing…') : t('crm.inbox.draft_go', 'Write the draft')}
            </button>
            <button type="button" onClick={() => setAiOpen(false)} aria-label={t('crm.common.close', 'Close')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-a-surface"><X size={16} aria-hidden /></button>
          </div>
          {ai.blocked && <p className="mt-2 text-sm">{t(`crm.errors.${ai.blocked}`, ai.blocked === 'nothing_to_answer' ? 'The visitor has not written anything to answer yet.' : "This month's AI allowance is used up. Drafts are back next month, or with a larger package.")}</p>}
          {draft.isError && <p role="alert" className="mt-2 text-sm text-a-danger">{errorText(t, draft.error)}</p>}
          <p className="mt-1.5 text-xs">{t('crm.inbox.draft_note', 'The draft goes into the box. Nothing is sent until you press Send.')}</p>
        </form>
      )}

      {drafted && text.trim() && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs crm-ai-text">
          <Sparkles size={13} aria-hidden />
          <span className="min-w-0 flex-1">{t('crm.inbox.drafted', 'Drafted by AI. Read it and change it before you send.')}</span>
          {drafted.previous !== null && (
            <button type="button" onClick={() => { setText(drafted.previous ?? ''); setDrafted(null) }} className="inline-flex items-center gap-1 rounded-sm font-medium hover:underline">
              <Undo2 size={13} aria-hidden />{t('crm.inbox.draft_undo', 'Bring back what I wrote')}
            </button>
          )}
        </div>
      )}

      {menu && (
        <>
          <button type="button" tabIndex={-1} aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} />
          <div role="menu" aria-label={menu === 'canned' ? t('crm.inbox.canned', 'Canned replies') : t('crm.inbox.emoji', 'Emoji')}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); box.current?.focus() } }}
            className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-1.5 shadow-a-lg animate-a-pop sm:right-auto sm:w-80">
            {menu === 'emoji'
              ? (
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJIS.map(emoji => (
                    <button key={emoji} type="button" role="menuitem" onClick={() => { setText(current => current + emoji); setMenu(null); box.current?.focus() }}
                      className="grid h-9 place-items-center rounded-lg text-lg hover:bg-a-surface-2">{emoji}</button>
                  ))}
                </div>
              )
              : canned.isLoading
                ? <p className="p-3 text-sm text-a-text-2">{t('crm.common.loading', 'Loading…')}</p>
                : canned.isError
                  ? <p className="p-3 text-sm text-a-danger">{errorText(t, canned.error)}</p>
                  : cannedReplies(canned.data).length === 0
                    ? <p className="p-3 text-sm text-a-text-2">{t('crm.inbox.no_canned', 'No canned replies yet. A manager adds them in Settings.')}</p>
                    : cannedReplies(canned.data).map((c, i) => (
                      <button key={i} type="button" role="menuitem" onClick={() => { setText(current => insertText(current, c.text)); setMenu(null); box.current?.focus() }}
                        className="block w-full rounded-xl px-3 py-2 text-left hover:bg-a-surface-2">
                        <span className="block truncate text-sm font-medium text-a-text">{c.label}</span>
                        <span className="block truncate text-xs text-a-text-2">{c.text}</span>
                      </button>
                    ))}
          </div>
        </>
      )}

      <div className="rounded-2xl border border-a-border bg-a-surface shadow-a-sm transition-colors focus-within:border-a-accent focus-within:ring-2 focus-within:ring-a-accent/25">
        <label className="block">
          <span className="sr-only">{t('crm.inbox.reply', 'Your reply')}</span>
          <textarea ref={box} value={text} rows={2} maxLength={5000} onChange={e => typed(e.target.value)} onKeyDown={onKey}
            placeholder={dictation.state === 'recording' ? t('crm.inbox.listening', 'Listening… press stop when you are done')
              : dictation.state === 'transcribing' ? t('crm.inbox.transcribing', 'Turning your words into text…')
              : t('crm.inbox.reply_placeholder', 'Write a reply. Enter sends, Shift+Enter starts a new line.')}
            className="block max-h-48 min-h-16 w-full resize-y rounded-t-2xl bg-transparent px-3.5 pb-2 pt-3 text-sm text-a-text placeholder:text-a-text-2 focus:outline-hidden" />
        </label>

        <div role="group" aria-label={t('crm.inbox.tools', 'Reply tools')} className="flex items-center gap-1 border-t border-a-border px-1.5 py-1.5">
          <button type="button" className={tool} aria-label={t('crm.inbox.canned', 'Canned replies')} title={t('crm.inbox.canned', 'Canned replies')}
            aria-expanded={menu === 'canned'} aria-haspopup="menu" onClick={() => setMenu(m => (m === 'canned' ? null : 'canned'))}><Zap size={17} aria-hidden /></button>
          <button type="button" className={tool} aria-label={t('crm.inbox.emoji', 'Emoji')} title={t('crm.inbox.emoji', 'Emoji')}
            aria-expanded={menu === 'emoji'} aria-haspopup="menu" onClick={() => setMenu(m => (m === 'emoji' ? null : 'emoji'))}><Smile size={17} aria-hidden /></button>
          <input ref={file} type="file" accept={UPLOAD_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={e => pickFile(e.target.files?.[0])} />
          <button type="button" className={tool} aria-label={t('crm.inbox.attach', 'Send a file')} title={t('crm.inbox.attach', 'Send a file')}
            disabled={upload.isPending} onClick={() => file.current?.click()}>
            {upload.isPending ? <Loader2 size={17} aria-hidden className="animate-spin" /> : <Paperclip size={17} aria-hidden />}
          </button>
          {canDictate() && (
            <button type="button" onClick={dictation.toggle} disabled={dictation.state === 'transcribing'} aria-pressed={dictation.state === 'recording'}
              aria-label={dictation.state === 'recording' ? t('crm.inbox.mic_stop', 'Stop recording') : t('crm.inbox.mic', 'Dictate the reply')}
              title={dictation.state === 'recording' ? t('crm.inbox.mic_stop', 'Stop recording') : t('crm.inbox.mic', 'Dictate the reply')}
              className={`${tool} ${dictation.state === 'recording' ? 'bg-a-danger/12 text-a-danger' : ''}`}>
              {dictation.state === 'recording' ? <Square size={16} aria-hidden /> : dictation.state === 'transcribing' ? <Loader2 size={17} aria-hidden className="animate-spin" /> : <Mic size={17} aria-hidden />}
            </button>
          )}
          <span className="min-w-0 flex-1" />
          {ai.show && (
            <button type="button" onClick={() => { draft.reset(); setAiOpen(open => !open) }} aria-expanded={aiOpen} title={t('crm.inbox.draft', 'Draft a reply with AI')}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border crm-ai-border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent ${aiOpen ? 'crm-ai-fill' : 'crm-ai-soft'}`}>
              <Sparkles size={15} aria-hidden /><span className="sr-only sm:not-sr-only">{t('crm.inbox.draft', 'Draft a reply with AI')}</span>
            </button>
          )}
          <Button onClick={submit} disabled={!body} loading={reply.isPending} aria-label={t('crm.inbox.send', 'Send')} className="min-h-10 shrink-0">
            {!reply.isPending && <Send size={16} aria-hidden />}<span className="hidden sm:inline">{t('crm.inbox.send', 'Send')}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
