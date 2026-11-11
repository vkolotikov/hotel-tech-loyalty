import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { usePreventRemove } from 'expo-router'
import { openVoucher } from '../lib/voucher'
import { useT } from '../lib/i18n'
import { GhostButton, Notice } from './ui'
import { View } from 'react-native'
import { singleFlight } from '../lib/loyalty'

export function VoucherDownload({ id, name, onBusyChange }: { id: number; name: string; onBusyChange?: (busy: boolean) => void }) {
  const { tp } = useT()
  const download = useMutation({ mutationFn: () => openVoucher(id, name) })
  const [run] = useState(singleFlight)
  usePreventRemove(download.isPending, () => {})
  useEffect(() => { onBusyChange?.(download.isPending); return () => onBusyChange?.(false) }, [download.isPending, onBusyChange])
  return <View style={{ gap: 8 }}>
    <GhostButton title={tp('portal.rewards.download_voucher')} icon="download-outline" busy={download.isPending} onPress={() => { void run(() => download.mutateAsync()).catch(() => {}) }} />
    {download.isError && <Notice text={tp('portal.rewards.voucher_unavailable')} />}
  </View>
}
