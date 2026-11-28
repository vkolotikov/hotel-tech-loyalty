import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Code2, Copy, Globe, KeyRound, RefreshCw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { InfoTip } from '../ui/InfoTip'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { BUILDERS, EMBED_KEY, builderSteps, shortKey, type Builder, type EmbedCode } from './embed'
import { Disclosure } from './parts'
import { WIDGET_KEY } from './tabs'
import type { WidgetConfig } from './widgetForm'

/** Copy a text, and say so; a browser that refuses says that instead. */
function useCopy(): [string | null, (what: string, text: string) => void] {
  const { t } = useTranslation()
  const say = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => { setCopied(what); say(t('crm.common.copied', 'Copied')); window.setTimeout(() => setCopied(c => (c === what ? null : c)), 2000) },
      () => say(t('crm.widget.install.copy_failed', 'The browser did not allow copying. Select the code and copy it by hand.'), 'danger'),
    )
  }
  return [copied, copy]
}

/**
 * Putting the chat on the website (widget-config/embed-code): the code to paste with Copy, where it goes on the common
 * site builders, and the keys — a manager may replace the public widget key (round 2: rotate-widget-key; the website's
 * current code stops working until the new one is pasted) and, under More options, the private API key for custom
 * integrations (regenerate-key; the website is not affected).
 */
