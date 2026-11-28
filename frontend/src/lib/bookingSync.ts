import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'
import { api } from './api'

export async function syncPmsBookings(): Promise<void> {
  try {
    const { data } = await api.post<{ message?: string; error?: boolean }>('/v1/admin/bookings/sync')
    if (data.error) toast.error(data.message || 'Sync failed')
    else toast.success(data.message || 'Sync complete')
  } catch (error) {
    const message = isAxiosError(error) ? error.response?.data?.message : undefined
    toast.error(typeof message === 'string' && message ? message : 'Sync failed')
  }
}
