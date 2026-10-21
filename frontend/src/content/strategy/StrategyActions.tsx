import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { StrategySummary } from '../lib/types'
import { Dialog } from '../../workspace/ui/Dialog'
import { strategyTitle, type Generation } from './strategyMath'

const STATUS_TEXT: Record<StrategySummary['status'], string> = {
  generating: 'Being made', active: 'Active', superseded: 'Replaced', archived: 'Archived', failed: 'Failed',
}

/** "Make a new strategy": what will happen, optional instructions, and the start (spec §4.5). */
export function NewStrategyDialog({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.createStrategy(instructions.trim() === '' ? null : instructions.trim())
      onStarted()
    } catch (e) {
      const [key, text] = errorKey('strategy', failureOf(e).code)
      setError(t(key, text))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('content.strategy.new_title', 'Make a new strategy')} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <p className="text-sm text-a-text-2">{t('content.strategy.new_intro', 'The AI reads the brand and writes a new strategy. It usually takes one to three minutes; you can leave this page meanwhile.')}</p>
        <p className="text-sm text-a-text-2">{t('content.strategy.new_replaces', 'When it is ready it becomes the active strategy; the current one stays among the past strategies.')}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.strategy.instructions', 'Instructions for the AI (optional)')}</span>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} rows={4}
            className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
          <Button onClick={() => { void start() }} loading={busy}>{t('content.strategy.make', 'Make strategy')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * The managers' strategy actions (spec §4.5): make a new one (not while one
 * is being made, nor with the month's AI budget used up), choose a past one
 * to read, make the shown one active, archive it.
 */
export function StrategyActions({ shown, strategies, generation }: { shown: StrategySummary | null; strategies: StrategySummary[]; generation: Generation }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const paused = boot.ai.status === 'over'
  // A strategy is made from the brand: none until the brand has a profile.
  const noProfile = boot.profile === null

  const reread = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategies'] })
    await queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategy'] })
    void refreshLists(queryClient, brand) // pillar names on the Plan and Posts
  }

  const act = async (kind: 'activate' | 'archive', strategy: StrategySummary) => {
    if (kind === 'archive' && !window.confirm(t('content.strategy.archive_confirm', 'Archive this strategy? Its pillars stop being offered for posts.'))) return
    setBusy(true)
    setNote(null)
    try {
      await (kind === 'activate' ? api.activateStrategy(strategy.id) : api.archiveStrategy(strategy.id))
      await reread()
      setNote({ tone: 'success', text: kind === 'activate' ? t('content.strategy.activated', 'This strategy is now active.') : t('content.strategy.archived', 'Strategy archived.') })
      if (kind === 'activate') navigate('/content/strategy', { replace: true })
    } catch (e) {
      const [key, text] = errorKey('strategy', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    } finally {
      setBusy(false)
    }
  }

  const finished = strategies.filter(s => s.status !== 'generating')
  return (
    <>
      {finished.length > 1 && (
        <select aria-label={t('content.strategy.past', 'Past strategies')} value={shown?.id ?? ''}
          onChange={(e) => navigate(`/content/strategy?id=${e.target.value}`)}
          className="max-w-[16rem] rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text">
          {finished.map(s => (
            <option key={s.id} value={s.id}>{strategyTitle(s, t)} · {t(`content.strategy.status.${s.status}`, STATUS_TEXT[s.status])}</option>
          ))}
        </select>
      )}
      {shown && (shown.status === 'superseded' || shown.status === 'archived') && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void act('activate', shown) }}>
          <CheckCircle2 size={14} aria-hidden />{t('content.strategy.activate', 'Make active')}
        </Button>
      )}
      {shown && (shown.status === 'active' || shown.status === 'superseded') && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void act('archive', shown) }}>
          <Archive size={14} aria-hidden />{t('content.strategy.archive', 'Archive')}
        </Button>
      )}
      <Button size="sm" disabled={paused || noProfile || generation.state === 'running'} onClick={() => setDialog(true)}>
        <Sparkles size={14} aria-hidden />{t('content.strategy.new', 'New strategy')}
      </Button>
      {note && <p role="status" className={`basis-full text-right text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</p>}
      {paused && <p className="basis-full text-right text-xs text-a-text-2">{t('content.strategy.error.ai_budget_used_up', "This month's AI budget is used up.")}</p>}
      {noProfile && <p className="basis-full text-right text-xs text-a-text-2">{t('content.strategy.error.no_profile', 'Set up the brand first: the strategy is made from it.')}</p>}
      {dialog && (
        <NewStrategyDialog onClose={() => setDialog(false)}
          onStarted={() => { setDialog(false); void queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategies'] }); navigate('/content/strategy', { replace: true }) }} />
      )}
    </>
  )
}
