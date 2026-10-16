import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { Audience, BrandPayload, Channel } from '../lib/types'
import { changedFields } from './brandForms'
import { asksBeforeRemoving, audienceForm, channelFields, channelForm, removeAudience, removeChannel, saveAudience, saveChannel } from './listActions'

const payload = { profile: null, audiences: [], channels: [], voice: null, readiness: null } as BrandPayload
const inUse = { response: { status: 409, data: { error: 'audience_in_use', message: 'x', posts: 4 } } }

describe('removeAudience', () => {
  it('removes an audience nobody uses at once', async () => {
    const api = { deleteAudience: vi.fn(() => Promise.resolve(payload)) }
    const ask = vi.fn(() => true)
    await expect(removeAudience(api, 3, ask)).resolves.toBe(payload)
    expect(ask).not.toHaveBeenCalled()
    expect(api.deleteAudience).toHaveBeenCalledWith(3, false)
  })

  it('asks with the number of posts first, and removes only after a yes', async () => {
    const api = { deleteAudience: vi.fn((_: number, confirm: boolean) => (confirm ? Promise.resolve(payload) : Promise.reject(inUse))) }
    const no = vi.fn(() => false)
    await expect(removeAudience(api, 3, no)).resolves.toBeNull()
    expect(no).toHaveBeenCalledWith(4)
    expect(api.deleteAudience).toHaveBeenCalledTimes(1)
    await expect(removeAudience(api, 3, () => true)).resolves.toBe(payload)
    expect(api.deleteAudience).toHaveBeenLastCalledWith(3, true)
  })

  it('passes any other refusal on', async () => {
    const api = { deleteAudience: vi.fn(() => Promise.reject({ response: { status: 403, data: { error: 'manager_only' } } })) }
    await expect(removeAudience(api, 3, () => true)).rejects.toBeTruthy()
  })
})

describe('saving audiences and channels', () => {
  it('names a new channel after its platform in the reader\'s words', () => {
    expect(channelForm(null, 'linkedin', 'LinkedIn').label).toBe('LinkedIn')
    expect(channelForm(null, 'linkedin').label).toBe('linkedin')
  })

  it('creates a new audience with its fields, and edits one by id with only what changed (marking it a person\'s, not the AI\'s)', async () => {
    const api = { createAudience: vi.fn(() => Promise.resolve({ ...payload, audience: {} as Audience })), updateAudience: vi.fn(() => Promise.resolve({ ...payload, audience: {} as Audience })) }
    const adopt = vi.fn()
    await saveAudience({ api, adopt }, null, { ...audienceForm(null), name: 'Busy parents', pain_points: ['No time'] })
    expect(api.createAudience).toHaveBeenCalledWith(expect.objectContaining({ name: 'Busy parents', pain_points: ['No time'] }))
    const existing = { id: 5, name: 'Students', is_ai_assumed: true, posts_count: 2 } as Audience
    await saveAudience({ api, adopt }, existing, { ...audienceForm(existing), country: 'Latvia' })
    expect(api.updateAudience).toHaveBeenCalledWith(5, { country: 'Latvia', is_ai_assumed: false })
    expect(adopt).toHaveBeenCalledTimes(2)
  })

  // Review: another manager's change made while this form was open was sent back as it was, undoing it silently.
  it('compares with the form as it was opened, so a change someone else made meanwhile is not undone', async () => {
    const api = { createAudience: vi.fn(), updateAudience: vi.fn(() => Promise.resolve({ ...payload, audience: {} as Audience })) }
    const opened = { id: 5, name: 'Students', country: 'Latvia', is_ai_assumed: false, posts_count: 0 } as Audience
    const now = { ...opened, country: 'Estonia' } // another manager changed it while this form was open
    const base = audienceForm(opened)
    await saveAudience({ api, adopt: vi.fn() }, now, { ...base, name: 'Students 18+' }, base)
    expect(api.updateAudience).toHaveBeenCalledWith(5, { name: 'Students 18+' })

    const channelApi = { createChannel: vi.fn(), updateChannel: vi.fn(() => Promise.resolve({ ...payload, channel: {} as Channel })) }
    const channelOpened = { id: 6, platform: 'linkedin', label: 'LinkedIn', active: true, frequency: { tue: true }, posts_per_week: 2 } as Channel
    const channelBase = channelForm(channelOpened, 'linkedin')
    await saveChannel({ api: channelApi, adopt: vi.fn(), refresh: vi.fn() }, { ...channelOpened, posts_per_week: 5 }, { ...channelBase, label: 'LinkedIn page' }, channelBase)
    expect(channelApi.updateChannel).toHaveBeenCalledWith(6, { label: 'LinkedIn page' })
  })

  it('reads the Plan again after any channel change, so slots follow the channels', async () => {
    const api = {
      createChannel: vi.fn(() => Promise.resolve({ ...payload, channel: {} as Channel })),
      updateChannel: vi.fn(() => Promise.resolve({ ...payload, channel: {} as Channel })),
      deleteChannel: vi.fn(() => Promise.resolve(payload)),
    }
    const adopt = vi.fn()
    const refresh = vi.fn()
    await saveChannel({ api, adopt, refresh }, null, channelForm(null, 'instagram'))
    expect(api.createChannel).toHaveBeenCalledWith(expect.objectContaining({ platform: 'instagram', label: 'instagram', active: true, frequency: { mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false } }))
    const channel = { id: 6, platform: 'linkedin', label: 'LinkedIn', active: true, frequency: { tue: true }, posts_per_week: 2 } as Channel
    await saveChannel({ api, adopt, refresh }, channel, { ...channelForm(channel, 'linkedin'), active: false })
    expect(api.updateChannel).toHaveBeenCalledWith(6, { active: false })
    await removeChannel({ api, adopt, refresh }, 6)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(adopt).toHaveBeenCalledTimes(3)
  })

  it('sends nothing for an untouched channel, and reads days as all seven', () => {
    const channel = { id: 6, platform: 'linkedin', label: 'LinkedIn', active: true, frequency: null, posts_per_week: null } as Channel
    expect(changedFields(channelFields(channelForm(channel, 'linkedin')), channelFields(channelForm(channel, 'linkedin')))).toEqual({})
    expect(channelForm(channel, 'linkedin').days).toEqual({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
  })
})

describe('asksBeforeRemoving', () => {
  // Plan C deferred: removing an audience posts use asked twice ("Remove?" then "N posts use it — remove anyway?").
  it('asks its own question only for an audience no post uses; the server\'s in-use answer brings the other one', () => {
    expect(asksBeforeRemoving({ posts_count: 0 })).toBe(true)
    expect(asksBeforeRemoving({ posts_count: 3 })).toBe(false)
  })
})

describe('a channel\'s usual time', () => {
  it('keeps it in the form, sends it, and sends an emptied one as none', () => {
    const c = { id: 7, platform: 'instagram', label: 'Insta', active: true, frequency: null, post_time: '08:30' } as unknown as Channel
    expect(channelForm(c, 'instagram').post_time).toBe('08:30')
    expect(channelFields(channelForm(c, 'instagram')).post_time).toBe('08:30')
    expect(channelFields({ ...channelForm(c, 'instagram'), post_time: '' }).post_time).toBeNull()
    expect(channelForm(null, 'instagram').post_time).toBe('')
  })
})
