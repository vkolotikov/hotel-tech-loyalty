import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { api } from './api'
import { syncPmsBookings } from './bookingSync'

vi.mock('./api', () => ({ api: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

describe('manual PMS sync feedback', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows the server’s authentication guidance when Smoobu refuses a sync', async () => {
    const message = 'The Smoobu signing secret is missing.'
    vi.mocked(api.post).mockRejectedValue({ isAxiosError: true, response: { status: 502, data: { message } } })
    await syncPmsBookings()
    expect(toast.error).toHaveBeenCalledWith(message)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reports a partial import as an error and keeps its counts', async () => {
    const message = 'Synced 8 reservations. 1 failed.'
    vi.mocked(api.post).mockResolvedValue({ data: { error: true, message } })
    await syncPmsBookings()
    expect(toast.error).toHaveBeenCalledWith(message)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('confirms a completed import', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { message: 'Synced 8 reservations.' } })
    await syncPmsBookings()
    expect(toast.success).toHaveBeenCalledWith('Synced 8 reservations.')
    expect(toast.error).not.toHaveBeenCalled()
  })
})
