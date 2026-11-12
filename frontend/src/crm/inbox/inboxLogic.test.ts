import { describe, expect, it } from 'vitest'
import {
  aiToggle, audioFileName, canReply, canTranslate, cannedReplies, channelKey, checkUpload, contactErrors, contactForm,
  contactPayload, dayKey, displayName, draftInstruction, draftState, feedbackForm, feedbackPayload, filterCounts, hostOf,
  insertText, intentKey, isSafeAttachment, lastMessageId, leadErrors, leadForm, leadIdOf, leadPayload, listPath,
  matchesSearch, mergeMessages, messageBody, needsAttention, pagePath, readConversationId, readStatus, recorderMime,
  rowState, shouldPingTyping, shownConversations, sideOf, sortConversations, statusActions, teachMode, threadRows, translateTarget, feedbackOutcome,
  visitorHasWritten, webHref, withDraft, UPLOAD_MAX_BYTES,
  activeFilters, feedConversations, inboxSource, readDetailsTab, readFlag, readSort, resolveNext, shownRows, stepConversation,
  type InboxView,
} from './inboxLogic'
import type { FeedRow } from './feedLogic'
import type { Conversation, InboxStats, Message } from './types'
import { dictationFailure } from './useDictation'

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 1, visitor_id: null, visitor_name: null, visitor_email: null, visitor_phone: null, visitor_country: null, visitor_city: null,
  page_url: null, channel: 'widget', status: 'active', ai_enabled: true, assigned_to: null, assigned_agent: null, member: null,
  unread_count: 0, ip_session_count: 1, last_message: null, last_message_at: null, lead_captured: false, inquiry_id: null,
  intent_tag: null, agent_notes: null, created_at: null, ...over,
})

const msg = (id: number, sender: Message['sender_type'], at: string, over: Partial<Message> = {}): Message => ({
  id, conversation_id: 1, sender_type: sender, sender_user_id: sender === 'agent' ? 4 : null, content: `m${id}`, created_at: at, ...over,
})

describe('the URL and the list', () => {
  it('reads ?status= and ?c= strictly', () => {
    expect(readStatus('waiting')).toBe('waiting')
    expect(readStatus('archived')).toBe('archived')
    expect(readStatus('closed')).toBe('all')
    expect(readStatus(null)).toBe('all')
    expect(readConversationId('12')).toBe(12)
    expect(readConversationId('0')).toBeNull()
    expect(readConversationId('12abc')).toBeNull()
    expect(readConversationId('-3')).toBeNull()
    expect(readConversationId(undefined)).toBeNull()
  })

  it('asks the server for the filter, the search, the grouping and the page, leaving out what is empty', () => {
    expect(listPath('all', '', false)).toBe('chat-inbox')
    expect(listPath('waiting', '  ada ', true, 2)).toBe('chat-inbox?status=waiting&search=ada&group_by_visitor=1&page=2')
    expect(listPath('resolved', '', true, 1)).toBe('chat-inbox?status=resolved&group_by_visitor=1')
  })

  it('counts each filter from chat-inbox/stats', () => {
    const stats: InboxStats = { active: 3, waiting: 2, resolved: 10, archived: 4, closed: 14, total: 19, active_24h: 2, unassigned: 1, resolved_today: 0, unread_messages: 5 }
    expect(filterCounts(stats)).toEqual({ all: 19, active: 3, waiting: 2, resolved: 10, archived: 4 })
    expect(filterCounts(undefined)).toEqual({})
  })

  it('names a member by their account, else the visitor, else their email', () => {
    expect(displayName(conv({ member: { id: 1, user: { id: 2, name: 'Ada L', email: null }, tier: null }, visitor_name: 'Visitor 12' }))).toBe('Ada L')
    expect(displayName(conv({ visitor_name: '  ', visitor_email: 'ada@example.com' }))).toBe('ada@example.com')
    expect(displayName(conv())).toBeNull()
  })

  it('puts unread and waiting chats first, then the newest, keeping the server order for ties', () => {
    const list = [
      conv({ id: 1, last_message_at: '2026-11-07T10:00:00+00:00' }),
      conv({ id: 2, last_message_at: '2026-11-07T09:00:00+00:00', status: 'waiting' }),
      conv({ id: 3, last_message_at: '2026-11-07T11:00:00+00:00' }),
      conv({ id: 4, last_message_at: '2026-11-07T08:00:00+00:00', unread_count: 2 }),
      conv({ id: 5, last_message_at: null }),
      conv({ id: 6, last_message_at: null }),
    ]
    expect(sortConversations(list).map(c => c.id)).toEqual([2, 4, 3, 1, 5, 6])
    expect(needsAttention(conv({ status: 'waiting' }))).toBe(true)
    expect(needsAttention(conv({ unread_count: 1 }))).toBe(true)
    expect(needsAttention(conv())).toBe(false)
  })

  it('narrows the page at once by name, email, phone or last message', () => {
    const list = [conv({ id: 1, visitor_name: 'Ada' }), conv({ id: 2, visitor_email: 'BOB@x.com' }), conv({ id: 3, last_message: 'Do you have parking?' }), conv({ id: 4, visitor_phone: '+371 2000' })]
    expect(shownConversations(list, 'bob').map(c => c.id)).toEqual([2])
    expect(shownConversations(list, 'PARKING').map(c => c.id)).toEqual([3])
    expect(shownConversations(list, '2000').map(c => c.id)).toEqual([4])
    expect(shownConversations(list, '  ').length).toBe(4)
    expect(matchesSearch(conv({ member: { id: 1, user: { id: 1, name: 'Zed', email: null }, tier: null } }), 'zed')).toBe(true)
  })
})

