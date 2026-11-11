import { api } from './api'
import { useSession } from './session'
import { voucherName } from './loyalty'

export async function openVoucher(id: number, name: string): Promise<void> {
  const owner = useSession.getState().token
  if (!owner) throw new Error('Voucher unavailable')
  const data = await api.offerAttachment(id)
  if (owner !== useSession.getState().token) throw new Error('Account changed')
  const url = URL.createObjectURL(new Blob([data.bytes], { type: data.mime }))
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = voucherName(name, data.mime)
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
