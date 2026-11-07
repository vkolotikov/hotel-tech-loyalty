import { describe, expect, it } from 'vitest'
import type { BotGap } from '../lib/types'
import { behaviourForm, behaviourPayload, behaviourProblems, behaviourValid, sameBehaviour } from './behaviour'
import { categoryPayload, categoryValid, fileProblem, filterItems, importPayload, itemForm, itemPayload, itemProblems, pickedDrafts, reviewDrafts, sourceUsable } from './knowledge'
import { addText, mergeTexts, moveItem, pickTab, removeAt, wholeNumber, ASSISTANT_TABS } from './lists'
import { activeRules, missingFacts, quickSetupPayload, quickSetupProblems, toggleRule } from './onboarding'
import { popupForm, popupPayload, popupProblems, triggerTakesValue } from './popups'
import { afterReply, canTeach, correctionValid, sortGaps, teachPayload, testChatPayload } from './teach'
import type { KnowledgeItem, OnboardingState, PopupRule } from './types'

describe('the assistant\'s sections in ?tab=', () => {
  it('knows the tabs Get started links to, and falls back to Behaviour', () => {
    expect(pickTab('knowledge', ASSISTANT_TABS, 'behaviour')).toBe('knowledge')
    expect(pickTab('teach', ASSISTANT_TABS, 'behaviour')).toBe('teach')
    expect(pickTab('nonsense', ASSISTANT_TABS, 'behaviour')).toBe('behaviour')
    expect(pickTab(null, ASSISTANT_TABS, 'behaviour')).toBe('behaviour')
  })
})

describe('list helpers', () => {
  it('moves an item one place and leaves the ends alone', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
  })

  it('adds a short text once, trimmed and cut, and merges suggestions without repeats', () => {
    expect(addText(['Parking'], '  parking ', 50)).toEqual(['Parking'])
    expect(addText(['Parking'], '  ', 50)).toEqual(['Parking'])
    expect(addText([], 'x'.repeat(60), 50)).toEqual(['x'.repeat(50)])
    expect(mergeTexts(['wifi'], ['WiFi', 'breakfast', 'breakfast'], 50)).toEqual(['wifi', 'breakfast'])
  })

  it('reads a typed whole number within its bounds', () => {
    expect(wholeNumber('12', 0, 100, 0)).toBe(12)
    expect(wholeNumber('-3', 0, 100, 0)).toBe(0)
    expect(wholeNumber('abc', 0, 100, 7)).toBe(7)
  })
})

describe('the behaviour form (chatbot-config/behavior)', () => {
  const template = { assistant_name: 'Hotel Assistant', identity: null, goal: null, sales_style: 'consultative', tone: 'professional', reply_length: 'moderate', language: 'en', core_rules: null, escalation_policy: null, fallback_message: null, custom_instructions: null, is_active: true } as const

  it('starts from the server\'s template and finds no change in it', () => {
    const form = behaviourForm(template)
    expect(form.assistant_name).toBe('Hotel Assistant')
    expect(form.core_rules).toEqual([])
    expect(sameBehaviour(form, behaviourForm(template))).toBe(true)
    expect(sameBehaviour({ ...form, goal: '  ' }, form)).toBe(true)
    expect(sameBehaviour({ ...form, tone: 'friendly' }, form)).toBe(false)
  })

  it('falls back to the defaults for a value the server would not take', () => {
    const form = behaviourForm({ ...template, tone: 'shouty' as never, reply_length: null })
    expect(form.tone).toBe('professional')
    expect(form.reply_length).toBe('moderate')
  })

  it('sends only the validated fields, empty texts as null and no blank rules', () => {
    const body = behaviourPayload({ ...behaviourForm(template), goal: '  Get the booking ', core_rules: ['Be kind', '  ', ' No prices '] })
    expect(Object.keys(body).sort()).toEqual(['assistant_name', 'core_rules', 'custom_instructions', 'escalation_policy', 'fallback_message', 'goal', 'identity', 'is_active', 'language', 'reply_length', 'sales_style', 'tone'])
    expect(body.goal).toBe('Get the booking')
    expect(body.identity).toBeNull()
    expect(body.core_rules).toEqual(['Be kind', 'No prices'])
  })

  it('names what is longer than the controller takes', () => {
    const form = { ...behaviourForm(template), goal: 'x'.repeat(1001), core_rules: ['ok', 'y'.repeat(501)] }
    expect(behaviourProblems(form)).toEqual({ fields: ['goal'], rules: [1] })
    expect(behaviourValid(form)).toBe(false)
    expect(behaviourValid(behaviourForm(template))).toBe(true)
  })
})

