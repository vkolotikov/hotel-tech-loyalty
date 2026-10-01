import { describe, expect, it, vi } from 'vitest'
import { previewThenSave } from './preview'

const stranded = { affected: [{ id: 7, start: '2026-10-06T10:00', end: '2026-10-06T10:45', client: 'Sophie', service: 'Massage', team_member: 'Mara' }], total: 1 }
const none = { affected: [], total: 0 }

describe('previewThenSave', () => {
  it('saves at once when nothing is stranded, without asking', async () => {
    const save = vi.fn(async (dryRun: boolean) => ({ ...none, saved: !dryRun }))
    const confirm = vi.fn()
    expect(await previewThenSave(save, confirm)).toEqual({ ...none, saved: true })
    expect(save.mock.calls).toEqual([[true], [false]])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks with the list and saves only on yes', async () => {
    const save = vi.fn(async () => stranded)
    expect(await previewThenSave(save, async () => true)).toEqual(stranded)
    expect(save.mock.calls).toEqual([[true], [false]])
  })

  it('saves nothing when the person goes back', async () => {
    const save = vi.fn(async () => stranded)
    const confirm = vi.fn(async () => false)
    expect(await previewThenSave(save, confirm)).toBeNull()
    expect(confirm).toHaveBeenCalledWith(stranded)
    expect(save.mock.calls).toEqual([[true]])
  })
})