describe('what a conversation allows', () => {
  it('offers resolve and archive while open, reopen once closed', () => {
    expect(statusActions('active').map(a => [a.action, a.next])).toEqual([['resolve', 'resolved'], ['archive', 'archived']])
    expect(statusActions('waiting').map(a => a.action)).toEqual(['resolve', 'archive'])
    expect(statusActions('resolved').map(a => [a.action, a.next])).toEqual([['reopen', 'active'], ['archive', 'archived']])
    expect(statusActions('archived').map(a => [a.action, a.next])).toEqual([['reopen', 'active']])
  })

  it('takes no reply in an archived chat', () => {
    expect(canReply('archived')).toBe(false)
    expect(canReply('resolved')).toBe(true)
    expect(canReply('waiting')).toBe(true)
  })

  it('reads "Take over" while the assistant answers (also when unset) and "Hand back to AI" once a person has it', () => {
    expect(aiToggle({ ai_enabled: true })).toEqual({ aiOn: true, action: 'take_over', next: false })
    expect(aiToggle({ ai_enabled: null })).toEqual({ aiOn: true, action: 'take_over', next: false })
    expect(aiToggle({ ai_enabled: false })).toEqual({ aiOn: false, action: 'hand_back', next: true })
  })
})

describe('the thread', () => {
  const zone = 'Europe/Riga'

  it('puts the visitor on the left and the team and the assistant on the right', () => {
    expect(sideOf('visitor')).toBe('left')
    expect(sideOf('agent')).toBe('right')
    expect(sideOf('ai')).toBe('right')
  })

  it('reads the day in the venue zone', () => {
    expect(dayKey('2026-11-06T22:30:00+00:00', 'Europe/Riga')).toBe('2026-11-07')
    expect(dayKey('2026-11-06T22:30:00+00:00', 'UTC')).toBe('2026-11-06')
    expect(dayKey('2026-11-06T22:30:00+00:00', 'Not/AZone')).toMatch(/^2026-11-0[67]$/)
    expect(dayKey(null, zone)).toBe('')
  })

  it('groups one author\'s messages close in time, with a day line and system notes between', () => {
    const rows = threadRows([
      msg(1, 'visitor', '2026-11-06T08:00:00+00:00'),
      msg(2, 'visitor', '2026-11-06T08:02:00+00:00'),
      msg(3, 'ai', '2026-11-06T08:02:30+00:00'),
      msg(4, 'system', '2026-11-06T08:03:00+00:00', { content: 'AI auto-reply paused by agent' }),
      msg(5, 'agent', '2026-11-06T08:04:00+00:00'),
      msg(6, 'agent', '2026-11-06T08:30:00+00:00'),
      msg(7, 'visitor', '2026-11-07T09:00:00+00:00', { content: '   ', attachment_url: null }),
      msg(8, 'visitor', '2026-11-07T09:01:00+00:00', { content: null, attachment_url: '/storage/x.png', attachment_type: 'image' }),
    ], zone)
    expect(rows.map(r => r.kind === 'day' ? `day:${r.day}` : r.kind === 'note' ? `note:${r.message.id}` : `${r.message.id}:${r.side}:${r.first ? 'F' : ''}${r.last ? 'L' : ''}`)).toEqual([
      'day:2026-11-06',
      '1:left:F', '2:left:L',
      '3:right:FL',
      'note:4',
      '5:right:FL',
      '6:right:FL',
      'day:2026-11-07',
      '8:left:FL',
    ])
  })

  it('keeps two team members apart even within the gap', () => {
    const rows = threadRows([
      msg(1, 'agent', '2026-11-06T08:00:00+00:00', { sender_user_id: 4 }),
      msg(2, 'agent', '2026-11-06T08:01:00+00:00', { sender_user_id: 9 }),
    ], zone)
    expect(rows.filter(r => r.kind === 'bubble').map(r => r.kind === 'bubble' && r.first)).toEqual([true, true])
  })

  it('adds the poll\'s new messages once each, in order, and asks after the newest', () => {
    const existing = [msg(1, 'visitor', 'a'), msg(2, 'ai', 'b')]
    const merged = mergeMessages(existing, [msg(4, 'visitor', 'd'), msg(2, 'ai', 'b'), msg(3, 'agent', 'c')])
    expect(merged.map(m => m.id)).toEqual([1, 2, 3, 4])
    expect(mergeMessages(existing, []).map(m => m.id)).toEqual([1, 2])
    expect(lastMessageId(merged)).toBe(4)
    expect(lastMessageId([])).toBe(0)
  })

  it('links a stored file only from a web address or a path', () => {
    expect(isSafeAttachment('/storage/chat/a.pdf')).toBe(true)
    expect(isSafeAttachment('https://cdn.example.com/a.png')).toBe(true)
    expect(isSafeAttachment('//evil.example.com/a.png')).toBe(false)
    expect(isSafeAttachment('javascript:alert(1)')).toBe(false)
    expect(isSafeAttachment(null)).toBe(false)
    expect(webHref('https://hotel.example/rooms')).toBe('https://hotel.example/rooms')
    expect(webHref('javascript:alert(1)')).toBeNull()
    expect(pagePath('https://hotel.example/rooms/suite?x=1')).toBe('/rooms/suite?x=1')
    expect(pagePath('not a url')).toBe('not a url')
    expect(hostOf('https://www.google.com/search?q=x')).toBe('www.google.com')
  })

  it('offers a translation of the visitor\'s and the assistant\'s words, into the person\'s language', () => {
    expect(canTranslate({ sender_type: 'visitor', content: 'Hola' })).toBe(true)
    expect(canTranslate({ sender_type: 'ai', content: 'Hi' })).toBe(true)
    expect(canTranslate({ sender_type: 'agent', content: 'Hi' })).toBe(false)
    expect(canTranslate({ sender_type: 'visitor', content: ' ' })).toBe(false)
    expect(translateTarget('de-AT')).toBe('de')
    expect(translateTarget('ru')).toBe('ru')
    expect(translateTarget('lv')).toBe('en')
  })

  it('knows the channels and intents it has words for', () => {
    expect(channelKey('messenger')).toBe('messenger')
    expect(channelKey('carrier-pigeon')).toBeNull()
    expect(intentKey('booking_inquiry')).toBe('booking_inquiry')
    expect(intentKey(null)).toBeNull()
  })
})

