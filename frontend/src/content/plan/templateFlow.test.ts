import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { Channel, PostDetail, Template } from '../lib/types'
import { startPost, templateDraft, writeInto } from './templateFlow'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'linkedin', pillar_name: 'Offers', topic: 'Book your [treatment]', hook: null,
  main_copy: 'Our [treatment] is back.', cta: null, hashtags: ['#autumn'],
}
const channels = [{ platform: 'instagram', active: true, post_time: '08:30' }, { platform: 'linkedin', active: true, post_time: '12:00' }] as unknown as Channel[]
const pillars = [{ id: 7, name: 'offers', active: true }]

describe('templateDraft (spec 2026-10-16 §5.3)', () => {
  it('starts on the template’s platform at its usual time, with the template’s words and its pillar by name', () => {
    expect(templateDraft('2026-10-20', offer, [], channels, 'beauty', pillars)).toEqual({
      date: '2026-10-20', platform: 'linkedin', time: '12:00',
      fields: { topic: 'Book your [treatment]', hook: '', main_copy: 'Our [treatment] is back.', cta: '', hashtags: '#autumn', pillar_id: '7' },
    })
  })

  it('without a platform, takes the day’s first open slot, else the brand’s first channel', () => {
    const any = { ...offer, platform: null }
    expect(templateDraft('2026-10-20', any, [{ date: '2026-10-20', platform: 'linkedin' }], channels, 'beauty', []).platform).toBe('linkedin')
    expect(templateDraft('2026-10-20', any, [], channels, 'beauty', [])).toMatchObject({ platform: 'instagram', time: '08:30' })
  })
})

describe('Write with AI from a template', () => {
  const post = { id: 41, updated_at: 'a' } as unknown as PostDetail
  const written = { id: 41, updated_at: 'b' } as unknown as PostDetail
  const flowWith = (write: () => Promise<{ post: PostDetail }>, keepsEdits = false) => {
    const calls: string[] = []
    const flow = {
      api: {
        createPost: vi.fn(async () => { calls.push('create'); return { post } }),

      },
      queue: vi.fn(async (...args: unknown[]) => { calls.push(`queue ${JSON.stringify(args)}`); await write() }),
      keep: vi.fn((p: PostDetail) => { calls.push(`keep ${p.updated_at}`) }),
      panel: {
        guard: vi.fn(() => !keepsEdits),
        open: vi.fn((id: number) => { calls.push(`open ${id}`); return true }),
        noteWriting: vi.fn((id: number, w: unknown) => { calls.push(`writing ${id} ${JSON.stringify(w)}`) }),
      },
    }
    return { flow, calls }
  }

  it('makes and opens the post, then submits template work to the retained queue', async () => {
    const { flow, calls } = flowWith(async () => ({ post: written }))
    expect(await startPost(flow, { platform: 'linkedin', topic: 'x' })).toBe(post)
    await writeInto(flow, 41, 3)
    // Final review: the note is per post, so ending this write leaves another post's write as it is.
    expect(calls).toEqual(['create', 'keep a', 'open 41', 'queue [41,3]'])
  })

  // Final review: declining to discard the panel's edits still made the post and set the AI writing it, unseen.
  it('makes nothing when the person keeps the panel’s unsaved edits', async () => {
    const { flow, calls } = flowWith(async () => ({ post: written }), true)
    expect(await startPost(flow, { platform: 'linkedin', topic: 'x' })).toBeNull()
    expect(calls).toEqual([])
  })

  it('keeps a late created post in its cache without opening it over a newer editor', async () => {
    const { flow } = flowWith(async () => ({ post: written }))
    let current = true
    let finish!: (value: { post: PostDetail }) => void
    flow.api.createPost = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const waiting = startPost({ ...flow, panel: { ...flow.panel, capture: () => () => current } }, { platform: 'linkedin' })
    current = false
    finish({ post })
    expect(await waiting).toBe(post)
    expect(flow.keep).toHaveBeenCalledWith(post)
    expect(flow.panel.open).not.toHaveBeenCalled()
    expect(flow.panel.noteWriting).not.toHaveBeenCalled()
  })
})
