import { describe, expect, it } from 'vitest'
import {
  PIPELINE_STAGE_KINDS,
  PIPELINE_STAGE_KIND_LABELS,
  PIPELINE_STAGE_KIND_TONE,
  isPipelineStageKind,
} from './pipeline'

/**
 * Locks the TS PipelineStageKind mirror against drift from the PHP enum.
 * See paymentStatus.test.ts for the same rationale — keep the three
 * cases in sync with App\Enums\PipelineStageKind.
 */
describe('PipelineStageKind TS mirror', () => {
  it('exposes the 3 canonical kinds', () => {
    expect(PIPELINE_STAGE_KINDS).toEqual(['open', 'won', 'lost'])
  })

  it('PIPELINE_STAGE_KIND_LABELS covers every kind', () => {
    for (const kind of PIPELINE_STAGE_KINDS) {
      expect(PIPELINE_STAGE_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  it('PIPELINE_STAGE_KIND_TONE maps each kind to a valid accent', () => {
    expect(PIPELINE_STAGE_KIND_TONE.open).toBe('neutral')
    expect(PIPELINE_STAGE_KIND_TONE.won).toBe('success')
    expect(PIPELINE_STAGE_KIND_TONE.lost).toBe('danger')
  })

  it('isPipelineStageKind narrows known strings', () => {
    expect(isPipelineStageKind('open')).toBe(true)
    expect(isPipelineStageKind('won')).toBe(true)
    expect(isPipelineStageKind('lost')).toBe(true)
  })

  it('isPipelineStageKind rejects unknown strings + non-strings', () => {
    expect(isPipelineStageKind('OPEN')).toBe(false) // case sensitive
    expect(isPipelineStageKind('closed')).toBe(false)
    expect(isPipelineStageKind('')).toBe(false)
    expect(isPipelineStageKind(null)).toBe(false)
    expect(isPipelineStageKind(undefined)).toBe(false)
    expect(isPipelineStageKind(0)).toBe(false)
  })
})