describe('the reply box', () => {
  it('adds a canned reply or dictated words after what is there', () => {
    expect(insertText('', 'Hello')).toBe('Hello')
    expect(insertText('Hi Ada,  ', ' we have rooms ')).toBe('Hi Ada, we have rooms')
    expect(insertText('Hi', '   ')).toBe('Hi')
  })

  it('puts the AI draft in the box and keeps what was written so it can come back', () => {
    expect(withDraft('', ' We have a room on Friday. ')).toEqual({ text: 'We have a room on Friday.', previous: null })
    expect(withDraft('my words', 'Draft')).toEqual({ text: 'Draft', previous: 'my words' })
  })

  it('shows the draft only with the chatbot and where a reply can go; holds it back when the server would refuse', () => {
    const asked = [msg(1, 'visitor', '2026-11-07T08:00:00+00:00', { content: 'Any rooms Friday?' })]
    expect(draftState({ chatbot: false, aiStatus: 'under', status: 'active', messages: asked })).toEqual({ show: false })
    expect(draftState({ chatbot: true, aiStatus: 'under', status: 'archived', messages: asked })).toEqual({ show: false })
    expect(draftState({ chatbot: true, aiStatus: 'over', status: 'active', messages: asked })).toEqual({ show: true, blocked: 'ai_budget_used_up' })
    expect(draftState({ chatbot: true, aiStatus: 'warn', status: 'waiting', messages: [msg(2, 'ai', 'x')] })).toEqual({ show: true, blocked: 'nothing_to_answer' })
    expect(draftState({ chatbot: true, aiStatus: 'unlimited', status: 'resolved', messages: asked })).toEqual({ show: true, blocked: null })
    expect(visitorHasWritten([msg(3, 'visitor', 'x', { content: '  ' })])).toBe(false)
  })

  it('sends an instruction only when one is written, at most 300 letters', () => {
    expect(draftInstruction('  ')).toBeUndefined()
    expect(draftInstruction(' shorter ')).toBe('shorter')
    expect(draftInstruction('x'.repeat(400))).toHaveLength(300)
  })

  it('pings "typing" at most every two seconds', () => {
    expect(shouldPingTyping(0, 10_000)).toBe(true)
    expect(shouldPingTyping(9_000, 10_000)).toBe(false)
    expect(shouldPingTyping(8_000, 10_000)).toBe(true)
  })

  it('sends a trimmed reply, nothing for an empty one or one over 5000 letters', () => {
    expect(messageBody('  Hello  ')).toEqual({ content: 'Hello' })
    expect(messageBody('   ')).toBeNull()
    expect(messageBody('x'.repeat(5001))).toBeNull()
  })

  it('refuses before uploading what the server would refuse', () => {
    expect(checkUpload({ name: 'menu.PDF', size: 1000 })).toBeNull()
    expect(checkUpload({ name: 'photo.jpeg', size: UPLOAD_MAX_BYTES })).toBeNull()
    expect(checkUpload({ name: 'photo.jpeg', size: UPLOAD_MAX_BYTES + 1 })).toBe('too_big')
    expect(checkUpload({ name: 'setup.exe', size: 10 })).toBe('wrong_type')
    expect(checkUpload({ name: 'notes', size: 10 })).toBe('wrong_type')
  })

  it('records in the first format the browser supports and names the file by it', () => {
    expect(recorderMime(m => m === 'audio/mp4')).toBe('audio/mp4')
    expect(recorderMime(m => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(recorderMime(() => false)).toBe('')
    expect(audioFileName('audio/mp4')).toBe('reply.mp4')
    expect(audioFileName('audio/ogg;codecs=opus')).toBe('reply.ogg')
    expect(audioFileName('')).toBe('reply.webm')
  })

  it('reads canned replies from their wrapper and drops unusable ones', () => {
    expect(cannedReplies({ canned_responses: [{ label: 'Hours', text: 'We are open 8–20.' }, { label: 'x', text: '  ' }, null, { text: 'No label here at all' }] }))
      .toEqual([{ label: 'Hours', text: 'We are open 8–20.' }, { label: 'No label here at all', text: 'No label here at all' }])
    expect(cannedReplies(undefined)).toEqual([])
    expect(cannedReplies({ canned_responses: 'nope' })).toEqual([])
  })
})

describe('the forms', () => {
  it('fills the contact form from the chat and clears an emptied field with null', () => {
    const form = contactForm(conv({ visitor_name: 'Ada', visitor_email: 'ada@example.com', agent_notes: 'VIP' }))
    expect(form).toEqual({ visitor_name: 'Ada', visitor_email: 'ada@example.com', visitor_phone: '', visitor_country: '', visitor_city: '', agent_notes: 'VIP' })
    expect(contactPayload({ ...form, visitor_email: '  ', visitor_city: ' Riga ' })).toEqual({
      visitor_name: 'Ada', visitor_email: null, visitor_phone: null, visitor_country: null, visitor_city: 'Riga', agent_notes: 'VIP',
    })
  })

  it('says what the contact rules would refuse', () => {
    const form = contactForm(conv())
    expect(contactErrors({ ...form, visitor_email: 'ada@' })).toEqual({ visitor_email: 'email' })
    expect(contactErrors({ ...form, visitor_phone: '1'.repeat(31) })).toEqual({ visitor_phone: 'too_long' })
    expect(contactErrors(form)).toEqual({})
  })

  it('makes a lead from what was filled in only, and finds the lead it made', () => {
    expect(leadForm(conv({ visitor_name: 'Ada', visitor_phone: '+371' }))).toEqual({ name: 'Ada', email: '', phone: '+371', notes: '' })
    expect(leadPayload({ name: ' Ada ', email: '', phone: '+371', notes: '  ' })).toEqual({ name: 'Ada', phone: '+371' })
    expect(leadErrors({ name: '', email: 'nope', phone: '', notes: '' })).toEqual({ email: 'email' })
    expect(leadIdOf({ success: true, inquiry_id: 31, guest_id: 9 })).toBe(31)
    expect(leadIdOf({ success: true }, { inquiry_id: 12 })).toBe(12)
    expect(leadIdOf(null)).toBeNull()
  })

  it('teaches the assistant only a wrong answer with its correction', () => {
    expect(feedbackForm('bad')).toEqual({ rating: 'bad', comment: '', corrected_answer: '', apply_to_training: true })
    expect(feedbackForm('good', { id: 1, rating: 'good', comment: 'nice', applied_to_training: false })).toEqual({ rating: 'good', comment: 'nice', corrected_answer: '', apply_to_training: false })
    expect(feedbackPayload({ rating: 'bad', comment: ' ', corrected_answer: ' Breakfast is 7–10. ', apply_to_training: true }))
      .toEqual({ rating: 'bad', comment: null, corrected_answer: 'Breakfast is 7–10.', apply_to_training: true })
    expect(feedbackPayload({ rating: 'bad', comment: '', corrected_answer: '  ', apply_to_training: true }))
      .toEqual({ rating: 'bad', comment: null, corrected_answer: null, apply_to_training: false })
    expect(feedbackPayload({ rating: 'good', comment: 'ok', corrected_answer: 'left over', apply_to_training: true }))
      .toEqual({ rating: 'good', comment: 'ok', corrected_answer: null, apply_to_training: false })
  })
})

describe('round 2: the list rows and teaching', () => {
  it('shows a row as unread with its count, as waiting, or as neither', () => {
    expect(rowState(conv({ unread_count: 3 }))).toEqual({ unread: 3, waiting: false, urgent: true })
    expect(rowState(conv({ status: 'waiting', unread_count: 0 }))).toEqual({ unread: 0, waiting: true, urgent: true })
    expect(rowState(conv({ unread_count: undefined }))).toEqual({ unread: 0, waiting: false, urgent: false })
    expect(rowState(conv({ unread_count: -1 })).unread).toBe(0)
  })

  it('lets a manager teach and a staff member suggest', () => {
    expect(teachMode(true)).toBe('teach')
    expect(teachMode(false)).toBe('suggest')
  })

  it('reads what the feedback endpoint did: taught, kept as a suggestion, not taught, or saved', () => {
    expect(feedbackOutcome({ apply_to_training: true }, { applied_to_training: true, suggested: false })).toBe('taught')
    expect(feedbackOutcome({ apply_to_training: true }, { applied_to_training: false, suggested: true })).toBe('suggested')
    expect(feedbackOutcome({ apply_to_training: true }, { applied_to_training: false, suggested: false })).toBe('not_taught')
    expect(feedbackOutcome({ apply_to_training: false }, { applied_to_training: false })).toBe('saved')
    expect(feedbackOutcome({ apply_to_training: false }, null)).toBe('saved')
  })

  it('brings back the person’s own suggested answer, never someone else’s', () => {
    const saved = { id: 1, user_id: 4, rating: 'bad' as const, comment: 'Wrong price', applied_to_training: false, suggested_answer: 'It is 90 € a night.' }
    expect(feedbackForm('bad', saved, 4)).toEqual({ rating: 'bad', comment: 'Wrong price', corrected_answer: 'It is 90 € a night.', apply_to_training: true })
    expect(feedbackForm('bad', saved, 5).corrected_answer).toBe('')
    expect(feedbackForm('good', saved, 4).corrected_answer).toBe('')
  })
})

describe('dictation', () => {
  it('says the transcription is off when the server says so, and failed otherwise', () => {
    expect(dictationFailure({ response: { status: 503, data: { error: 'transcription_unavailable' } } })).toBe('off')
    expect(dictationFailure({ response: { status: 502, data: { error: 'ai_failed' } } })).toBe('failed')
    expect(dictationFailure(new Error('offline'))).toBe('failed')
  })
})

describe('round 5: the priority and intent feed in the inbox', () => {
  const view = (over: Partial<InboxView> = {}): InboxView => ({
    status: 'all', sort: 'newest', intent: null, unassigned: false, range: 'all', search: '', group: true, page: 1, ...over,
  })

  it('reads ?sort= and ?unassigned= strictly', () => {
    expect(readSort('priority')).toBe('priority')
    expect(readSort('recent')).toBe('newest')
    expect(readSort(null)).toBe('newest')
    expect(readFlag('1')).toBe(true)
    expect(readFlag('true')).toBe(false)
    expect(readFlag(null)).toBe(false)
  })

  it('asks the inbox for the chats nobody has', () => {
    expect(listPath('waiting', '', false, 1, true)).toBe('chat-inbox?status=waiting&unassigned=1')
  })

  it('keeps the inbox’s own list while neither the priority order nor an intent is asked, or without the hub', () => {
    expect(inboxSource(view(), true)).toEqual({ kind: 'inbox', path: 'chat-inbox?group_by_visitor=1' })
    expect(inboxSource(view({ sort: 'priority', intent: 'complaint' }), false)).toEqual({ kind: 'inbox', path: 'chat-inbox?group_by_visitor=1' })
    expect(inboxSource(view({ status: 'waiting', unassigned: true }), true)).toEqual({ kind: 'inbox', path: 'chat-inbox?status=waiting&group_by_visitor=1&unassigned=1' })
  })

  it('asks the feed for the priority order, its filter beside each status', () => {
    expect(inboxSource(view({ sort: 'priority' }), true))
      .toEqual({ kind: 'feed', path: 'engagement/feed?filter=priority&sort=priority&range=all', status: null, unassigned: false })
    expect(inboxSource(view({ sort: 'priority', status: 'waiting' }), true))
      .toMatchObject({ kind: 'feed', path: 'engagement/feed?filter=active_chat&sort=priority&range=all', status: 'waiting' })
    expect(inboxSource(view({ sort: 'priority', status: 'resolved' }), true)).toMatchObject({ path: 'engagement/feed?filter=resolved&sort=priority&range=all', status: 'resolved' })
    expect(inboxSource(view({ sort: 'priority', status: 'archived' }), true)).toMatchObject({ path: 'engagement/feed?filter=all&sort=priority&range=all', status: 'archived' })
  })

  it('asks the feed for an intent, the newest first unless the priority order is on, in the window, with the search and page', () => {
    expect(inboxSource(view({ intent: 'booking_inquiry', range: 'week', search: 'ada', page: 2 }), true))
      .toEqual({ kind: 'feed', path: 'engagement/feed?filter=booking_inquiry&sort=recent&range=week&search=ada&page=2', status: null, unassigned: false })
    expect(inboxSource(view({ intent: 'complaint', sort: 'priority', status: 'active', unassigned: true }), true))
      .toEqual({ kind: 'feed', path: 'engagement/feed?filter=complaint&sort=priority&range=all', status: 'active', unassigned: true })
  })

  const feedRow = (over: Partial<FeedRow> = {}, chat: Partial<NonNullable<FeedRow['conversation']>> | null = {}): FeedRow => ({
    id: 5, display_name: 'Marta', email: 'marta@example.com', phone: null, is_lead: true, is_online: true, country: 'LV', city: 'Rīga',
    visitor_ip: '10.0.0.1', current_page: 'https://hotel.example/rooms', current_page_title: 'Rooms', visit_count: 2, page_views_count: 4,
    messages_count: 3, last_seen_at: '2026-11-07T12:00:00Z', guest_id: 8, guest: { id: 8, name: 'Marta Ozola' }, is_hot_lead: true, priority_score: 1250,
    conversation: chat === null ? null : {
      id: 12, status: 'waiting', last_message_preview: 'A room on Friday?', last_message_sender: 'visitor', last_message_at: '2026-11-07T11:59:00Z',
      lead_captured: false, ai_enabled: false, assigned_to: null, unread_admin_count: 2, intent_tag: 'booking_inquiry', ...chat,
    },
    ...over,
  })

  it('shows the feed’s visitors as their latest chats, with the hot-lead flag, only those of the status and nobody asked', () => {
    const rows = feedConversations([feedRow(), feedRow({ id: 6 }, null), feedRow({ id: 7 }, { id: 13, status: 'active', assigned_to: 4 })], { status: null, unassigned: false })
    expect(rows.map(r => r.id)).toEqual([12, 13])
    expect(rows[0]).toMatchObject({ id: 12, visitor_id: 5, visitor_name: 'Marta', status: 'waiting', unread_count: 2, last_message: 'A room on Friday?', intent_tag: 'booking_inquiry', hot: true, online: true, ai_enabled: false })
    expect(feedConversations([feedRow(), feedRow({ id: 7 }, { id: 13, status: 'active' })], { status: 'active', unassigned: false }).map(r => r.id)).toEqual([13])
    expect(feedConversations([feedRow(), feedRow({ id: 7 }, { id: 13, assigned_to: 4 })], { status: null, unassigned: true }).map(r => r.id)).toEqual([12])
  })

  it('keeps the feed’s own order, and the inbox’s urgent first', () => {
    const a = conv({ id: 1, status: 'active', last_message_at: '2026-11-07T12:00:00Z' })
    const b = conv({ id: 2, status: 'waiting', last_message_at: '2026-11-07T10:00:00Z' })
    expect(shownRows('feed', [a, b], '').map(r => r.id)).toEqual([1, 2])
    expect(shownRows('inbox', [a, b], '').map(r => r.id)).toEqual([2, 1])
    expect(shownRows('feed', [conv({ id: 3, visitor_name: 'Ada' }), conv({ id: 4, visitor_name: 'Bo' })], 'ad').map(r => r.id)).toEqual([3])
  })

  it('counts the filters on besides the status', () => {
    expect(activeFilters({ sort: 'newest', intent: null, range: 'week' }, true)).toBe(0)
    expect(activeFilters({ sort: 'priority', intent: null, range: 'all' }, true)).toBe(1)
    expect(activeFilters({ sort: 'priority', intent: 'complaint', range: 'today' }, true)).toBe(3)
    expect(activeFilters({ sort: 'priority', intent: 'complaint', range: 'today' }, false)).toBe(0)
  })
})

describe('round 5: the keys and the details', () => {
  it('J and K step through the list as shown, starting at the first, stopping at the ends', () => {
    expect(stepConversation([4, 7, 9], null, 1)).toBe(4)
    expect(stepConversation([4, 7, 9], null, -1)).toBe(4)
    expect(stepConversation([4, 7, 9], 4, 1)).toBe(7)
    expect(stepConversation([4, 7, 9], 7, -1)).toBe(4)
    expect(stepConversation([4, 7, 9], 9, 1)).toBeNull()
    expect(stepConversation([4, 7, 9], 4, -1)).toBeNull()
    expect(stepConversation([4, 7, 9], 12, 1)).toBe(4)
    expect(stepConversation([], null, 1)).toBeNull()
  })

  it('E resolves an open or waiting chat, nothing else', () => {
    expect(resolveNext('active')).toBe('resolved')
    expect(resolveNext('waiting')).toBe('resolved')
    expect(resolveNext('resolved')).toBeNull()
    expect(resolveNext('archived')).toBeNull()
    expect(resolveNext(undefined)).toBeNull()
  })

  it('reads ?dtab=, Contact first, AI only where it has something to show', () => {
    expect(readDetailsTab('lead')).toBe('lead')
    expect(readDetailsTab('website')).toBe('website')
    expect(readDetailsTab('ai')).toBe('ai')
    expect(readDetailsTab('ai', false)).toBe('contact')
    expect(readDetailsTab('nonsense')).toBe('contact')
    expect(readDetailsTab(null)).toBe('contact')
  })
})
