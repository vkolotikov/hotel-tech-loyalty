import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { WandSparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ERRORS } from './errors'
import { afterOptionsChange, optionsApi } from './optionsApi'
import { offersSetup } from './optionsMath'

/** The wizard's way in, shaped like the header's main action. */
export const START = 'inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep'

/**
 * "Set up your programme in a few minutes" (release 7 §1), on Members and on "Ways to earn": for a manager, while the
 * wizard was neither applied nor skipped (the bootstrap's `programme.ways.setup_done`). Start opens the wizard; Not now
 * asks once, then skips it — the options stay as they are and the banner does not come back.
 */
export function SetupBanner() {
  const { t } = useTranslation()
  const boot = useBoot()
  const client = useQueryClient()
  const [asking, setAsking] = useState(false)
  const skip = useMutation({
    mutationFn: optionsApi.skip,
    onSuccess: (answer) => { afterOptionsChange(client, answer); setAsking(false) },
  })
  const failure = skip.isError ? failureOf(skip.error) : null

  if (skip.isSuccess || !offersSetup(boot.staff.can.manage_program, boot.programme.ways)) return null

  return (
    <div data-setup-banner="" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
      <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-a-accent/15 text-a-accent-text">
        <WandSparkles size={22} />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-medium text-a-text">{t('loyalty.options.banner.title', 'Set up your programme in a few minutes')}</p>
        <p className="text-sm text-a-text-2">
          {t('loyalty.options.banner.line', 'Choose how members earn and what they get back, in four short steps. You can change everything later.')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" onClick={() => setAsking(true)}>{t('loyalty.options.banner.not_now', 'Not now')}</Button>
        <Link to="/loyalty/options/setup" className={START}>{t('loyalty.options.banner.start', 'Start')}</Link>
      </div>

      {asking && (
        <Dialog title={t('loyalty.options.banner.skip_title', 'Skip the setup?')} onClose={() => setAsking(false)} busy={skip.isPending}>
          <div className="space-y-4">
            <p className="text-sm text-a-text">
              {t('loyalty.options.banner.skip_body', 'Nothing changes now, and this suggestion will not come back. You can open the setup any time from Ways to earn.')}
            </p>
            {failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'skip', failure))}</Notice>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" disabled={skip.isPending} onClick={() => setAsking(false)}>{t('loyalty.options.banner.skip_keep', 'Back')}</Button>
              <Button type="button" loading={skip.isPending} onClick={() => skip.mutate()}>{t('loyalty.options.banner.skip_confirm', 'Skip setup')}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
