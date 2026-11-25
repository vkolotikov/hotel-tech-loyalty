import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { assistantKey, useAssistant, type Assistant, type Coverage } from './assistantData'
import { LeadAssistantPanel } from './LeadAssistantPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, args?: { subject?: string }) => args?.subject ?? key,
    i18n: { language: 'en' },
  }),
}))

const original: Coverage = {
  customer_fields: 1, business_fields: 1, activities: 0, chats: 0, emails: 1, whatsapp: 0,
  email_state: 'captured', strategies: [], reply_to: { channel: 'email', subject: 'Prototype timing' },
}

function render(coverage: Coverage, decision: 'draft' | 'internal_action' = 'draft') {
  const client = new QueryClient()
  client.setQueryData<Assistant>(assistantKey(41), {
    brand: { id: 1, name: 'Studio' }, revision: 1, strategies: {}, run: null,
    results: { reply: { id: 'reply', generated_at: '2026-11-24T10:00:00Z', subject: 'Proof', body: 'Friday works.',
      review_notes: ['Verify the finish internally.'], decision, reason: 'Engineering owes an answer.', coverage } },
  })
  function Panel() {
    return <LeadAssistantPanel leadId={41} recipient="buyer@example.org" mode="reply" query={useAssistant(41)}
      onMode={() => {}} onEmails={() => {}} onUse={() => {}} />
  }
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><Panel /></MemoryRouter></QueryClientProvider>)
}

describe('response email sources', () => {
  it('opens previously generated drafts and keeps verification notes out of the email', () => {
    const html = render(original)
    expect(html).toContain('Prototype timing')
    expect(html).toContain('Verify the finish internally.')
    for (const action of ['comment', 'revise', 'fresh']) expect(html).toContain(`inquiryDetail.proposal.${action}`)
    expect(html.match(/href="mailto:[^"]+"/)?.[0]).toBe('href="mailto:buyer@example.org?subject=Proof&amp;body=Friday%20works."')
    expect(html).not.toContain('crm.sales.context.history_limited')
  })

  it('shows the internal next action and removes compose and copy actions for a held email', () => {
    const html = render(original, 'internal_action')
    expect(html).toContain('Engineering owes an answer.')
    expect(html).toContain('crm.sales.email.internal_action')
    expect(html).not.toContain('href="mailto:')
    expect(html).not.toContain('crm.sales.email.use_activity')
    expect(html).not.toContain('Friday works.')
    expect(html).not.toContain('inquiryDetail.proposal.revise')
  })

  it('identifies a WhatsApp request, writing samples and incomplete history', () => {
    const html = render({ ...original, emails: 0, whatsapp: 75, email_state: 'empty', reply_to: { channel: 'whatsapp' },
      writing_samples: 3, history_limited: true, discovery_fields: 1, knowledge_answers: 12, knowledge_documents: 0 })
    for (const word of ['crm.whatsapp.title', 'crm.sales.context.writing_samples', 'crm.sales.context.history_limited', 'crm.sales.context.discovery_fields']) {
      expect(html).toContain(word)
    }
    expect(html).toContain('crm.sales.context.knowledge_answers')
    expect(html).toContain('crm.sales.context.knowledge_documents')
    expect(html).not.toContain('crm.sales.email.reply_missing')
  })
})
