import { useState } from 'react'
import { useRetainedState } from '../drafts/useRetainedState'
import { useTranslation } from 'react-i18next'
import { Download, ImagePlus, Images, PenLine, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { useContentWork } from '../work/useContentWork'
import { WorkStatus } from '../work/WorkStatus'
import { usePanel } from './PanelProvider'
import { resolveImage } from '../../lib/api'
import { errorKey } from '../lib/errors'
import type { PostDetail, Rewrite } from '../lib/types'
import { BRIEF_TEXT, REWRITE_TEXT } from './panelState'

type AiAction = 'write' | 'rewrite' | 'quality' | 'brief' | 'image'
const BRIEF_FIELDS = Object.keys(BRIEF_TEXT) as (keyof typeof BRIEF_TEXT)[]
const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * AI on this post (spec §4.3), for every staff member: write the text, the
 * five rewrites with an optional guidance line, the quality score, the
 * visual brief and the image. The tools that write into the post wait while
 * it has unsaved edits (they would overwrite them); a rewrite only offers
 * text to use, so it does not. With the month's budget used up, all wait.
 */
export function AiTools({ post, dirty, onPost, onUseCopy, outside = null, onOutsideSeen }: {
  post: PostDetail
  dirty: boolean
  /** The post the server answered with (write, quality, brief, image change it). */
  onPost: (post: PostDetail) => void
  /** Put a rewrite into the text field, as an unsaved edit. */
  onUseCopy: (copy: string) => void
  /** The AI writing this post from elsewhere ("Write with AI" from a template, spec 2026-10-16 §5.3): working, or the refusal's code. */
  outside?: { failed: string | null } | null
  /** That write is forgotten once the person uses a tool here. */
  onOutsideSeen?: () => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const panel = usePanel()
  const state = useContentWork(`post:${post.id}`, post.id, work => {
    if (work.result?.variation) return
    const owns = panel.capture()
    void api.post(post.id).then(answer => { if (owns()) onPost(answer.post) }, () => undefined)
  })
  const busy = state.busy ? state.action ?? 'write' : null
  const [guidance, setGuidance] = useRetainedState(`work-guidance:${post.id}`, '', false)
  const [kind, setKind] = useRetainedState<Rewrite>(`work-kind:${post.id}`, boot.rewrites[0] ?? 'shorter', false)
  const [usedVariation, setUsedVariation] = useState<number | null>(null)
  const variation = state.work?.result?.variation && state.work.result.variation.id !== usedVariation ? state.work.result.variation : null
  const paused = boot.ai.status === 'over'
  const note = guidance.trim() === '' ? null : guidance.trim()
  const working = outside !== null && outside.failed === null
  const writes = dirty || paused || busy !== null || working || state.uncertain
  const [outsideKey, outsideText] = errorKey('ai', outside?.failed ?? 'unknown')
  const shownError = outside?.failed ? t(outsideKey, outsideText) : null

  const run = (action: AiAction) => {
    if (outside?.failed) onOutsideSeen?.()
    void state.start({ action, post_id: post.id, ...(action === 'rewrite' ? { type: kind, guidance: note } : { instructions: note }) })
  }

  const quality = post.quality
  const brief = post.visual_brief
  const image = brief?.image_status === 'ready' ? resolveImage(brief.image_url) : null

  return (
    <section aria-labelledby="content-ai-title" className="space-y-3 rounded-xl border border-a-border bg-a-canvas/50 p-3">
      <h3 id="content-ai-title" className="flex items-center gap-2 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
        <Sparkles size={14} aria-hidden />{t('content.panel.ai.title', 'AI')}
      </h3>
      {paused && <Notice tone="warning">{t('content.ai.error.ai_budget_used_up', "This month's AI budget is used up. Writing by hand still works.")}</Notice>}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.ai.guidance', 'Guidance for the AI (optional)')}</span>
        <input value={guidance} onChange={(e) => setGuidance(e.target.value)} maxLength={1000} className={INPUT} />
      </label>
      {dirty && !paused && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'write'} onClick={() => { run('write') }}>
          <PenLine size={14} aria-hidden />{t('content.panel.ai.write', 'Write the text')}
        </Button>
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'quality'} onClick={() => { run('quality') }}>
          <Wand2 size={14} aria-hidden />{t('content.panel.ai.quality', 'Check quality')}
        </Button>
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'brief'} onClick={() => { run('brief') }}>
          <Images size={14} aria-hidden />{t('content.panel.ai.brief', 'Visual brief')}
        </Button>
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'image'} onClick={() => { run('image') }}>
          <ImagePlus size={14} aria-hidden />{image ? t('content.panel.ai.new_image', 'New image') : t('content.panel.ai.image', 'Create image')}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.ai.rewrite_kind', 'Kind of rewrite')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Rewrite)} className={INPUT}>
            {boot.rewrites.map(r => <option key={r} value={r}>{t(`content.panel.ai.rewrite_type.${r}`, REWRITE_TEXT[r])}</option>)}
          </select>
        </label>
        <Button size="sm" variant="secondary" disabled={paused || busy !== null || working || state.uncertain} loading={busy === 'rewrite'}
          onClick={() => { run('rewrite') }}>
          {t('content.panel.ai.rewrite', 'Rewrite')}
        </Button>
      </div>
      {(busy !== null || working) && <p role="status" className="text-xs text-a-text-2">{t('content.panel.ai.working', 'The AI is working…')}</p>}
      <WorkStatus state={state} />
      {shownError && <Notice tone="danger">{shownError}</Notice>}
      {variation && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface p-3">
          <p className="whitespace-pre-wrap text-sm text-a-text">{variation.copy}</p>
          <Button size="sm" variant="ghost" onClick={() => { onUseCopy(variation.copy); setUsedVariation(variation.id) }}>{t('content.panel.ai.use', 'Use this text')}</Button>
        </div>
      )}
      {quality && (
        <div data-quality="" className="space-y-1.5 rounded-lg border border-a-border bg-a-surface p-3">
          {typeof quality.overall === 'number' && (
            <p className="text-sm font-semibold text-a-text">{t('content.panel.ai.score', 'Score: {{score}} of 10', { score: Math.round(quality.overall * 10) / 10 })}</p>
          )}
          {quality.verdict && <p className="text-sm text-a-text-2">{quality.verdict}</p>}
          {(quality.improvements ?? []).length > 0 && (
            <>
              <p className="pt-1 text-xs font-medium text-a-text-2">{t('content.panel.ai.improvements', 'How to improve it')}</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-a-text">
                {quality.improvements.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {brief && (
        <div data-brief="" className="space-y-2 rounded-lg border border-a-border bg-a-surface p-3">
          <p className="text-xs font-medium text-a-text-2">{t('content.panel.ai.brief', 'Visual brief')}</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            {BRIEF_FIELDS.filter(field => brief[field]).map(field => (
              <div key={field} className="contents">
                <dt className="text-a-text-2">{t(`content.panel.ai.brief_field.${field}`, BRIEF_TEXT[field])}</dt>
                <dd className="text-a-text">{brief[field]}</dd>
              </div>
            ))}
          </dl>
          {image && (
            <div className="space-y-2">
              <img src={image} alt={t('content.panel.ai.image_alt', 'Image for this post')} className="w-full rounded-lg border border-a-border" />
              <a href={image} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-a-accent-text hover:underline">
                <Download size={14} aria-hidden />{t('content.launch.open_asset', 'Open asset')}
              </a>
            </div>
          )}
          {brief.image_status === 'failed' && <p className="text-sm text-a-danger">{t('content.panel.ai.image_failed', 'The image could not be created.')}</p>}
        </div>
      )}
    </section>
  )
}