describe('the quick setup (chatbot-onboarding)', () => {
  const state: OnboardingState = {
    completed: false, industry: 'hotel', widget_key: 'k',
    preset: { assistant_name: 'Concierge', tone: 'friendly', goal: '', core_rules: ['Rule A', 'Rule B', 'Rule C'], escalation_policy: '', fallback_message: '', welcome_title: '', welcome_subtitle: '', suggestions: [] },
    facts: { address: { label: 'Address', placeholder: '', required: true }, checkin: { label: 'Check-in', placeholder: '15:00', required: true }, parking: { label: 'Parking', placeholder: '', required: false } },
    prefill: { company_name: 'Hotel Riga', address: 'Brivibas 1' },
  }

  it('uses the preset and what the server knows until something is typed', () => {
    const answers = { facts: {}, handoff_whatsapp: '', handoff_email: '' }
    expect(missingFacts(state, answers)).toEqual(['checkin'])
    expect(activeRules(state, answers)).toEqual(['Rule A', 'Rule B', 'Rule C'])
    const body = quickSetupPayload(state, answers, 'Europe/Riga')
    expect(body).toMatchObject({ company_name: 'Hotel Riga', assistant_name: 'Concierge', tone: 'friendly', timezone: 'Europe/Riga', core_rules: ['Rule A', 'Rule B', 'Rule C'] })
    expect(body.facts).toEqual({ address: 'Brivibas 1', checkin: '', parking: '' })
  })

  it('unticks a rule and keeps the preset\'s order when it is ticked again', () => {
    const off = toggleRule(state, { facts: {}, handoff_whatsapp: '', handoff_email: '' }, 'Rule A')
    expect(off).toEqual(['Rule B', 'Rule C'])
    expect(toggleRule(state, { facts: {}, rules: off, handoff_whatsapp: '', handoff_email: '' }, 'Rule A')).toEqual(['Rule A', 'Rule B', 'Rule C'])
  })

  it('refuses a WhatsApp number or an email of the wrong shape, as the controller does', () => {
    expect(quickSetupProblems({ facts: {}, handoff_whatsapp: '+44 20 7123 4567', handoff_email: 'team@example.com' })).toEqual([])
    expect(quickSetupProblems({ facts: {}, handoff_whatsapp: 'call me', handoff_email: 'nope' })).toEqual(['handoff_whatsapp', 'handoff_email'])
  })
})

describe('knowledge', () => {
  const item = (id: number, question: string, answer: string, category_id: number | null, keywords: string[] = []): KnowledgeItem => ({ id, question, answer, category_id, keywords, priority: 0, use_count: 0, is_active: true })
  const items = [item(1, 'What time is check-in?', 'From 15:00.', 2, ['arrival']), item(2, 'Is there parking?', 'Yes, 20 € a night.', null), item(3, 'Breakfast hours', '7 to 10.', 2)]

  it('filters by every word of the search, in the question, the answer or a keyword, and by category', () => {
    expect(filterItems(items, '', null).map(i => i.id)).toEqual([1, 2, 3])
    expect(filterItems(items, 'ARRIVAL', null).map(i => i.id)).toEqual([1])
    expect(filterItems(items, 'parking night', null).map(i => i.id)).toEqual([2])
    expect(filterItems(items, '', 2).map(i => i.id)).toEqual([1, 3])
    expect(filterItems(items, '', 'none').map(i => i.id)).toEqual([2])
  })

  it('asks for a question and an answer, and sends keywords as the server takes them', () => {
    expect(itemProblems(itemForm(null))).toEqual(['question_required', 'answer_required'])
    const body = itemPayload({ ...itemForm(null), question: ' Pets? ', answer: ' Yes. ', keywords: ['dog', 'x'.repeat(60)], priority: '5' })
    expect(body).toEqual({ question: 'Pets?', answer: 'Yes.', category_id: null, keywords: ['dog', 'x'.repeat(50)], priority: 5, is_active: true })
  })

  it('checks a category\'s name and length', () => {
    expect(categoryValid({ name: ' ', description: '', priority: '0', is_active: true })).toBe(false)
    expect(categoryPayload({ name: ' Prices ', description: '', priority: '3', is_active: false })).toEqual({ name: 'Prices', description: null, priority: 3, is_active: false })
  })

  it('refuses a file of another type or over 10 MB before it is sent', () => {
    expect(fileProblem({ name: 'prices.PDF', size: 1000 })).toBeNull()
    expect(fileProblem({ name: 'photo.png', size: 1000 })).toBe('type')
    expect(fileProblem({ name: 'big.docx', size: 11 * 1024 * 1024 })).toBe('size')
  })

  it('reviews the AI\'s drafts and imports only the ticked, complete ones (at most 50)', () => {
    const drafts = reviewDrafts([{ question: 'Q1', answer: 'A1', keywords: ['k'] }, { question: 'Q2', answer: ' ' }, { answer: 'no question' } as never])
    expect(drafts).toHaveLength(2)
    expect(pickedDrafts(drafts)).toEqual([{ question: 'Q1', answer: 'A1', keywords: ['k'] }])
    expect(importPayload([{ ...drafts[0], picked: false }], 4)).toEqual({ category_id: 4, items: [] })
    expect(pickedDrafts(Array.from({ length: 60 }, (_, i) => ({ question: `Q${i}`, answer: 'A', keywords: [], picked: true })))).toHaveLength(50)
  })

  it('drafts only from a text of 50 to 20 000 characters', () => {
    expect(sourceUsable('short')).toBe(false)
    expect(sourceUsable('x'.repeat(50))).toBe(true)
    expect(sourceUsable('x'.repeat(20001))).toBe(false)
  })
})

