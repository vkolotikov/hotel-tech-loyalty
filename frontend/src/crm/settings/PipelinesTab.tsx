import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Columns3, Flag, Pencil, Plus, Star, Trash2, Trophy, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { TextArea, TextInput } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { reorderIds } from './lists'
import { Dot, IconButton, Problem, ReadOnlyNote } from './parts'
import {
  KINDS, PIPELINE_LIMITS, STAGE_COLOURS, fallbackStage, kindsFor, onlyOfKind, pipelineDeleteBlock, sortedStages, stageForm,
  stagePayload, stageProblems, type Pipeline, type Stage, type StageForm, type StageKind,
} from './pipelines'
import { LostReasonsCard } from './LostReasons'

const PIPELINES_KEY = ['crm', 'settings', 'pipelines'] as const

/** After a change to pipelines or stages: this list, the board, the leads, and the setup step. */
function pipelinesChanged(qc: QueryClient): void {
  for (const key of [PIPELINES_KEY, ['crm', 'pipeline'], ['crm', 'leads'], ['crm', 'start'], ['crm', 'bootstrap']]) void qc.invalidateQueries({ queryKey: key })
}

/**
 * Pipelines (pipelines, pipeline-stages): the stages a lead goes through, per pipeline — add, rename, recolour,
 * reorder, set what a stage means (open, won, lost) and its usual chance of winning; one pipeline is the default for
 * new leads. Then the reasons a lead is lost. A manager's to change (`staff.can.manage_pipelines`).
 */
export function PipelinesTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const pipelines = useQuery({ queryKey: PIPELINES_KEY, queryFn: () => get<Pipeline[]>('pipelines') })
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.settings.pipelines.line', 'The stages a lead goes through, from first contact to won or lost.')}</p>
        {canManage && <Button variant="secondary" onClick={() => setCreating(true)}><Plus size={15} aria-hidden />{t('crm.settings.pipelines.add', 'Add a pipeline')}</Button>}
      </div>
      {!canManage && <ReadOnlyNote />}
      <QueryState loading={pipelines.isLoading} error={pipelines.error} onRetry={() => { void pipelines.refetch() }}>
        {(pipelines.data ?? []).length === 0 ? (
          <Card>
            <EmptyState icon={Columns3} title={t('crm.settings.pipelines.empty', 'No pipeline yet')}
              line={t('crm.settings.pipelines.empty_line', 'A new pipeline starts with eight stages you can rename, reorder or delete.')}
              action={canManage ? <Button onClick={() => setCreating(true)}><Plus size={15} aria-hidden />{t('crm.settings.pipelines.add', 'Add a pipeline')}</Button> : undefined} />
          </Card>
        ) : (
          <div className="space-y-4">
            {(pipelines.data ?? []).map(p => <PipelineCard key={p.id} pipeline={p} canManage={canManage} />)}
          </div>
        )}
      </QueryState>
      <LostReasonsCard canManage={canManage} />
      {creating && <PipelineDialog pipeline={null} onClose={() => setCreating(false)} />}
    </div>
  )
}

function KindPill({ kind }: { kind: StageKind }) {
  const { t } = useTranslation()
  if (kind === 'won') return <Pill tone="success"><Trophy size={12} aria-hidden />{t('crm.status.won', 'Won')}</Pill>
  if (kind === 'lost') return <Pill tone="danger"><X size={12} aria-hidden />{t('crm.status.lost', 'Lost')}</Pill>
  return <Pill tone="progress"><Flag size={12} aria-hidden />{t('crm.status.open', 'Open')}</Pill>
}

