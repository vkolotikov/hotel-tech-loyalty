import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookOpen, Code2, FileText, KeyRound, Plus, Terminal, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { useBoot } from '../CrmProvider'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { InfoTip } from '../ui/InfoTip'
import { TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { INTEGRATION_KEYS, integrationError, integrationsApi } from './integrationsApi'
import {
  TOKEN_LABEL_MAX, curlSnippet, exampleBrandId, guideText, intakeEndpoint, snippetToken, tokenLabelProblem, tokenTitle, webSnippet,
  type CreatedToken, type GuideBrand, type GuideWords, type IntakeToken,
} from './integrationsLogic'
import { Ago, CodeBlock, CopyButton, Problem, dayText, useCopy } from './parts'

type Snippet = 'guide' | 'curl' | 'web'

/**
 * Lead intake (round 5): the manager's own API tokens for `POST /v1/integrations/leads` — made in a dialog that shows the
 * new token once, listed with when each was last used, revoked after a confirmation — and the guide a developer (or an
 * AI) needs to send a website's forms in, with the address, the brands' ids and ready examples. A token made here sends
 * leads in and does nothing else (IntakeTokens, on the server).
 */
export function LeadIntakeTab() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const query = useQuery({ queryKey: INTEGRATION_KEYS.tokens, queryFn: integrationsApi.tokens })
  const tokens = query.data?.data ?? []
  const limit = query.data?.limit ?? 20
  const [creating, setCreating] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<IntakeToken | null>(null)

  const revoke = useMutation({
    mutationFn: (id: number) => integrationsApi.revokeToken(id),
    onSuccess: () => {
      setRevoking(null)
      void qc.invalidateQueries({ queryKey: INTEGRATION_KEYS.tokens })
      say(t('crm.integrations.tokens.revoked', 'Token revoked. Anything using it stops at once.'))
    },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  const newButton = (
    <Button size="sm" onClick={() => setCreating(true)} disabled={tokens.length >= limit}>
      <Plus size={15} aria-hidden />{t('crm.integrations.tokens.new', 'New token')}
    </Button>
  )

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card padded={false} title={t('crm.integrations.tokens.title', 'API tokens')} icon={KeyRound} tone="accent"
        description={t('crm.integrations.tokens.about', 'A token lets another system send leads into this CRM, and nothing else. Each is yours; revoke it the moment it leaks.')}
        hint={tokens.length > 0 ? t('crm.integrations.tokens.count', '{{count}} of {{max}}', { count: tokens.length, max: limit }) : undefined}
        action={tokens.length > 0 ? newButton : undefined}>
        <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }} rows={2}>
          {tokens.length === 0 ? (
            <EmptyState icon={KeyRound} title={t('crm.integrations.tokens.empty', 'No tokens yet')}
              line={t('crm.integrations.tokens.empty_line', 'Make one for each website or system that sends you leads.')} action={newButton} />
          ) : (
            <ul className="divide-y divide-a-border" aria-label={t('crm.integrations.tokens.title', 'API tokens')}>
              {tokens.map(token => (
                <li key={token.id} className="flex items-center gap-3 px-4 py-3">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${token.last_used_at ? 'bg-a-st-confirmed' : 'bg-a-border'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-a-text">{tokenTitle(token.label)}</p>
                    <p className="truncate text-xs text-a-text-2">
                      <Ago iso={token.last_used_at} never={t('crm.integrations.tokens.never_used', 'Never used')} />
                      {' · '}
                      {t('crm.integrations.tokens.made', 'Made {{day}}', { day: dayText(token.created_at, boot.venue.timezone, i18n.language) })}
                    </p>
                  </div>
                  <IconButton icon={Trash2} tone="danger" label={t('crm.integrations.tokens.revoke_named', 'Revoke {{name}}', { name: tokenTitle(token.label) })}
                    onClick={() => setRevoking(token)} />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>

      <IntakeGuide token={fresh} />

      {creating && (
        <NewTokenDialog existing={tokens} onClose={() => setCreating(false)}
          onMade={made => { setFresh(made.token); void qc.invalidateQueries({ queryKey: INTEGRATION_KEYS.tokens }) }} />
      )}
      {revoking && (
        <Confirm title={t('crm.integrations.tokens.revoke_title', 'Revoke {{name}}?', { name: tokenTitle(revoking.label) })}
          confirm={t('crm.integrations.tokens.revoke', 'Revoke')} busy={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.id)} onClose={() => setRevoking(null)}>
          {t('crm.integrations.tokens.revoke_line', 'Any system using it stops sending leads at once.')}
        </Confirm>
      )}
    </div>
  )
}

/** Make a token: its name first; then the token itself, shown this once with Copy. */
function NewTokenDialog({ existing, onClose, onMade }: { existing: IntakeToken[]; onClose: () => void; onMade: (made: CreatedToken) => void }) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [touched, setTouched] = useState(false)
  const [made, setMade] = useState<CreatedToken | null>(null)
  const [copy, copied] = useCopy()
  const problem = tokenLabelProblem(label, existing)
  const create = useMutation({
    mutationFn: () => integrationsApi.createToken(label.trim()),
    onSuccess: data => { setMade(data); onMade(data) },
  })
  const problemText = problem === 'required' ? t('crm.integrations.tokens.name_required', 'Give the token a name.')
    : problem === 'characters' ? t('crm.integrations.tokens.name_characters', 'Use letters, digits, spaces, _ - and . only.')
    : problem === 'too_long' ? t('crm.integrations.tokens.name_long', 'At most {{max}} characters.', { max: TOKEN_LABEL_MAX })
    : problem === 'taken' ? t('crm.integrations.errors.label_taken', 'You already have a token with this name.')
    : null

  if (made) {
    return (
      <Dialog title={t('crm.integrations.tokens.made_title', 'Copy your token')} onClose={onClose}>
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-a-st-pending">
            <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
            {t('crm.integrations.tokens.once', 'It is shown only now. Keep it on your server, never in a web page.')}
          </p>
          <CodeBlock label={t('crm.integrations.tokens.title', 'API tokens')}>{made.token}</CodeBlock>
          <div className="flex flex-wrap justify-end gap-2">
            <CopyButton text={made.token} copyKey="token" label={t('crm.integrations.copy', 'Copy')} copy={copy} copied={copied} />
            <Button onClick={onClose}>{t('crm.integrations.tokens.saved_it', 'Done')}</Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={t('crm.integrations.tokens.new', 'New token')} onClose={onClose} busy={create.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); setTouched(true); if (!problem) create.mutate() }}>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.integrations.tokens.name', 'Name')}</span>
          <TextInput value={label} maxLength={TOKEN_LABEL_MAX} autoFocus placeholder={t('crm.integrations.tokens.name_placeholder', 'e.g. Website form')}
            onChange={e => setLabel(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && problem !== null} />
          {touched && problemText && <Problem>{problemText}</Problem>}
          {create.error && <Problem>{integrationError(t, create.error)}</Problem>}
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={create.isPending} disabled={touched && problem !== null}>
            <KeyRound size={15} aria-hidden />{t('crm.integrations.tokens.make', 'Make token')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** The intake's guide: the address, the brands' ids, and the examples, each ready to copy. */
function IntakeGuide({ token }: { token: string | null }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const [snippet, setSnippet] = useState<Snippet>('curl')
  const [pasted, setPasted] = useState('')
  const [copy, copied] = useCopy()
  const brands: GuideBrand[] = (boot.brands ?? []).map(b => ({ id: b.id, name: b.name, is_default: b.is_default }))
  const endpoint = intakeEndpoint(typeof window === 'undefined' ? '' : window.location.origin)
  const shown = snippetToken(pasted.trim() !== '' ? pasted : token)
  const brandId = exampleBrandId(brands)

  const words: GuideWords = {
    title: t('crm.integrations.guide.doc_title', 'Send your website forms to HexaTech CRM'),
    intro: t('crm.integrations.guide.doc_intro', 'Each form sent becomes a lead. Give this to your developer, or paste it into an AI assistant.'),
    endpoint: t('crm.integrations.guide.doc_endpoint', 'Address'),
    replace: t('crm.integrations.guide.doc_replace', 'Replace YOUR_API_TOKEN with a token from Integrations → Lead intake. Keep it on your server, never in browser code.'),
    required: t('crm.integrations.guide.doc_required', 'Required'),
    optional: t('crm.integrations.guide.doc_optional', 'Optional'),
    fields: {
      source: t('crm.integrations.guide.f_source', 'a name for the form, e.g. "website_form"'),
      name: t('crm.integrations.guide.f_name', 'the person\'s name'),
      email: t('crm.integrations.guide.f_email', 'the person\'s email'),
      brand: t('crm.integrations.guide.f_brand', 'the brand the lead is for (ids below); left out, your default brand'),
      phone: t('crm.integrations.guide.f_phone', 'phone'),
      company: t('crm.integrations.guide.f_company', 'company'),
      position: t('crm.integrations.guide.f_position', 'job title'),
      description: t('crm.integrations.guide.f_description', 'the message'),
      amount: t('crm.integrations.guide.f_amount', 'an order\'s value; 0 and EUR when left out'),
      externalId: t('crm.integrations.guide.f_external_id', 'your own id for each sending: sent again, it returns the same lead'),
      submittedAt: t('crm.integrations.guide.f_submitted_at', 'when it was sent; now when left out'),
    },
    brands: t('crm.integrations.guide.doc_brands', 'Your brands'),
    noBrands: t('crm.integrations.guide.doc_no_brands', 'one brand: leave brand_id out'),
    defaultBrand: t('crm.integrations.guide.default', 'default'),
    example: t('crm.integrations.guide.doc_example', 'Example'),
    response: t('crm.integrations.guide.doc_response', 'Answer'),
    responseLine: t('crm.integrations.guide.doc_response_line', '201 Created, or 200 when the same external_id was sent before:'),
    notes: t('crm.integrations.guide.doc_notes', 'Good to know'),
    noteLimit: t('crm.integrations.guide.doc_limit', 'At most 60 requests a minute per token.'),
    noteHoneypot: t('crm.integrations.guide.doc_honeypot', 'Add a hidden "honeypot" field to the form and drop what fills it: that stops most bots.'),
    noteServer: t('crm.integrations.guide.doc_server', 'Never put the token in a web page: send the form to your own server, which adds the token (example below).'),
    web: t('crm.integrations.guide.doc_web', 'A whole website example (the form and the server)'),
  }
  const text = snippet === 'guide' ? guideText(words, endpoint, shown, brands) : snippet === 'curl' ? curlSnippet(endpoint, shown, brandId) : webSnippet(endpoint, brandId)

  const choices: { key: Snippet; icon: typeof FileText; label: string }[] = [
    { key: 'guide', icon: FileText, label: t('crm.integrations.guide.full', 'Full guide') },
    { key: 'curl', icon: Terminal, label: 'cURL' },
    { key: 'web', icon: Code2, label: t('crm.integrations.guide.web', 'Website form') },
  ]

  return (
    <Card title={t('crm.integrations.guide.title', 'Connect your website')} icon={BookOpen} tone="success"
      description={t('crm.integrations.guide.about', 'Copy an example, or the whole guide for a developer or an AI.')}>
      <div className="space-y-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-lg bg-a-st-confirmed/12 px-2 py-1 font-a-mono text-xs font-semibold text-a-st-confirmed">POST</span>
          <code className="min-w-0 flex-1 truncate font-a-mono text-sm text-a-text" title={endpoint}>{endpoint}</code>
          <CopyButton text={endpoint} copyKey="endpoint" label={t('crm.integrations.copy', 'Copy')} copy={copy} copied={copied} />
        </div>

        {brands.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t('crm.integrations.guide.brands', 'Brand ids')}>
            <span className="mr-1 text-xs font-medium text-a-text-2">brand_id</span>
            {brands.map(b => (
              <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full border border-a-border bg-a-surface-2 px-2.5 py-0.5 text-xs">
                <span className="font-a-mono font-semibold text-a-text">{b.id}</span>
                <span className="text-a-text-2">{b.name}{b.is_default ? ` · ${t('crm.integrations.guide.default', 'default')}` : ''}</span>
              </span>
            ))}
          </div>
        )}

        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-a-text-2">
            {t('crm.integrations.guide.token', 'Token in the examples')}
            <InfoTip text={t('crm.integrations.guide.token_tip', 'Only put into the text you copy: it is not saved or sent anywhere.')} />
          </span>
          <TextInput value={pasted} onChange={e => setPasted(e.target.value)}
            placeholder={token ? t('crm.integrations.guide.token_fresh', 'Your new token is in the examples') : 'YOUR_API_TOKEN'} />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('crm.integrations.guide.examples', 'Examples')} className="flex flex-wrap gap-1 rounded-xl border border-a-border bg-a-surface-2 p-1">
            {choices.map(({ key, icon: Icon, label }) => (
              <button key={key} type="button" aria-pressed={snippet === key} onClick={() => setSnippet(key)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${snippet === key ? 'bg-a-surface text-a-text shadow-a-sm' : 'text-a-text-2 hover:text-a-text'}`}>
                <Icon size={14} aria-hidden />{label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <CopyButton text={text} copyKey={snippet} variant="primary" copy={copy} copied={copied}
              label={snippet === 'guide' ? t('crm.integrations.guide.copy_guide', 'Copy guide') : t('crm.integrations.copy', 'Copy')} />
          </div>
        </div>
        <CodeBlock label={choices.find(c => c.key === snippet)?.label ?? ''} tall>{text}</CodeBlock>
      </div>
    </Card>
  )
}