export function InstallTab({ active, canManage }: { active: boolean; canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [copied, copy] = useCopy()
  const [confirming, setConfirming] = useState<'widget' | 'api' | null>(null)
  const [rotated, setRotated] = useState(false)
  const [builder, setBuilder] = useState<Builder>(BUILDERS[0])
  const embed = useQuery({ queryKey: EMBED_KEY, queryFn: () => get<EmbedCode>('widget-config/embed-code') })
  const rotate = useMutation({
    mutationFn: () => send<WidgetConfig>('post', 'widget-config/rotate-widget-key'),
    onSuccess: data => {
      if (data && typeof data === 'object') qc.setQueryData(WIDGET_KEY, data)
      void qc.invalidateQueries({ queryKey: EMBED_KEY })
      void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
      setConfirming(null)
      setRotated(true)
      say(t('crm.widget.install.rotated', 'New widget key made. Paste the new code into your website now.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const regenerate = useMutation({
    mutationFn: () => send('post', 'widget-config/regenerate-key'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'widget'] })
      setConfirming(null)
      say(t('crm.widget.install.regenerated', 'A new API key was made. Your website code is unchanged.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const copyIcon = (what: string) => (copied === what ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />)
  const builders = builderSteps(t)
  const chosen = builders.find(b => b.key === builder) ?? builders[0]

  return (
    <QueryState loading={embed.isLoading} error={embed.error} onRetry={() => { void embed.refetch() }}>
      {embed.data && (
        <div className="space-y-5">
          {!active && <Notice tone="warning">{t('crm.widget.install.off', 'The chat is switched off in Look, so the code shows nothing yet.')}</Notice>}
          {rotated && (
            <Notice tone="warning">
              <span className="flex items-start gap-2"><AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0" />{t('crm.widget.install.rotated_note', 'The widget key was replaced. Until you paste the code below into your website, the chat does not show there.')}</span>
            </Notice>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3" title={t('crm.widget.install.code_title', 'Your code')} icon={Code2} tone="accent"
              description={t('crm.widget.install.code_line', 'Paste this once into your website, just before </body>. The chat then shows on every page.')}
              action={<Button size="sm" onClick={() => copy('script', embed.data.embed_code)}>{copyIcon('script')}{t('crm.widget.install.copy_code', 'Copy the code')}</Button>}>
              <div className="space-y-3">
                <p className="text-sm text-a-text-2">{t('crm.widget.install.code_short', 'Paste once, just before </body>.')}</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-a-border bg-a-surface-2 p-3 font-a-mono text-xs text-a-text">{embed.data.embed_code}</pre>
                <Disclosure label={t('crm.widget.install.iframe', 'Your site does not allow scripts? Use a frame instead')}>
                  <div className="space-y-2">
                    <pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl bg-a-surface-2 p-3 font-a-mono text-xs text-a-text">{embed.data.iframe_code}</pre>
                    <Button variant="secondary" size="sm" onClick={() => copy('iframe', embed.data.iframe_code)}>{copyIcon('iframe')}{t('crm.widget.install.copy_frame', 'Copy the frame')}</Button>
                  </div>
                </Disclosure>
              </div>
            </Card>

            <Card className="lg:col-span-2" title={t('crm.widget.install.keys_title', 'Keys')} icon={KeyRound} tone="neutral"
              description={`${t('crm.widget.install.keys_line', 'What the code uses to find your chat.')} ${t('crm.widget.install.key_line', 'The code contains this key. It stays the same unless you replace it.')}`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-a-text-2">{t('crm.widget.install.widget_key', 'Widget key')}</span>
                  <code className="rounded-lg bg-a-surface-2 px-2 py-1 font-a-mono text-xs text-a-text">{shortKey(embed.data.widget_key)}</code>
                  <Button variant="ghost" size="sm" onClick={() => copy('key', embed.data.widget_key)} aria-label={t('crm.widget.install.copy_key', 'Copy the widget key')}>{copyIcon('key')}{t('crm.common.copy', 'Copy')}</Button>
                  <Pill tone={active ? 'success' : 'neutral'}>{active ? t('crm.widget.install.on', 'Chat on') : t('crm.widget.install.is_off', 'Chat off')}</Pill>
                </div>
                {canManage && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-a-border pt-3">
                      <Button variant="secondary" size="sm" onClick={() => setConfirming('widget')}><RefreshCw size={14} aria-hidden />{t('crm.widget.install.rotate', 'Replace the widget key')}</Button>
                      <InfoTip text={`${t('crm.widget.install.rotate_title', 'Key misused on another site?')} ${t('crm.widget.install.rotate_line', 'Replace it. The code on your website then stops working until you paste the new code.')}`} />
                    </div>
                    <Disclosure label={t('crm.widget.install.more', 'More options')}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => setConfirming('api')}><RefreshCw size={14} aria-hidden />{t('crm.widget.install.regenerate', 'Make a new API key')}</Button>
                        <InfoTip text={t('crm.widget.install.api_line', 'For a custom integration, you can replace the widget\'s API key. Your website code is not affected.')} />
                      </div>
                    </Disclosure>
                  </>
                )}
              </div>
            </Card>
          </div>

          <Card title={t('crm.widget.install.where_title', 'Where to paste it')} icon={Globe} tone="progress"
            description={t('crm.widget.install.where_line', 'Pick how your website is made.')}>
            <div className="space-y-3">
              <Tabs label={t('crm.widget.install.builders', 'Website builder')} value={builder} onChange={setBuilder}
                items={builders.map(b => ({ key: b.key, label: b.name }))} />
              <p className="rounded-xl border border-a-border bg-a-surface-2 px-3 py-2.5 text-sm text-a-text">{chosen.steps}</p>
            </div>
          </Card>

          {confirming === 'widget' && (
            <Confirm title={t('crm.widget.install.rotate_confirm_title', 'Replace the widget key?')} confirm={t('crm.widget.install.rotate', 'Replace the widget key')}
              busy={rotate.isPending} onConfirm={() => rotate.mutate()} onClose={() => setConfirming(null)}>
              <span className="block space-y-2">
                <span className="block font-medium text-a-text">{t('crm.widget.install.rotate_confirm_warn', 'The chat disappears from your website at once.')}</span>
                <span className="block">{t('crm.widget.install.rotate_confirm_line', 'The code on your website stops working as soon as the key is replaced. The chat shows again once you paste the new code there. Do this only if the key was misused.')}</span>
              </span>
            </Confirm>
          )}
          {confirming === 'api' && (
            <Confirm title={t('crm.widget.install.regenerate_title', 'Make a new API key?')} confirm={t('crm.widget.install.regenerate', 'Make a new API key')} danger={false}
              busy={regenerate.isPending} onConfirm={() => regenerate.mutate()} onClose={() => setConfirming(null)}>
              {t('crm.widget.install.regenerate_line', 'The widget\'s API key is replaced by a new one. The code on your website is not affected: it uses the widget key, which stays the same.')}
            </Confirm>
          )}
        </div>
      )}
    </QueryState>
  )
}
