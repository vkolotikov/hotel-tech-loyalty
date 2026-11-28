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
  /** What the answer looked at in the planner (the server's tool names), shown under it. */
  used?: string[]
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

export type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

/** A reply as paragraphs and bullet lists (the AI writes short lines and "- " items); no markup is ever rendered. */
export function blocks(text: string): Block[] {
  const out: Block[] = []
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

/* ─── An answer that writes itself (2026-11-28) ─────────────────────── */

/** How many characters a reply's blocks hold: what the reveal counts through. */
export function blocksLength(list: readonly Block[]): number {
  return list.reduce((sum, b) => sum + (b.kind === 'p' ? b.text.length : b.items.reduce((n, item) => n + item.length, 0)), 0)
}

/**
 * The first `chars` characters of a reply, as blocks: whole blocks while they fit, then the one being written cut where
 * the count ends, nothing after it. The reply is read as blocks first and cut after, so a half-written line never shows
 * its markup.
 */
export function cutBlocks(list: readonly Block[], chars: number): Block[] {
  const out: Block[] = []
  let left = Math.max(0, chars)
  for (const block of list) {
    if (left <= 0) break
    if (block.kind === 'p') {
      out.push({ kind: 'p', text: block.text.slice(0, left) })
      left -= block.text.length
      continue
    }
    const items: string[] = []
    for (const item of block.items) {
      if (left <= 0) break
      items.push(item.slice(0, left))
      left -= item.length
    }
    out.push({ kind: 'ul', items })
  }
  return out
}

/** What an answer can have looked at, as the server names its tools, in the order they are shown. */
export const SOURCES = ['get_day', 'get_week', 'get_pool', 'get_people', 'get_learning', 'get_insights', 'find_tasks'] as const
export type SourceKey = (typeof SOURCES)[number]

/** The sources under an answer: the ones the page has words for, each once, in the shown order. */
export function sourcesOf(used: readonly string[] | undefined): SourceKey[] {
  return SOURCES.filter(source => (used ?? []).includes(source))
}

export type FollowUpKey = 'why' | 'other' | 'plan_it'

/** What is offered under the latest answer: about its changes when it proposed some, else to turn it into changes. */
export function followUps(message: Pick<ChatMessage, 'role' | 'proposals'>): FollowUpKey[] {
  if (message.role !== 'assistant') return []
  return (message.proposals?.length ?? 0) > 0 ? ['why', 'other'] : ['plan_it']
}

/** Where an applied change is seen: its day on the planner; nowhere for a change without a day. */
export function dayLink(p: Pick<AssistantProposal, 'date'>): string | null {
  return p.date ? `/time/plan?date=${p.date}` : null
}

/** A question handed over in the address (`?q=`, from Find): trimmed, cut to the limit, null when there is none. */
export function questionOf(search: URLSearchParams): string | null {
  const q = (search.get('q') ?? '').trim().slice(0, MESSAGE_MAX)
  return q.length >= 2 ? q : null
}

/** How far an "apply all" has got, for the button: `[done, of]` while it runs, null when nothing is being applied. */
export function applyProgress(applying: { ids: readonly string[]; at: string | null } | null): [number, number] | null {
  if (!applying) return null
  const index = applying.at === null ? 0 : applying.ids.indexOf(applying.at)
  return [Math.max(0, index), applying.ids.length]
}
