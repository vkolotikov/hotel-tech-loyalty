import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { overviewScope } from '../overview/overviewMath'
import { failureOf, mediaUrl } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { megabytes, pictureProblem } from '../rewards/rewardsMath'
import { PICTURE_PROBLEM_WORDS } from '../rewards/words'
import { START_KEY } from '../start/startMath'
import { LOOK_KEY, appApi } from './api'
import { ERRORS } from './errors'
import { LoadFailed, Loading, Part } from './parts'
import type { LookAnswer } from './types'

/** The live logo upload stays available independently of the parked app designers and Wallet credentials. */
export function LogoPanel() {
  const boot = useBoot(), queryKey = [...LOOK_KEY, overviewScope(boot)]
  const query = useQuery({ queryKey, queryFn: appApi.look, enabled: boot.staff.can.manage_app })
  if (!boot.staff.can.manage_app) return null
  if (query.isError) return <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />
  if (!query.data) return <Loading />
  return <LogoField key={overviewScope(boot)} logo={query.data.look.logo_url} limits={query.data.options.logo} queryKey={queryKey} />
}

/** Saved immediately through the existing tenant-owned media writer. */
export function LogoField({ logo, limits, queryKey }: { logo: string | null; limits: LookAnswer['options']['logo']; queryKey: readonly unknown[] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const boot = useBoot()
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  const send = useMutation({
    mutationFn: (file: File) => appApi.uploadLogo(file),
    onSuccess: ({ logo_url }) => {
      client.setQueryData<LookAnswer>(queryKey, prev => (prev ? { ...prev, look: { ...prev.look, logo_url } } : prev))
      void client.invalidateQueries({ queryKey: START_KEY })
      void client.invalidateQueries({ queryKey: ['loyalty', 'overview', overviewScope(boot), 'summary'] })
    },
  })
  const vars = { mb: points(megabytes(limits.max_kb), locale), edge: points(limits.max_edge, locale) }
  const failure = send.isError ? failureOf(send.error) : null

  return <div data-logo-editor="">
    <Part title={t('loyalty.app.logo.title', 'Logo')} line={t('loyalty.app.logo.line', 'Shown on member cards, in the app and in the member portal.')}>
      <div className="flex flex-wrap items-center gap-4">
        {logo
          ? <img src={mediaUrl(logo)} alt={t('loyalty.app.logo.alt', 'The venue’s logo')} loading="lazy" className="h-16 w-16 rounded-xl border border-a-border bg-a-surface-2 object-contain p-1" />
          : <p className="rounded-xl border border-dashed border-a-border px-4 py-4 text-sm text-a-text-2">{t('loyalty.app.logo.none', 'No logo yet.')}</p>}
        <input ref={input} type="file" accept={limits.types.join(',')} className="sr-only" tabIndex={-1} aria-hidden disabled={send.isPending} onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const found = pictureProblem(file, limits)
          setProblem(found)
          send.reset()
          if (found === null) send.mutate(file)
        }} />
        <Button type="button" variant="secondary" size="sm" loading={send.isPending} onClick={() => input.current?.click()}>
          <ImagePlus size={14} aria-hidden />{logo ? t('loyalty.app.logo.replace', 'Replace logo') : t('loyalty.app.logo.upload', 'Upload logo')}
        </Button>
      </div>
      <p className="text-xs text-a-text-2">{t('loyalty.app.logo.hint', 'JPEG, PNG or WebP, up to {{mb}} MB. Saved at once.', vars)}</p>
      {problem && <p role="alert" className="text-xs font-medium text-a-danger">{t(`loyalty.rewards.picture.problem.${problem}`, PICTURE_PROBLEM_WORDS[problem], vars)}</p>}
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'logo', failure), vars)}</Notice>}
      {send.isSuccess && <Notice tone="success">{t('loyalty.app.logo.saved', 'Logo saved. Your setup checklist has been updated.')}</Notice>}
      <Link to="/loyalty/start" className="l-ov-link">{t('loyalty.app.logo.back_to_setup', 'Back to setup')} →</Link>
    </Part>
  </div>
}