describe('pop-up rules', () => {
  const rule: PopupRule = { id: 1, name: 'Prices', is_active: true, trigger_type: 'scroll_depth', trigger_value: '60', url_match_type: 'contains', url_match_value: '/prices', visitor_type: 'new', language_targets: ['en'], message: 'Hi', quick_replies: ['See prices'], priority: 2, impressions_count: 10, clicks_count: 1 }

  it('reads a rule back and sends it without its language targets (left as they are)', () => {
    const body = popupPayload(popupForm(rule))
    expect(body).toEqual({ name: 'Prices', is_active: true, trigger_type: 'scroll_depth', trigger_value: '60', url_match_type: 'contains', url_match_value: '/prices', visitor_type: 'new', message: 'Hi', quick_replies: ['See prices'], priority: 2 })
    expect(body).not.toHaveProperty('language_targets')
  })

  it('sends no value for a trigger that takes none', () => {
    expect(triggerTakesValue('exit_intent')).toBe(false)
    expect(popupPayload({ ...popupForm(rule), trigger_type: 'exit_intent' }).trigger_value).toBeNull()
  })

  it('asks for a name, a message and a number in range', () => {
    expect(popupProblems({ ...popupForm(null), trigger_value: '' })).toEqual(['name', 'message', 'value'])
    expect(popupProblems({ ...popupForm(rule), trigger_value: '120' })).toEqual(['value'])
    expect(popupProblems(popupForm(rule))).toEqual([])
  })
})

describe('teaching the assistant (crm/bot-gaps, chat-inbox feedback)', () => {
  const gap: BotGap = { message_id: 9, conversation_id: 3, visitor: 'Ada', question: 'Do you take dogs?', answer: 'No.', comment: 'We do, 15 € a night', rated_by: 'Maria', rated_at: '2026-11-06T10:00:00+00:00', ratings: 1, teachable: true }

  it('teaches only a teachable answer, and only a manager', () => {
    expect(canTeach(gap, true)).toBe(true)
    expect(canTeach(gap, false)).toBe(false)
    expect(canTeach({ ...gap, teachable: false }, true)).toBe(false)
  })

  it('sends the correction to training, and the comment back only when it is the person\'s own', () => {
    expect(teachPayload(gap, '  Yes, dogs welcome. ', 'Peter')).toEqual({ rating: 'bad', corrected_answer: 'Yes, dogs welcome.', apply_to_training: true })
    expect(teachPayload(gap, 'Yes.', 'Maria')).toEqual({ rating: 'bad', corrected_answer: 'Yes.', apply_to_training: true, comment: 'We do, 15 € a night' })
  })

  it('wants a correction of 1 to 5000 characters', () => {
    expect(correctionValid('  ')).toBe(false)
    expect(correctionValid('Yes')).toBe(true)
    expect(correctionValid('x'.repeat(5001))).toBe(false)
  })

  it('lists the teachable, most rated and newest first', () => {
    const list = sortGaps([
      { ...gap, message_id: 1, teachable: false, ratings: 5 },
      { ...gap, message_id: 2, ratings: 1, rated_at: '2026-11-01T00:00:00+00:00' },
      { ...gap, message_id: 3, ratings: 2 },
      { ...gap, message_id: 4, ratings: 1, rated_at: '2026-11-05T00:00:00+00:00' },
    ])
    expect(list.map(g => g.message_id)).toEqual([3, 4, 2, 1])
  })
})

describe('try it (chatbot-config/test-chat)', () => {
  it('sends the message and the last 20 turns, then appends both sides', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: `m${i}` }))
    const body = testChatPayload('  Parking? ', history)
    expect(body.message).toBe('Parking?')
    expect(body.history).toHaveLength(20)
    expect(body.history[0].content).toBe('m5')
    expect(afterReply([], ' Parking? ', 'Yes.')).toEqual([{ role: 'user', content: 'Parking?' }, { role: 'assistant', content: 'Yes.' }])
  })
})
