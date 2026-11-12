import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertCircle, CheckCircle2, CircleHelp, Link2, MessageCircle, MessageSquare, Plus, RefreshCw, Send, ShieldCheck, Stethoscope,
  TriangleAlert, Unplug, Webhook, XCircle,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { InfoTip } from '../ui/InfoTip'
import { ActionMenu } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { facebookLogin, loadFacebook } from './facebook'
import { INTEGRATION_KEYS, integrationError, integrationsApi } from './integrationsApi'
import {
  accountStatusKey, accountTone, canReconnect, checkTone, connectBody, isKnownCheck, pageChoices,
  type Diagnostic, type DiagnosticCheck, type MessengerAccount, type MessengerConfig, type PageOption,
} from './integrationsLogic'
import { Ago } from './parts'

/**
 * Channels (round 5): the Facebook Messenger pages whose messages arrive in the inbox — connect one through Facebook's
 * own login, check it, reconnect it when its token died, send a test message, disconnect — on the full admin's own
 * endpoints (`integrations/messenger*`, a manager's; the page token is the server's, kept encrypted and never shown).
 * WhatsApp has no inbox channel yet: the chat widget's WhatsApp button is where visitors reach the team on it.
 */
export function ChannelsTab() {
  return (
    <div className="space-y-4">
      <MessengerCard />
      <WhatsAppCard />
    </div>
  )
}

