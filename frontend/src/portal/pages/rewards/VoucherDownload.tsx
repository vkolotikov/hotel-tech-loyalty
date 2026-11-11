import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Paperclip } from 'lucide-react'
import { portalApi } from '../../lib/portalApi'
import { Button } from '../../ui/Button'

export function VoucherDownload({ id, name }: { id: number; name: string }) {
  const { t } = useTranslation()
  const download = useMutation({ mutationFn: () => portalApi.offerAttachment(id), onSuccess: blob => {
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } })
  return <div className="space-y-1"><Button size="sm" variant="ghost" loading={download.isPending} onClick={() => download.mutate()}><Paperclip size={14} aria-hidden />{t('portal.rewards.download_voucher', 'Download voucher')}</Button>{download.isError && <p role="alert" className="text-xs text-p-danger">{t('portal.rewards.voucher_unavailable', 'This voucher is unavailable. Please contact the team.')}</p>}</div>
}
