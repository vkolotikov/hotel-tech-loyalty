import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { KEYS, afterMemberChange, queryClient } from '../lib/queries'
import { failureOf } from '../lib/failure'
import { cleanCode, errorKey } from '../lib/desk'
import { feel } from '../lib/haptics'
import { useNfc } from '../lib/nfc'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import { C, fonts } from '../lib/theme'
import { GhostButton, GoldButton, Notice } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { Done } from '../components/Done'

/**
 * Link a card to a member (`POST members/{id}/cards`): the member's new card is tapped on the phone; the server keeps
 * one card to one member across every organisation and says when it belongs elsewhere.
 */
export default function LinkCard() {
  const { t } = useT()
  const params = useLocalSearchParams<{ id: string }>()
  const id = Number(params.id)
  const detail = useQuery({ queryKey: KEYS.member(id), queryFn: () => api.member(id), enabled: id > 0 })
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Key | null>(null)
  const [done, setDone] = useState<{ uid: string; linked: boolean } | null>(null)

  const link = async (raw: string) => {
    const uid = cleanCode(raw)
    if (!uid || busy || done) return
    feel.read()
    setBusy(true)
    setFailure(null)
    try {
      const answer = await api.linkCard(id, uid)
      feel.success()
      afterMemberChange(id)
      void queryClient.invalidateQueries({ queryKey: KEYS.cards(id) })
      setDone({ uid: answer.card.uid, linked: answer.linked })
    } catch (error) {
      feel.warning()
      setFailure(errorKey(failureOf(error).code))
    } finally {
      setBusy(false)
    }
  }

  const nfc = useNfc({ listen: !done && !busy, onCard: uid => { void link(uid) }, prompt: t('link.line') })

  if (done) {
    return (
      <Sheet title={t('link.title')}>
        <Done title={t('link.linked')} lines={[done.uid, ...(done.linked ? [] : [t('link.already')])]} />
        <GoldButton title={t('common.done')} icon="checkmark" onPress={() => router.back()} />
      </Sheet>
    )
  }

  return (
    <Sheet title={t('link.title')} line={detail.data?.member.name}>
      <View style={styles.card}>
        <Ionicons name="card" size={56} color={C.gold} />
        <Text style={[fonts.body, { color: C.text, textAlign: 'center' }]}>{t('link.line')}</Text>
      </View>
      {nfc.state === 'none' && <Notice tone="warning" text={t('scan.nfcNone')} />}
      {nfc.state === 'off' && <Notice tone="warning" text={t('scan.nfcOff')} action={t('scan.nfcSettings')} onAction={nfc.openSettings} />}
      {failure && <Notice text={t(failure)} />}
      {nfc.state === 'ready' && !nfc.continuous && <GoldButton title={t('scan.nfc')} icon="card" busy={busy} onPress={() => { void nfc.read() }} />}
      {nfc.state === 'ready' && nfc.continuous && <Text style={[fonts.bodyStrong, { color: C.gold, textAlign: 'center' }]}>{t('scan.nfcReady')}</Text>}
      <GhostButton title={t('common.cancel')} onPress={() => router.back()} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 16, paddingVertical: 36, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: C.goldEdge, backgroundColor: C.goldWash },
})
