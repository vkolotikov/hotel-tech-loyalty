/**
 * TS mirror of App\Enums\PipelineStageKind.
 *
 * The three values keyed to `pipeline_stages.kind`. New values require
 * updating both this file AND the PHP enum in the same PR.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding (pipeline
 * kind literals across 16 files).
 */

export const PIPELINE_STAGE_KINDS = ['open', 'won', 'lost'] as const

export type PipelineStageKind = typeof PIPELINE_STAGE_KINDS[number]

export const PIPELINE_STAGE_KIND_LABELS: Record<PipelineStageKind, string> = {
  open: 'Open',
  won:  'Won',
  lost: 'Lost',
}

/** Tailwind accent token per kind — keep the same vocabulary as the
 *  stage color picker so badges + the kanban column headers agree. */
export const PIPELINE_STAGE_KIND_TONE: Record<PipelineStageKind, 'neutral' | 'success' | 'danger'> = {
  open:    'neutral',
  won:     'success',
  lost:    'danger',
}

/** True if the value is a known PipelineStageKind. */
export function isPipelineStageKind(value: unknown): value is PipelineStageKind {
  return typeof value === 'string'
    && (PIPELINE_STAGE_KINDS as readonly string[]).includes(value)
}
