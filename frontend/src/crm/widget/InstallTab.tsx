import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Code2, Copy, Globe, KeyRound, RefreshCw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { EMBED_KEY, builderSteps, shortKey, type EmbedCode } from './embed'

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
 * site builders, the widget key, and a new API key for custom integrations (a manager's).
 */
export function InstallTab({ active, canManage }: { active: boolean; canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [copied, copy] = useCopy()
  const [confirming, setConfirming] = useState(false)
  const embed = useQuery({ queryKey: EMBED_KEY, queryFn: () => get<EmbedCode>('widget-config/embed-code') })
  const regenerate = useMutation({
    mutationFn: () => send('post', 'widget-config/regenerate-key'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'widget'] })
      setConfirming(false)
      say(t('crm.widget.install.regenerated', 'A new API key was made. Your website code is unchanged.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const copyIcon = (what: string) => (copied === what ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />)

  return (
    <QueryState loading={embed.isLoading} error={embed.error} onRetry={() => { void embed.refetch() }}>
      {embed.data && (
        <div className="space-y-5">
          {!active && <Notice tone="warning">{t('crm.widget.install.off', 'The chat is switched off in Look, so the code shows nothing yet.')}</Notice>}
          <Card title={t('crm.widget.install.code_title', 'Your code')} icon={Code2}
            action={<Button size="sm" onClick={() => copy('script', embed.data.embed_code)}>{copyIcon('script')}{t('crm.common.copy', 'Copy')}</Button>}>
            <div className="space-y-3">
              <p className="text-sm text-a-text-2">{t('crm.widget.install.code_line', 'Paste this once into your website, just before </body>. The chat then shows on every page.')}</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-a-surface-2 p-3 font-a-mono text-xs text-a-text">{embed.data.embed_code}</pre>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-a-accent-text">{t('crm.widget.install.iframe', 'Your site does not allow scripts? Use a frame instead')}</summary>
                <div className="mt-2 space-y-2">
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl bg-a-surface-2 p-3 font-a-mono text-xs text-a-text">{embed.data.iframe_code}</pre>
                  <Button variant="secondary" size="sm" onClick={() => copy('iframe', embed.data.iframe_code)}>{copyIcon('iframe')}{t('crm.widget.install.copy_frame', 'Copy the frame')}</Button>
                </div>
              </details>
            </div>
          </Card>

          <Card title={t('crm.widget.install.where_title', 'Where to paste it')} icon={Globe} padded={false}>
            <ul className="divide-y divide-a-border">
              {builderSteps(t).map(builder => (
                <li key={builder.key} className="px-4 py-3">
                  <p className="text-sm font-medium text-a-text">{builder.name}</p>
                  <p className="text-sm text-a-text-2">{builder.steps}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('crm.widget.install.keys_title', 'Keys')} icon={KeyRound}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-a-text-2">{t('crm.widget.install.widget_key', 'Widget key')}</span>
                <code className="rounded-lg bg-a-surface-2 px-2 py-1 font-a-mono text-xs text-a-text">{shortKey(embed.data.widget_key)}</code>
                <Button variant="ghost" size="sm" onClick={() => copy('key', embed.data.widget_key)}>{copyIcon('key')}{t('crm.common.copy', 'Copy')}</Button>
                <Pill tone={active ? 'success' : 'neutral'}>{active ? t('crm.widget.install.on', 'Chat on') : t('crm.widget.install.is_off', 'Chat off')}</Pill>
              </div>
              <p className="text-xs text-a-text-2">{t('crm.widget.install.key_line', 'The code above contains this key; it never changes, so the code keeps working.')}</p>
              {canManage && (
                <div className="flex flex-wrap items-center gap-3 border-t border-a-border pt-3">
                  <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.widget.install.api_line', 'For a custom integration, you can replace the widget\'s API key.')}</p>
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}><RefreshCw size={14} aria-hidden />{t('crm.widget.install.regenerate', 'Make a new API key')}</Button>
                </div>
              )}
            </div>
          </Card>

          {confirming && (
            <Confirm title={t('crm.widget.install.regenerate_title', 'Make a new API key?')} confirm={t('crm.widget.install.regenerate', 'Make a new API key')} danger={false}
              busy={regenerate.isPending} onConfirm={() => regenerate.mutate()} onClose={() => setConfirming(false)}>
              {t('crm.widget.install.regenerate_line', 'The widget\'s API key is replaced by a new one. The code on your website is not affected: it uses the widget key, which stays the same.')}
            </Confirm>
          )}
        </div>
      )}
    </QueryState>
  )
}
