import type { EmailItem } from './CrmEmailHistory'

function mailbox(value: string) {
  const wrapped = value.match(/^(.*?)\s*<([^<>]+)>\s*$/)
  const address = (wrapped?.[2] ?? value).trim()
  const name = wrapped?.[1].trim().replace(/^"(.*)"$/, '$1')
  return { address, label: name || address }
}

export function messageParties(participants: EmailItem['participants'], customer = '') {
  const contact = customer.trim().toLowerCase()
  const from = (participants.from ?? []).map(mailbox)
  const recipients = [...(participants.to ?? []), ...(participants.cc ?? [])].map(mailbox)
  const matches = (item: ReturnType<typeof mailbox>) => !!contact && item.address.toLowerCase() === contact
  const direction = from.some(matches) ? 'incoming' : recipients.some(matches) ? 'outgoing' : 'other'
  return { direction, sender: from.map(item => item.label).join(', ') }
}

export function groupBySubject(messages: EmailItem[]) {
  const groups = new Map<string, { subject: string; messages: EmailItem[] }>()
  for (const message of messages) {
    const subject = (message.subject || '').trim().replace(/^(?:(?:re|fw|fwd|aw|wg|tr|rv|sv)\s*:\s*)+/i, '').trim()
    const key = subject ? 'subject:' + subject.toLowerCase() : 'message:' + message.id
    const group = groups.get(key) ?? { subject, messages: [] }
    group.messages.push(message)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function splitMailBody(body: string) {
  const text = body.replace(/\r\n?/g, '\n').replace(/^[\t \u00a0]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  const forwarded = /^(?:[-_]{2,}[ \t]*(?:original message|forwarded message|message d.origine|ursprüngliche nachricht|mensaje original|исходное сообщение)[ \t]*[-_]{2,}|(?:From|Von|De|От):[^\n]*\n(?:Sent|Date|Gesendet|Envoyé|Enviado|Отправлено):)/im.exec(text)
  const lines = text.split('\n')
  let last = lines.length
  while (last > 0 && (!lines[last - 1] || lines[last - 1].startsWith('>'))) last--
  if (last < lines.length && /^(?:On .+ wrote|Am .+ schrieb .+|Le .+ a écrit|El .+ escribió)\s*:$/i.test(lines[last - 1] ?? '')) last--
  const start = Math.min(forwarded?.index ?? text.length, lines.slice(0, last).join('\n').length)
  return { current: text.slice(0, start).trim(), quoted: text.slice(start).trim() }
}
