import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import toast from 'react-hot-toast'
import { CalendarView } from './CalendarView'
import type { CalendarGenerationResult, PlannerProfile } from './lib'

const harness = vi.hoisted(() => ({
  index: 0,
  states: [] as unknown[],
  mutations: [] as { onSuccess?: (result: CalendarGenerationResult) => void; onError?: (error: unknown) => void }[],
  invalidate: vi.fn(),
}))

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.index++
      if (!(index in harness.states)) harness.states[index] = typeof initial === 'function' ? initial() : initial
      return [harness.states[index], (value: unknown) => {
        harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value
      }]
    },
  }
})
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: [] }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
  useMutation: (options: typeof harness.mutations[number]) => {
    harness.mutations.push(options)
    return { isPending: false, mutate: vi.fn() }
  },
}))
vi.mock('../../lib/api', () => ({ api: { post: vi.fn(), get: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const profile = { id: 1, name: 'Business', channels: [{ platform: 'linkedin', active: true }] } as PlannerProfile
const windows = [{ start_date: '2026-09-14', end_date: '2026-09-20', reason: 'provider_unavailable' }]

function render() {
  harness.index = 0
  harness.mutations = []
  return renderToStaticMarkup(<CalendarView profile={profile} onOpenPost={() => undefined} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.states = []
  render()
  // Select the existing month dialog and a user's optional instructions.
  harness.states[6] = 'month'
  harness.states[7] = 'Keep these instructions'
  harness.states[8] = false
  render()
})

describe('calendar generation feedback', () => {
  it('keeps partial results visible, refreshes saved drafts, and defaults retry to empty slots', () => {
    harness.mutations[1].onSuccess!({ status: 'partial', created_count: 2, posts: [],
      failed_windows: windows, message: 'Saved 2 draft posts, but the calendar is incomplete.' })

    const html = render()
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['cp-posts'] })
    expect(toast.success).not.toHaveBeenCalled()
    expect(html).toContain('Saved 2 draft posts, but the calendar is incomplete.')
    expect(html).toContain('Dates still to plan:')
    expect(html).toContain('2026-09-14')
    expect(html).toContain('Retry empty slots')
    expect(harness.states[8]).toBe(true)
    expect(html).toContain('Keep these instructions')
  })

  it('keeps a no-post provider failure retryable instead of showing success or closing the dialog', () => {
    harness.mutations[1].onError!({ response: { status: 503, data: {
      status: 'failed', created_count: 0, failed_windows: windows,
      message: 'No new posts were saved. Please retry.',
    } } })

    const html = render()
    expect(html).toContain('No new posts were saved. Please retry.')
    expect(html).toContain('2026-09-20')
    expect(html).toContain('Retry empty slots')
    expect(toast.success).not.toHaveBeenCalled()
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['cp-posts'] })
  })

  it('refreshes posts after a local error without claiming earlier drafts were rolled back', () => {
    harness.mutations[1].onError!({ response: { status: 500, data: {
      message: 'Any drafts already saved remain in your calendar. Please reload before retrying.',
    } } })

    const html = render()
    expect(html).toContain('Any drafts already saved remain in your calendar.')
    expect(html).not.toContain('No new posts were saved')
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['cp-posts'] })
  })

  it('closes a completed generation normally and reports the server message', () => {
    harness.mutations[1].onSuccess!({ status: 'completed', created_count: 2, posts: [],
      failed_windows: [], message: 'Generated 2 calendar posts.' })

    expect(render()).not.toContain('Instructions (optional)')
    expect(toast.success).toHaveBeenCalledWith('Generated 2 calendar posts.')
  })

  it('uses the ordinary action label when the user explicitly turns off empty-slot retry', () => {
    harness.mutations[1].onSuccess!({ status: 'partial', created_count: 1, posts: [],
      failed_windows: windows, message: '<script>untrusted()</script>' })
    harness.states[8] = false

    const html = render()
    expect(html).not.toContain('Retry empty slots')
    expect(html).toContain('&lt;script&gt;untrusted()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
