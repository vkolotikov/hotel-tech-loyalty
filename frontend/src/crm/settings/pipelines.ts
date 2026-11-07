/**
 * Pipelines, their stages and the reasons a lead is lost (PipelineController). The server keeps the rules — every
 * pipeline has at least one open, one won and one lost stage; the default pipeline and one with deals are not
 * deleted; a deleted stage's deals move to the first open stage — and these functions only say beforehand what it
 * would refuse, so the buttons can say why. Pure.
 */
export type StageKind = 'open' | 'won' | 'lost'

export interface Stage {
  id: number
  pipeline_id?: number
  name: string
  slug: string
  color: string | null
  kind: StageKind
  sort_order: number
  default_win_probability: number | null
  inquiries_count?: number
}

export interface Pipeline {
  id: number
  name: string
  slug: string
  description: string | null
  is_default: boolean
  sort_order: number
  inquiries_count?: number
  stages: Stage[]
}

export interface LostReason {
  id: number
  label: string
  slug: string
  sort_order: number
  is_active?: boolean
  inquiries_count?: number
}

export const KINDS: readonly StageKind[] = ['open', 'won', 'lost']

/** The stage colours the full admin offers; a stage keeps any other colour it already has. */
export const STAGE_COLOURS = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981', '#14b8a6', '#22d3ee', '#94a3b8'] as const

export const PIPELINE_LIMITS = { name: 120, description: 500, stage: 80, reason: 120 } as const

/** Stages in the board's order. */
export function sortedStages(stages: readonly Stage[]): Stage[] {
  return [...stages].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

/** Whether a stage is the only one of its kind in its pipeline (it can then be neither deleted nor changed in kind). */
export function onlyOfKind(stages: readonly Stage[], stage: Stage): boolean {
  return !stages.some(s => s.id !== stage.id && s.kind === stage.kind)
}

/** The kinds a stage may take: its own, and the others unless it is the last of its own kind. */
export function kindsFor(stages: readonly Stage[], stage: Stage | null): StageKind[] {
  if (!stage) return [...KINDS]
  return onlyOfKind(stages, stage) ? [stage.kind] : [...KINDS]
}

/** Where a deleted stage's deals go: the pipeline's first other open stage. */
export function fallbackStage(stages: readonly Stage[], stage: Stage): Stage | null {
  return sortedStages(stages).find(s => s.id !== stage.id && s.kind === 'open') ?? null
}

/** Why a pipeline cannot be deleted, or null when it can. */
export function pipelineDeleteBlock(pipeline: Pipeline): 'default' | 'deals' | null {
  if (pipeline.is_default) return 'default'
  if ((pipeline.inquiries_count ?? 0) > 0) return 'deals'
  return null
}

export interface StageForm { name: string; kind: StageKind; color: string; win: string }

export function stageForm(stage: Stage | null): StageForm {
  return {
    name: stage?.name ?? '',
    kind: stage?.kind ?? 'open',
    color: stage?.color ?? STAGE_COLOURS[0],
    win: stage?.default_win_probability === null || stage?.default_win_probability === undefined ? '' : String(stage.default_win_probability),
  }
}

export type StageProblem = 'name' | 'name_long' | 'win'

export function stageProblems(form: StageForm): StageProblem[] {
  const out: StageProblem[] = []
  const name = form.name.trim()
  if (!name) out.push('name')
  else if (name.length > PIPELINE_LIMITS.stage) out.push('name_long')
  if (form.win.trim() !== '') {
    const n = Number(form.win)
    if (!Number.isInteger(n) || n < 0 || n > 100) out.push('win')
  }
  return out
}

/** The body of POST pipelines/{id}/stages and PUT pipeline-stages/{id}. */
export function stagePayload(form: StageForm): { name: string; kind: StageKind; color: string; default_win_probability: number | null } {
  return {
    name: form.name.trim(),
    kind: form.kind,
    color: form.color,
    default_win_probability: form.win.trim() === '' ? null : Number(form.win),
  }
}

/** The lost reasons in their order: active ones first, as the lead's Lost picker lists them. */
export function sortedReasons(reasons: readonly LostReason[]): LostReason[] {
  return [...reasons].sort((a, b) => Number(b.is_active ?? true) - Number(a.is_active ?? true) || a.sort_order - b.sort_order || a.id - b.id)
}
