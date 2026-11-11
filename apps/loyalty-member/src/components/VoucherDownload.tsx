import { useMutation } from '@tanstack/react-query'
import { openVoucher } from '../lib/voucher'
import { useT } from '../lib/i18n'
import { GhostButton, Notice } from './ui'
import { View } from 'react-native'

export function VoucherDownload({ id, name }: { id: number; name: string }) {
  const { tp } = useT()
  const download = useMutation({ mutationFn: () => openVoucher(id, name) })
  return <View style={{ gap: 8 }}>
    <GhostButton title={tp('portal.rewards.download_voucher')} icon="download-outline" busy={download.isPending} onPress={() => download.mutate()} />
    {download.isError && <Notice text={tp('portal.rewards.voucher_unavailable')} />}
  </View>
}
