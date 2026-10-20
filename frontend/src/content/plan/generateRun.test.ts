import { describe, expect, it } from 'vitest'
import { errorKey } from '../lib/errors'
import type { GenerateResult, GenerateRun } from '../lib/types'
import { GENERATE_POLL_MS, isRunning, runEnded, runNote, runWhy } from './generateRun'

const t = (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
  const text = typeof fallback === 'string' ? fallback : key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
}
const running: GenerateRun = { status: 'running', started_at: '2026-10-20T12:00:00+00:00' }
const done = (more: Partial<GenerateResult> = {}): GenerateResult =>
  ({ status: 'completed', created_count: 3, posts: [], skipped: [], failed_windows: [], ...more })

// Generate on the queue (2026-10-20): production cuts a request off at 60 s; the run is a job the panel follows.
describe('a Generate run on the queue', () => {
  it('is followed every 4 seconds, only while it runs', () => {
    expect(GENERATE_POLL_MS).toBe(4000)
    expect(isRunning(running)).toBe(true)
    expect(isRunning({ status: 'idle' })).toBe(false)
    expect(isRunning(done())).toBe(false)
    expect(isRunning(undefined)).toBe(false)
  })

  it('ends when a run seen running becomes a result', () => {
    expect(runEnded(running, done())).toBe(true)
    expect(runEnded(running, done({ status: 'failed', created_count: 0 }))).toBe(true)
    expect(runEnded(done(), done())).toBe(false)
    expect(runEnded(undefined, done())).toBe(false)
    expect(runEnded(running, running)).toBe(false)
    expect(runEnded(running, { status: 'idle' })).toBe(false)
  })

  it('words its end for the Plan: the posts written, why it stopped, or nothing written', () => {
    expect(runNote(done(), t)).toEqual({ tone: 'info', text: 'Posts written: 3' })
    expect(runNote(done({ status: 'partial', created_count: 2 }), t)).toEqual({ tone: 'info', text: 'Posts written: 2' })
    expect(runNote(done({ status: 'failed', created_count: 0, error: 'generation_failed' }), t))
      .toEqual({ tone: 'danger', text: errorKey('generate', 'generation_failed')[1] })
    expect(runNote(done({ status: 'failed', created_count: 0 }), t)).toEqual({ tone: 'danger', text: 'No posts were written.' })
  })
})

// Queue review: a run that stopped early said only "No posts were written." — the dialog also says why.
describe('why a run stopped', () => {
  it('is the refusal words for its error, and nothing without one', () => {
    expect(runWhy(done({ status: 'failed', created_count: 0, error: 'no_channels' }), t)).toBe(errorKey('generate', 'no_channels')[1])
    expect(runWhy(done({ status: 'failed', created_count: 0, error: 'generation_failed' }), t)).toBe(errorKey('generate', 'generation_failed')[1])
    expect(runWhy(done(), t)).toBeNull()
  })
})
