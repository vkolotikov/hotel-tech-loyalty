import type { TFunction } from 'i18next'
import { dayLabel, duration } from '../lib/format'
import type { AssistantProposal } from '../lib/types'

/**
 * The AI assistant's page, decided in pure functions (2026-11-14): what is sent of the conversation, which questions
 * are offered to start, and how a proposed change reads. The server checks every change and names the planner call that
 * applies it; the page only words and sends it.
 */

/** The most messages sent with a turn, and the longest one (App\Services\Time\Assistant). */
export const HISTORY_MAX = 12
export const MESSAGE_MAX = 4000

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposals?: AssistantProposal[]
  /** What became of each proposal applied from here: done, or refused (the planner said no). */
  outcome?: Record<string, 'done' | 'failed'>
}

/** What a turn sends: the last messages, the person's first (a kept reply cannot open it), each cut to the limit. */
export function historyFor(messages: readonly ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const recent = messages.filter(m => m.content.trim() !== '').slice(-HISTORY_MAX)
  const start = recent.findIndex(m => m.role === 'user')
  return (start < 0 ? [] : recent.slice(start)).map(m => ({ role: m.role, content: m.content.trim().slice(0, MESSAGE_MAX) }))
}

export type SuggestionKey = 'plan_tomorrow_team' | 'fill_week' | 'best_at' | 'last_week' | 'longer_than_planned' | 'plan_my_day' | 'pool_for_me' | 'my_week'

/** The questions offered on an empty conversation: a manager's are about the team, anyone else's about their own work. */
export function suggestions(manager: boolean, planOthers: boolean, firstType: string | null): SuggestionKey[] {
  if (manager) return ['plan_tomorrow_team', 'fill_week', ...(firstType ? ['best_at' as const] : []), 'last_week', 'longer_than_planned']
  return [...(planOthers ? ['plan_tomorrow_team' as const] : ['plan_my_day' as const]), 'pool_for_me', 'my_week', 'longer_than_planned']
}

/** A proposal in the person's words. */
export function proposalText(t: TFunction, p: AssistantProposal, lang: string, units: { h: string; min: string }): string {
  const day = p.date ? dayLabel(p.date, lang) : null
  const at = p.start_time ? ` ${p.start_time}` : ''
  const who = p.person?.name ?? null
  switch (p.kind) {
    case 'create':
      return [
        t('time.assistant.proposal.create', 'Add “{{title}}”', { title: p.title }),
        who ? t('time.assistant.proposal.for', 'for {{name}}', { name: who }) : null,
        day ? `${t('time.assistant.proposal.on', 'on {{day}}', { day })}${at}` : t('time.assistant.proposal.no_day', 'without a day'),
        p.minutes ? `(${duration(p.minutes, units)})` : null,
      ].filter(Boolean).join(' ')
    case 'assign':
      return [
        t('time.assistant.proposal.assign', 'Give “{{title}}” to {{name}}', { title: p.title, name: who ?? '—' }),
        day ? `${t('time.assistant.proposal.on', 'on {{day}}', { day })}${at}` : null,
      ].filter(Boolean).join(' ')
    case 'move':
      return p.date === null
        ? t('time.assistant.proposal.to_backlog', 'Move “{{title}}” back to the backlog', { title: p.title })
        : `${t('time.assistant.proposal.move', 'Move “{{title}}” to {{day}}', { title: p.title, day: day ?? '—' })}${at}`
    case 'set_length':
      return t('time.assistant.proposal.length', 'Plan “{{title}}” for {{length}} (was {{was}})', {
        title: p.title, length: duration(p.minutes ?? 0, units), was: duration(p.was ?? 0, units),
      })
  }
}

/** The proposals of a message not yet applied (or refused) — what "Apply all" sends, in order. */
export function pending(message: ChatMessage): AssistantProposal[] {
  return (message.proposals ?? []).filter(p => !message.outcome?.[p.id])
}

/** A reply as paragraphs and bullet lists (the AI writes short lines and "- " items); no markup is ever rendered. */
export function blocks(text: string): ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] {
  const out: ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    if (item) {
      const last = out[out.length - 1]
      if (last && last.kind === 'ul') last.items.push(clean(item[1]))
      else out.push({ kind: 'ul', items: [clean(item[1])] })
    } else {
      out.push({ kind: 'p', text: clean(line.replace(/^#+\s*/, '')) })
    }
  }
  return out
}
