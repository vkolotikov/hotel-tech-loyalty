import { Directory, File, Paths } from 'expo-file-system'
import { isAvailableAsync, shareAsync } from 'expo-sharing'
import { randomUUID } from 'expo-crypto'
import { api } from './api'
import { useSession } from './session'
import { voucherName } from './loyalty'

/** Private bytes never become a public URL; the temporary copy is removed when the system sheet closes. */
export async function openVoucher(id: number, name: string): Promise<void> {
  const owner = useSession.getState().token
  if (!owner || !(await isAvailableAsync())) throw new Error('Voucher unavailable')
  const data = await api.offerAttachment(id)
  if (owner !== useSession.getState().token) throw new Error('Account changed')
  const directory = new Directory(Paths.cache, `voucher-${randomUUID()}`)
  const file = new File(directory, voucherName(name, data.mime))
  directory.create()
  try {
    await file.write(data.bytes)
    if (owner !== useSession.getState().token) throw new Error('Account changed')
    await shareAsync(file.uri, { mimeType: data.mime, UTI: data.mime === 'application/pdf' ? 'com.adobe.pdf' : data.mime === 'image/jpeg' ? 'public.jpeg' : data.mime === 'image/png' ? 'public.png' : 'org.webmproject.webp' })
  } finally {
    if (directory.exists) directory.delete()
  }
}
