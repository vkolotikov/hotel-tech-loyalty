import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { Channel, DateKey, PostDetail, Slot, Template } from '../lib/types'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { usePanel } from '../panel/PanelProvider'
import { createBody, newForm } from '../panel/panelState'
import { Dialog } from '../ui/Dialog'
import { usualTimes } from './addMath'
import { startPost, templateDraft, writeInto, type TemplateFlow } from './templateFlow'

/**
 * "+ → From a template…" (spec 2026-10-16 §5.3): the brand's templates, each with Use (a new post on the day, filled with
 * it) and Write with AI (the same post is made, then the AI writes it following the template while the panel shows it).
 */
export function TemplatePicker({ day, templates, slots, channels, onClose }: {
  day: DateKey
  templates: Template[]
  slots: Slot[]
  channels: Channel[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panel = usePanel()
  const { strategy } = useActiveStrategy()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const industry = boot.organization.industry
  const draftFor = (template: Template) => templateDraft(day, template, slots, channels, industry, strategy?.pillars ?? [])
  const sub = (tpl: Template) =>
    [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : t('content.brand.templates.any_platform', 'Any platform'), tpl.pillar_name].filter(Boolean).join(' · ')

  const use = (template: Template) => { if (panel.openNew(draftFor(template))) onClose() }
  const writeAi = async (template: Template) => {
    const active = channels.filter(c => c.active).map(c => c.platform)
    const body = createBody(newForm(draftFor(template), boot.platforms, active, usualTimes(channels, industry)))
    const flow: TemplateFlow = {
      api,
      panel,
      keep: (post: PostDetail) => {
        queryClient.setQueryData(['content', brand, 'post', post.id], post)
        void refreshLists(queryClient, brand)
      },
    }
    setBusy(template.id)
    setError(null)
    try {
      const post = await startPost(flow, body)
      // The person kept the panel's unsaved edits: nothing was made, and the picker stays.
      if (post === null) {
        setBusy(null)
        return
      }
      onClose()
      void writeInto(flow, post.id, template.id)
    } catch (e) {
      const [key, text] = errorKey('save', failureOf(e).code)
      setError(t(key, text))
      setBusy(null)
    }
  }

  return (
    <Dialog title={t('content.templates.pick_title', 'Choose a template')} onClose={onClose} busy={busy !== null}>
      <div className="space-y-3">
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {templates.map(tpl => (
            <li key={tpl.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-a-border p-2.5">
              <div className="min-w-0 grow basis-40">
                <p className="truncate text-sm font-semibold text-a-text">{tpl.name}</p>
                <p className="truncate text-xs text-a-text-2">{sub(tpl)}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => use(tpl)}>{t('content.templates.use', 'Use')}</Button>
                <Button size="sm" variant="secondary" disabled={paused || busy !== null} loading={busy === tpl.id} onClick={() => { void writeAi(tpl) }}>
                  <Sparkles size={14} aria-hidden />{t('content.templates.write_ai', 'Write with AI')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {paused && <p className="text-xs text-a-text-2">{t('content.ai.error.ai_budget_used_up', "This month's AI budget is used up. Writing by hand still works.")}</p>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  )
}