function PipelineCard({ pipeline, canManage }: { pipeline: Pipeline; canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const stages = sortedStages(pipeline.stages ?? [])
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<Stage | 'new' | null>(null)
  const [removing, setRemoving] = useState<Stage | null>(null)
  const block = pipelineDeleteBlock(pipeline)

  const makeDefault = useMutation({
    mutationFn: () => send('post', `pipelines/${pipeline.id}/set-default`),
    onSuccess: () => { pipelinesChanged(qc); say(t('crm.settings.pipelines.now_default', '{{name}} is now the default for new leads.', { name: pipeline.name })) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: () => send('delete', `pipelines/${pipeline.id}`),
    onSuccess: () => { pipelinesChanged(qc); setDeleting(false); say(t('crm.settings.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const reorder = useMutation({
    mutationFn: (order: number[]) => send('post', `pipelines/${pipeline.id}/stages/reorder`, { order }),
    onMutate: order => {
      qc.setQueryData<Pipeline[]>(PIPELINES_KEY, list => list?.map(p => (p.id !== pipeline.id ? p : {
        ...p, stages: order.map((id, i) => ({ ...(p.stages.find(s => s.id === id) as Stage), sort_order: i })),
      })))
    },
    onError: error => say(errorText(t, error), 'danger'),
    onSettled: () => pipelinesChanged(qc),
  })
  const removeStage = useMutation({
    mutationFn: (stage: Stage) => send('delete', `pipeline-stages/${stage.id}`),
    onSuccess: () => { pipelinesChanged(qc); setRemoving(null); say(t('crm.settings.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <Card padded={false} title={pipeline.name} icon={Columns3}
      action={(
        <>
          {pipeline.is_default
            ? <Pill tone="accent"><Star size={12} aria-hidden />{t('crm.settings.pipelines.default', 'Default')}</Pill>
            : canManage && <Button variant="ghost" size="sm" onClick={() => makeDefault.mutate()} loading={makeDefault.isPending}>{t('crm.settings.pipelines.make_default', 'Make default')}</Button>}
          {canManage && <IconButton icon={Pencil} label={t('crm.settings.pipelines.rename', 'Rename {{name}}', { name: pipeline.name })} onClick={() => setRenaming(true)} />}
          {canManage && <IconButton icon={Trash2} danger label={t('crm.settings.pipelines.delete', 'Delete {{name}}', { name: pipeline.name })} onClick={() => setDeleting(true)} />}
        </>
      )}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-a-border px-4 py-2 text-xs text-a-text-2">
        <span>{t('crm.settings.pipelines.counts', '{{stages}} stages · {{deals}} leads', { stages: stages.length, deals: pipeline.inquiries_count ?? 0 })}</span>
        {pipeline.description && <span>{pipeline.description}</span>}
      </div>
      <ol className="divide-y divide-a-border">
        {stages.map((stage, i) => (
          <li key={stage.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <Dot colour={stage.color} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-a-text">{stage.name}</span>
            <KindPill kind={stage.kind} />
            {stage.default_win_probability !== null && <span className="text-xs text-a-text-2">{t('crm.settings.pipelines.win', '{{n}} % chance', { n: stage.default_win_probability })}</span>}
            {(stage.inquiries_count ?? 0) > 0 && <span className="text-xs text-a-text-2">{t('crm.settings.pipelines.stage_deals', '{{count}} leads', { count: stage.inquiries_count })}</span>}
            {canManage && (
              <span className="flex shrink-0 items-center">
                <IconButton icon={ArrowUp} label={t('crm.settings.pipelines.stage_up', 'Move {{name}} up', { name: stage.name })} disabled={i === 0 || reorder.isPending} onClick={() => reorder.mutate(reorderIds(stages, i, -1))} />
                <IconButton icon={ArrowDown} label={t('crm.settings.pipelines.stage_down', 'Move {{name}} down', { name: stage.name })} disabled={i === stages.length - 1 || reorder.isPending} onClick={() => reorder.mutate(reorderIds(stages, i, 1))} />
                <IconButton icon={Pencil} label={t('crm.settings.pipelines.stage_edit', 'Edit {{name}}', { name: stage.name })} onClick={() => setEditing(stage)} />
                <IconButton icon={Trash2} danger label={t('crm.settings.pipelines.stage_delete', 'Delete {{name}}', { name: stage.name })} disabled={onlyOfKind(stages, stage)} onClick={() => setRemoving(stage)} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {canManage && (
        <div className="border-t border-a-border px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden />{t('crm.settings.pipelines.add_stage', 'Add a stage')}</Button>
        </div>
      )}

      {renaming && <PipelineDialog pipeline={pipeline} onClose={() => setRenaming(false)} />}
      {editing && <StageDialog pipelineId={pipeline.id} stages={stages} stage={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (block ? (
        <Dialog title={t('crm.settings.pipelines.cannot_delete', '{{name}} cannot be deleted yet', { name: pipeline.name })} onClose={() => setDeleting(false)}>
          <div className="space-y-4">
            <p className="text-sm text-a-text-2">
              {block === 'default'
                ? t('crm.settings.pipelines.block_default', 'It is the default for new leads. Make another pipeline the default first.')
                : t('crm.settings.pipelines.block_deals', 'It still has {{count}} leads. Move or close them first.', { count: pipeline.inquiries_count ?? 0 })}
            </p>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setDeleting(false)}>{t('crm.common.close', 'Close')}</Button></div>
          </div>
        </Dialog>
      ) : (
        <Confirm title={t('crm.settings.pipelines.delete_title', 'Delete the pipeline {{name}}?', { name: pipeline.name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDeleting(false)}>
          {t('crm.settings.pipelines.delete_line', 'Its {{count}} stages go with it. It has no leads.', { count: stages.length })}
        </Confirm>
      ))}
      {removing && (
        <Confirm title={t('crm.settings.pipelines.stage_delete_title', 'Delete the stage {{name}}?', { name: removing.name })} confirm={t('crm.common.delete', 'Delete')}
          busy={removeStage.isPending} onConfirm={() => removeStage.mutate(removing)} onClose={() => setRemoving(null)}>
          {(removing.inquiries_count ?? 0) > 0
            ? t('crm.settings.pipelines.stage_moves', 'Its {{count}} leads move to {{stage}}.', { count: removing.inquiries_count, stage: fallbackStage(stages, removing)?.name ?? '—' })
            : t('crm.settings.pipelines.stage_empty', 'No lead is on this stage.')}
        </Confirm>
      )}
    </Card>
  )
}

function PipelineDialog({ pipeline, onClose }: { pipeline: Pipeline | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [name, setName] = useState(pipeline?.name ?? '')
  const [description, setDescription] = useState(pipeline?.description ?? '')
  const valid = name.trim().length > 0 && name.trim().length <= PIPELINE_LIMITS.name && description.length <= PIPELINE_LIMITS.description
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null }
      return pipeline ? send('put', `pipelines/${pipeline.id}`, body) : send('post', 'pipelines', body)
    },
    onSuccess: () => { pipelinesChanged(qc); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })
  return (
    <Dialog title={pipeline ? t('crm.settings.pipelines.rename_title', 'Rename the pipeline') : t('crm.settings.pipelines.new_title', 'New pipeline')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (valid) save.mutate() }}>
        <Field label={t('crm.settings.pipelines.name', 'Name')}>
          <TextInput value={name} maxLength={PIPELINE_LIMITS.name} placeholder={t('crm.settings.pipelines.name_placeholder', 'e.g. Group bookings')} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label={t('crm.settings.pipelines.description', 'What kind of leads go here')}>
          <TextArea rows={2} value={description} maxLength={PIPELINE_LIMITS.description} onChange={e => setDescription(e.target.value)} />
        </Field>
        {!pipeline && <p className="text-sm text-a-text-2">{t('crm.settings.pipelines.new_line', 'It starts with eight usual stages; change them after.')}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" disabled={!valid} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function StageDialog({ pipelineId, stages, stage, onClose }: { pipelineId: number; stages: Stage[]; stage: Stage | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [form, setForm] = useState<StageForm>(() => stageForm(stage))
  const problems = stageProblems(form)
  const allowed = kindsFor(stages, stage)
  const kindNames: Record<StageKind, string> = { open: t('crm.status.open', 'Open'), won: t('crm.status.won', 'Won'), lost: t('crm.status.lost', 'Lost') }
  const colours = form.color && !(STAGE_COLOURS as readonly string[]).includes(form.color) ? [form.color, ...STAGE_COLOURS] : [...STAGE_COLOURS]
  const save = useMutation({
    mutationFn: () => stage
      ? send('put', `pipeline-stages/${stage.id}`, stagePayload(form))
      : send('post', `pipelines/${pipelineId}/stages`, stagePayload(form)),
    onSuccess: () => { pipelinesChanged(qc); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <Dialog title={stage ? t('crm.settings.pipelines.stage_edit_title', 'Edit the stage') : t('crm.settings.pipelines.stage_new_title', 'New stage')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (problems.length === 0) save.mutate() }}>
        <div>
          <Field label={t('crm.settings.pipelines.stage_name', 'Name')}>
            <TextInput value={form.name} maxLength={PIPELINE_LIMITS.stage} placeholder={t('crm.settings.pipelines.stage_placeholder', 'e.g. Offer sent')} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
        </div>
        <div role="group" aria-label={t('crm.settings.pipelines.kind', 'What it means')}>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.settings.pipelines.kind', 'What it means')}</span>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(kind => (
              <button key={kind} type="button" aria-pressed={form.kind === kind} disabled={!allowed.includes(kind)} onClick={() => setForm(f => ({ ...f, kind }))}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-a-accent ${form.kind === kind ? 'border-a-accent bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:border-a-accent/40'}`}>
                {kindNames[kind]}
              </button>
            ))}
          </div>
          {stage && allowed.length === 1 && <p className="mt-1 text-xs text-a-text-2">{t('crm.settings.pipelines.only_kind', 'This is the pipeline\'s only {{kind}} stage, so it stays one.', { kind: kindNames[stage.kind].toLowerCase() })}</p>}
        </div>
        <div role="group" aria-label={t('crm.settings.pipelines.colour', 'Colour')}>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.settings.pipelines.colour', 'Colour')}</span>
          <div className="flex flex-wrap gap-1.5">
            {colours.map(colour => (
              <button key={colour} type="button" aria-pressed={form.color === colour} aria-label={colour} onClick={() => setForm(f => ({ ...f, color: colour }))}
                className={`h-8 w-8 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-a-accent ${form.color === colour ? 'border-a-text' : 'border-transparent'}`}
                style={{ background: colour }} />
            ))}
          </div>
        </div>
        <div>
          <Field label={t('crm.settings.pipelines.win_label', 'Usual chance of winning (%)')} hint={t('crm.settings.pipelines.win_hint', 'For your reference; leave it empty for none.')}>
            <TextInput type="number" inputMode="numeric" min={0} max={100} className="max-w-32" value={form.win} onChange={e => setForm(f => ({ ...f, win: e.target.value }))} />
          </Field>
          {problems.includes('win') && <Problem>{t('crm.settings.pipelines.win_bad', 'A whole number from 0 to 100.')}</Problem>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" disabled={problems.length > 0} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
