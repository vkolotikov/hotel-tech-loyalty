import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../ContentProvider'
import { PageHeader } from '../ui/PageHeader'
import { Readiness } from './Readiness'
import { ApprovalsSection } from './sections/Approvals'
import { AudiencesSection } from './sections/Audiences'
import { BrandDnaSection } from './sections/BrandDna'
import { ChannelsSection } from './sections/Channels'
import { KeyDatesSection } from './sections/KeyDates'
import { LinkInBioSection } from './sections/LinkInBio'
import { SnippetsSection } from './sections/Snippets'
import { TemplatesSection } from './sections/Templates'
import { PositioningSection } from './sections/Positioning'
import { RhythmSection } from './sections/Rhythm'
import { VoiceSection } from './sections/Voice'
import { GuidedSetup } from './setup/GuidedSetup'
import { QuickSetupDialog } from './setup/QuickSetup'
import { SetupChoice } from './setup/SetupChoice'
import { useBrand } from './useBrand'

/**
 * Brand (spec §4.6): readiness and what is missing, then the profile in
 * sections — Brand DNA, Audiences, Voice, Positioning, Channels, Rhythm and
 * goals — each read by everyone and edited by managers one at a time.
 */
export function BrandPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const { query, brand, adopt } = useBrand()
  const canEdit = boot.staff.can_manage
  const [guided, setGuided] = useState(false)
  const [quick, setQuick] = useState(false)

  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.brand.title', 'Brand')} />
      {query.isLoading && <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}
      {query.isError && !brand && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {brand && guided && <GuidedSetup brand={brand} onExit={() => setGuided(false)} />}
      {brand && !guided && (
        <>
          {canEdit && !brand.profile?.setup_completed_at && (
            <SetupChoice started={brand.profile !== null} onQuick={() => setQuick(true)} onGuided={() => setGuided(true)} />
          )}
          {brand.readiness && (
            <Readiness readiness={brand.readiness} canRefresh={canEdit && brand.profile !== null} lastSync={brand.profile?.last_knowledge_sync_at ?? null} locale={locale} onRefreshed={adopt} />
          )}
          {brand.profile && (
            <>
              <BrandDnaSection brand={brand} canEdit={canEdit} />
              <AudiencesSection brand={brand} canEdit={canEdit} />
              <VoiceSection brand={brand} canEdit={canEdit} />
              <PositioningSection brand={brand} canEdit={canEdit} />
              <ChannelsSection brand={brand} canEdit={canEdit} />
              {/* Spec 2026-10-19 §6.4: the brand's link-in-bio page, after Channels. */}
              <LinkInBioSection canEdit={canEdit} />
              <KeyDatesSection brand={brand} canEdit={canEdit} />
              <ApprovalsSection brand={brand} canEdit={canEdit} />
              <SnippetsSection brand={brand} canEdit={canEdit} />
              <TemplatesSection brand={brand} canEdit={canEdit} />
              <RhythmSection brand={brand} canEdit={canEdit} />
            </>
          )}
        </>
      )}
      {quick && <QuickSetupDialog onClose={() => setQuick(false)} />}
    </div>
  )
}
