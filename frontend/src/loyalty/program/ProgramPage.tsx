import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../workspace/ui/PageHeader'

/** Program (spec 2026-10-21 §4.5): tiers, benefits and boost events. */
export function ProgramPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.program.title', 'Program')} />
    </div>
  )
}
