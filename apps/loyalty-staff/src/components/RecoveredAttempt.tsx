import { useRouter } from 'expo-router'
import { type AttemptStatus } from '../lib/api'
import { afterMemberChange } from '../lib/queries'
import { useT } from '../lib/i18n'
import { Sheet } from './Sheet'
import { Done } from './Done'
import { GoldButton } from './ui'

export function RecoveredAttempt({ title, member, receipt }: {
  title: string; member: number; receipt: Extract<AttemptStatus, { state: 'recorded' }>
}) {
  const { t } = useT()
  const router = useRouter()
  return <Sheet title={title} footer={<GoldButton title={t('recovery.viewMember')} icon="person-outline" onPress={() => {
    afterMemberChange(member)
    router.replace(`/member/${member}`)
  }} />}>
    <Done title={t(receipt.reversed ? 'recovery.reversed' : 'recovery.recorded')}
      lines={[t('recovery.reference', { n: receipt.reference }), ...(receipt.effects_pending ? [t('recovery.processing')] : [])]} />
  </Sheet>
}