function MessengerCard() {
  const { t } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const config = useQuery({ queryKey: INTEGRATION_KEYS.messengerConfig, queryFn: integrationsApi.messengerConfig })
  const accounts = useQuery({ queryKey: INTEGRATION_KEYS.messenger, queryFn: integrationsApi.messengerAccounts })
  const list = accounts.data ?? []
  const [picking, setPicking] = useState<PageOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState<MessengerAccount | null>(null)
  const [leaving, setLeaving] = useState<MessengerAccount | null>(null)
  const ready = config.data?.configured === true

  const refresh = () => { void qc.invalidateQueries({ queryKey: INTEGRATION_KEYS.messenger }) }
  const put = (account: MessengerAccount) => qc.setQueryData<MessengerAccount[]>(INTEGRATION_KEYS.messenger, prev => [account, ...(prev ?? []).filter(a => a.id !== account.id)])

  /** Facebook's login, then the pages this person manages (the server exchanges the token). */
  const pagesFromFacebook = async (): Promise<PageOption[]> => {
    const cfg = config.data
    if (!cfg?.configured) throw new Error('not_configured')
    const fb = await loadFacebook(cfg.app_id, cfg.graph_version)
    const userToken = await facebookLogin(fb, cfg.required_scopes)
    return integrationsApi.listPages(userToken)
  }
  const sayFacebook = (error: unknown) => say(facebookError(t, error) ?? integrationError(t, error), 'danger')

  const startConnect = async () => {
    setBusy(true)
    try {
      const pages = await pagesFromFacebook()
      if (pages.length === 0) say(t('crm.integrations.messenger.no_pages', 'No page you manage with messaging access was found.'), 'danger')
      else setPicking(pageChoices(pages))
    } catch (error) {
      sayFacebook(error)
    } finally {
      setBusy(false)
    }
  }

  const connect = useMutation({
    mutationFn: (page: PageOption) => integrationsApi.connect(connectBody(page, boot.brand_id)),
    onSuccess: account => {
      put(account)
      setPicking(null)
      say(t('crm.integrations.messenger.connected', '{{name}} is connected. Its messages arrive in the inbox.', { name: account.display_name ?? account.external_id }))
    },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  const reconnect = async (account: MessengerAccount) => {
    setBusy(true)
    try {
      const pages = await pagesFromFacebook()
      const page = pages.find(p => p.id === account.external_id)
      if (!page) {
        say(t('crm.integrations.messenger.not_yours', 'This Facebook account does not manage {{name}}.', { name: account.display_name ?? account.external_id }), 'danger')
        return
      }
      put(await integrationsApi.reconnect(account.id, page.access_token))
      say(t('crm.integrations.messenger.reconnected', 'Reconnected.'))
    } catch (error) {
      sayFacebook(error)
    } finally {
      setBusy(false)
    }
  }

  const verify = useMutation({
    mutationFn: (account: MessengerAccount) => integrationsApi.verify(account.id),
    onSuccess: account => {
      put(account)
      say(account.status === 'active' ? t('crm.integrations.messenger.healthy', 'The page\'s connection works.') : t('crm.integrations.messenger.needs_reconnect', 'The page needs to be reconnected.'), account.status === 'active' ? 'success' : 'danger')
    },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  const resubscribe = useMutation({
    mutationFn: (account: MessengerAccount) => integrationsApi.resubscribe(account.id),
    onSuccess: () => { refresh(); say(t('crm.integrations.messenger.resubscribed', 'Messages are asked for again.')) },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  const simulate = useMutation({
    mutationFn: (account: MessengerAccount) => integrationsApi.simulate(account.id, t('crm.integrations.messenger.test_text', 'Test message from HexaTech CRM')),
    onSuccess: result => {
      refresh()
      void qc.invalidateQueries({ queryKey: ['crm', 'inbox'] })
      say(result.status === 'received' ? t('crm.integrations.messenger.test_received', 'Test message received: see the inbox.') : t('crm.integrations.messenger.test_duplicate', 'Already received. Send it again.'))
    },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  const disconnect = useMutation({
    mutationFn: (account: MessengerAccount) => integrationsApi.disconnect(account.id),
    onSuccess: (_data, account) => {
      qc.setQueryData<MessengerAccount[]>(INTEGRATION_KEYS.messenger, prev => (prev ?? []).filter(a => a.id !== account.id))
      setLeaving(null)
      say(t('crm.integrations.messenger.disconnected', 'Disconnected.'))
    },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  const connectButton = (
    <Button size="sm" onClick={() => { void startConnect() }} loading={busy && picking === null} disabled={!ready}>
      <Plus size={15} aria-hidden />{t('crm.integrations.messenger.connect', 'Connect a page')}
    </Button>
  )

  return (
    <Card padded={false} title={t('crm.integrations.messenger.title', 'Facebook Messenger')} icon={MessageCircle} tone="progress"
      description={t('crm.integrations.messenger.about', 'Messages to your Facebook page arrive in the inbox, where the assistant or your team answers.')}
      hint={list.length > 0 ? t('crm.integrations.messenger.count', '{{count}} connected', { count: list.length }) : undefined}
      action={(
        <>
          <IconButton icon={RefreshCw} size="sm" label={t('crm.integrations.refresh', 'Refresh')} onClick={() => { void config.refetch(); void accounts.refetch() }} />
          {list.length > 0 && ready && connectButton}
        </>
      )}>
      <QueryState loading={config.isLoading || accounts.isLoading} error={config.error ?? accounts.error} onRetry={() => { void config.refetch(); void accounts.refetch() }} rows={2}>
        {!ready && (
          <div className="p-4">
            <Notice tone="warning">{t('crm.integrations.messenger.not_ready', 'Messenger is not switched on for your account yet. Ask HexaTech support to switch it on.')}</Notice>
          </div>
        )}
        {list.length === 0 ? (
          ready && (
            <EmptyState icon={MessageCircle} title={t('crm.integrations.messenger.empty', 'No page connected')}
              line={t('crm.integrations.messenger.empty_line', 'You sign in with Facebook; we never see your password.')} action={connectButton} />
          )
        ) : (
          <ul className="divide-y divide-a-border" aria-label={t('crm.integrations.messenger.title', 'Facebook Messenger')}>
            {list.map(account => (
              <AccountRow key={account.id} account={account} config={config.data} busy={busy}
                onCheck={() => setChecking(account)}
                onVerify={() => verify.mutate(account)}
                onResubscribe={() => resubscribe.mutate(account)}
                onSimulate={() => simulate.mutate(account)}
                onReconnect={() => { void reconnect(account) }}
                onDisconnect={() => setLeaving(account)} />
            ))}
          </ul>
        )}
      </QueryState>

      {picking && (
        <Dialog title={t('crm.integrations.messenger.pick', 'Choose a page')} onClose={() => setPicking(null)} busy={connect.isPending}>
          <ul className="space-y-2">
            {picking.map(page => (
              <li key={page.id}>
                <button type="button" disabled={connect.isPending} onClick={() => connect.mutate(page)}
                  className="flex w-full items-center gap-3 rounded-xl border border-a-border bg-a-surface px-3 py-2.5 text-left transition-colors hover:border-a-accent/50 hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60">
                  <PageAvatar url={page.picture_url} name={page.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-a-text">{page.name}</span>
                    <span className="block truncate text-xs text-a-text-2">ID {page.id}</span>
                  </span>
                  {page.already_connected
                    ? <Pill tone="success"><CheckCircle2 size={12} aria-hidden />{t('crm.integrations.messenger.already', 'Connected')}</Pill>
                    : <Link2 size={16} aria-hidden className="shrink-0 text-a-accent-text" />}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {checking && <CheckPanel account={list.find(a => a.id === checking.id) ?? checking} config={config.data} onClose={() => setChecking(null)}
        onResubscribe={() => resubscribe.mutate(checking)} onSimulate={() => simulate.mutate(checking)} onReconnect={() => { void reconnect(checking) }} />}

      {leaving && (
        <Confirm title={t('crm.integrations.messenger.disconnect_title', 'Disconnect {{name}}?', { name: leaving.display_name ?? leaving.external_id })}
          confirm={t('crm.integrations.messenger.disconnect', 'Disconnect')} busy={disconnect.isPending}
          onConfirm={() => disconnect.mutate(leaving)} onClose={() => setLeaving(null)}>
          {t('crm.integrations.messenger.disconnect_line', 'New messages to this page stop arriving in the inbox. The chats you have stay.')}
        </Confirm>
      )}
    </Card>
  )
}

function AccountRow({ account, config, busy, onCheck, onVerify, onResubscribe, onSimulate, onReconnect, onDisconnect }: {
  account: MessengerAccount
  config: MessengerConfig | undefined
  busy: boolean
  onCheck: () => void
  onVerify: () => void
  onResubscribe: () => void
  onSimulate: () => void
  onReconnect: () => void
  onDisconnect: () => void
}) {
  const { t } = useTranslation()
  const name = account.display_name ?? account.external_id
  const reconnectable = canReconnect(account, config)
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <PageAvatar url={account.display_avatar_url} name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-a-text">{name}</p>
          <Pill tone={accountTone(account.status)}>{statusWord(t, account.status)}</Pill>
        </div>
        <p className="break-words text-xs text-a-text-2">
          {t('crm.integrations.messenger.last_message', 'Last message')}{' '}
          <Ago iso={account.last_webhook_at} never={t('crm.integrations.messenger.never', 'never')} />
          {' · '}ID {account.external_id}
        </p>
        {account.last_error && (
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-xs text-a-danger" title={account.last_error}>
            <AlertCircle size={13} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0">{t('crm.integrations.messenger.problem', 'Something needs attention: run Check.')}</span>
          </p>
        )}
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:ml-auto sm:w-auto">
        {reconnectable && (
          <Button size="sm" onClick={onReconnect} loading={busy}><RefreshCw size={14} aria-hidden />{t('crm.integrations.messenger.reconnect', 'Reconnect')}</Button>
        )}
        <Button size="sm" variant="secondary" onClick={onCheck}><Stethoscope size={14} aria-hidden />{t('crm.integrations.messenger.check', 'Check')}</Button>
        <ActionMenu label={t('crm.integrations.messenger.more', 'More for {{name}}', { name })} items={[
          { key: 'verify', icon: ShieldCheck, label: t('crm.integrations.messenger.verify', 'Test the connection'), onSelect: onVerify },
          { key: 'resubscribe', icon: Webhook, label: t('crm.integrations.messenger.resubscribe', 'Ask for messages again'), onSelect: onResubscribe },
          { key: 'simulate', icon: Send, label: t('crm.integrations.messenger.test', 'Send a test message'), onSelect: onSimulate },
          'divider',
          { key: 'disconnect', icon: Unplug, label: t('crm.integrations.messenger.disconnect', 'Disconnect'), danger: true, onSelect: onDisconnect },
        ]} />
      </div>
    </li>
  )
}

/** A page's check, in a panel over the page: each step in our words with its state; the server's details folded away. */
function CheckPanel({ account, config, onClose, onResubscribe, onSimulate, onReconnect }: {
  account: MessengerAccount
  config: MessengerConfig | undefined
  onClose: () => void
  onResubscribe: () => void
  onSimulate: () => void
  onReconnect: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const name = account.display_name ?? account.external_id
  const check = useQuery<Diagnostic>({
    queryKey: [...INTEGRATION_KEYS.messenger, 'check', account.id],
    queryFn: () => integrationsApi.diagnose(account.id).then(result => { void qc.invalidateQueries({ queryKey: INTEGRATION_KEYS.messenger }); return result }),
    staleTime: 0,
    gcTime: 0,
  })
  const failing = (check.data?.checks ?? []).filter(c => c.status !== 'ok').map(c => c.key)
  return (
    <SidePanel title={t('crm.integrations.messenger.check_title', 'Check {{name}}', { name })} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => { void check.refetch() }} loading={check.isFetching}><RefreshCw size={14} aria-hidden />{t('crm.integrations.messenger.check_again', 'Check again')}</Button>
          {canReconnect(account, config) && <Button size="sm" onClick={onReconnect}><RefreshCw size={14} aria-hidden />{t('crm.integrations.messenger.reconnect', 'Reconnect')}</Button>}
        </div>
      )}>
      <QueryState loading={check.isLoading} error={check.error} onRetry={() => { void check.refetch() }} rows={4}>
        <ol className="space-y-3">
          {(check.data?.checks ?? []).map(item => <CheckRow key={item.key} item={item} />)}
        </ol>
        {(failing.includes('subscription') || failing.includes('messages_field')) && (
          <div className="mt-4"><Button size="sm" onClick={onResubscribe}><Webhook size={14} aria-hidden />{t('crm.integrations.messenger.resubscribe', 'Ask for messages again')}</Button></div>
        )}
        {failing.includes('webhook_activity') && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onSimulate}><Send size={14} aria-hidden />{t('crm.integrations.messenger.test', 'Send a test message')}</Button>
            <InfoTip text={t('crm.integrations.messenger.test_tip', 'A made-up message goes through the inbox and the assistant, without Facebook: it shows the rest works.')} />
          </div>
        )}
      </QueryState>
    </SidePanel>
  )
}

function CheckRow({ item }: { item: DiagnosticCheck }) {
  const { t } = useTranslation()
  const tone = checkTone(item.status)
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'pending' ? TriangleAlert : CircleHelp
  const ink = tone === 'success' ? 'text-a-st-confirmed' : tone === 'danger' ? 'text-a-danger' : tone === 'pending' ? 'text-a-st-pending' : 'text-a-text-2'
  return (
    <li className="rounded-xl border border-a-border bg-a-surface-2/50 p-3">
      <div className="flex items-start gap-2.5">
        <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${ink}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-a-text">{checkName(t, item)}</p>
          <p className={`text-xs ${ink}`}>{checkWord(t, item.status)}</p>
          {(item.detail || item.fix) && (
            <details className="mt-1.5 text-xs text-a-text-2">
              <summary className="cursor-pointer select-none text-a-accent-text">{t('crm.integrations.messenger.details', 'Details')}</summary>
              <p className="mt-1 whitespace-pre-line break-words">{item.detail}</p>
              {item.fix && <p className="mt-1 whitespace-pre-line break-words">{item.fix}</p>}
            </details>
          )}
        </div>
      </div>
    </li>
  )
}

function WhatsAppCard() {
  const { t } = useTranslation()
  return (
    <Card title={t('crm.integrations.whatsapp.title', 'WhatsApp')} icon={MessageSquare} tone="success"
      description={t('crm.integrations.whatsapp.about', 'WhatsApp messages do not arrive in the inbox yet. The chat widget can hand visitors to your WhatsApp number.')}
      hint={<Pill tone="neutral">{t('crm.integrations.whatsapp.soon', 'Inbox: not yet')}</Pill>}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.integrations.whatsapp.line', 'Visitors tap WhatsApp in the chat to reach your team.')}</p>
        <Link to="/crm/widget?tab=behaviour"
          className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
          <MessageSquare size={14} aria-hidden />{t('crm.integrations.whatsapp.set', 'Set the number')}
        </Link>
      </div>
    </Card>
  )
}

function PageAvatar({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false)
  if (url && !broken) {
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-xl bg-a-surface-2 object-cover" title={name} />
  }
  return <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-a-st-progress/12 text-a-st-progress"><MessageCircle size={18} /></span>
}

function statusWord(t: TFunction, status: string): string {
  switch (accountStatusKey(status)) {
    case 'active': return t('crm.integrations.messenger.status.active', 'Working')
    case 'reauth_required': return t('crm.integrations.messenger.status.reauth_required', 'Reconnect')
    case 'disconnected': return t('crm.integrations.messenger.status.disconnected', 'Disconnected')
    default: return status
  }
}

function checkName(t: TFunction, item: DiagnosticCheck): string {
  if (!isKnownCheck(item.key)) return item.label
  switch (item.key) {
    case 'token': return t('crm.integrations.messenger.checks.token', 'The page\'s connection')
    case 'subscription': return t('crm.integrations.messenger.checks.subscription', 'Facebook sends us its messages')
    case 'messages_field': return t('crm.integrations.messenger.checks.messages_field', 'New messages included')
    case 'webhook_activity': return t('crm.integrations.messenger.checks.webhook_activity', 'Messages arriving')
    default: return item.label
  }
}

function checkWord(t: TFunction, status: string): string {
  switch (status) {
    case 'ok': return t('crm.integrations.messenger.state.ok', 'Fine')
    case 'fail': return t('crm.integrations.messenger.state.fail', 'Not working')
    case 'warn': return t('crm.integrations.messenger.state.warn', 'Worth a look')
    default: return t('crm.integrations.messenger.state.unknown', 'Could not tell')
  }
}

/** Facebook's own failures in our words (the SDK did not load, the person closed the login); null for a server refusal. */
function facebookError(t: TFunction, error: unknown): string | null {
  const reason = error instanceof Error ? error.message : ''
  if (reason === 'cancelled') return t('crm.integrations.messenger.fb_cancelled', 'Facebook login was closed before it finished.')
  if (reason === 'sdk_load' || reason === 'sdk_missing' || reason === 'sdk_init') return t('crm.integrations.messenger.fb_blocked', 'Facebook could not be opened. An ad blocker may be stopping it.')
  if (reason === 'not_configured') return t('crm.integrations.messenger.not_ready', 'Messenger is not switched on for your account yet. Ask HexaTech support to switch it on.')
  return null
}
