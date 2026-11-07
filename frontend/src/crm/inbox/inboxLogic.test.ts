import { describe, expect, it } from 'vitest'
import {
  aiToggle, audioFileName, canReply, canTranslate, cannedReplies, channelKey, checkUpload, contactErrors, contactForm,
  contactPayload, dayKey, displayName, draftInstruction, draftState, feedbackForm, feedbackPayload, filterCounts, hostOf,
  insertText, intentKey, isSafeAttachment, lastMessageId, leadErrors, leadForm, leadIdOf, leadPayload, listPath,
  matchesSearch, mergeMessages, messageBody, needsAttention, pagePath, readConversationId, readStatus, recorderMime,
  rowState, shouldPingTyping, shownConversations, sideOf, sortConversations, statusActions, teachMode, threadRows, translateTarget, feedbackOutcome,
  visitorHasWritten, webHref, withDraft, UPLOAD_MAX_BYTES,
} from './inboxLogic'
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
