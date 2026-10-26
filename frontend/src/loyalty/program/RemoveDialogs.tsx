import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { useFirstFocus } from '../lib/useFirstFocus'
import { FormField, FormFoot } from '../ui/formParts'
import { afterProgramChange, programApi, removalKey } from './api'
import { ERRORS } from './errors'
import { moveTarget, tierRemovalLines } from './programMath'
import type { Benefit, BenefitRemoval, Tier, TierRemoval } from './types'
import { REMOVAL_WORDS, TIER_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Release 11 (owner 2026-10-26: "an option for users to delete or rename tiers and benefits"): rename a tier or a
 * benefit with its name alone — the quickest way to make a preset's words the venue's own. Everything else about it
 * stays as it is; the full Edit form keeps the rest.
 */
export function RenameDialog({ subject, onClose }: { subject: { kind: 'tier'; tier: Tier } | { kind: 'benefit'; benefit: Benefit }; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const current = subject.kind === 'tier' ? subject.tier.name : subject.benefit.name
  const [name, setName] = useState(current)
  const [tried, setTried] = useState(false)
  const save = useMutation({
    mutationFn: async (): Promise<unknown> => (subject.kind === 'tier' ? programApi.renameTier(subject.tier.id, name.trim()) : programApi.updateBenefit(subject.benefit.id, { name: name.trim() })),
    onSuccess: () => { afterProgramChange(client, { tiers: subject.kind === 'tier', benefits: true }); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client, { tiers: subject.kind === 'tier', benefits: true }) },
  })
  const failure = save.isError ? failureOf(save.error) : null
  const taken = subject.kind === 'tier' && !!failure?.fields?.name
  const empty = tried && name.trim() === ''
  const problem = empty
    ? (subject.kind === 'tier' ? t('loyalty.program.tier.problem.name', TIER_PROBLEM_WORDS.name) : t('loyalty.program.benefit.problem.name', 'Give the benefit a name.'))
    : taken ? t('loyalty.program.tier.problem.name_taken', TIER_PROBLEM_WORDS.name_taken) : null
  const family = subject.kind === 'tier' ? 'tier' : 'benefit'

  return (
    <Dialog title={t('loyalty.program.rename.title', 'Rename {{name}}', { name: current })} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (name.trim() === '') return
        if (name.trim() === current) { onClose(); return }
        save.mutate()
      }}>
        <FormField label={t('loyalty.program.rename.name', 'New name')} problem={problem}
          hint={subject.kind === 'tier'
            ? t('loyalty.program.rename.tier_hint', 'Members see the new name on their card, in the app and in the portal.')
            : t('loyalty.program.rename.benefit_hint', 'Members see the new name in the app and the portal, on their requests too.')}>
          <input ref={first} type="text" value={name} maxLength={255} className={INPUT}
            onChange={(e) => { setName(e.target.value); if (save.isError) save.reset() }} />
        </FormField>
        {failure && !taken && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, family, failure))}</Notice>}
        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} save={t('loyalty.program.rename.save', 'Rename')} busy={save.isPending} onCancel={onClose} />
      </form>
    </Dialog>
  )
}

/**
 * Release 11: delete a tier, once its consequences are read from the server (TierRemoval) — where its members go
 * (the nearest tier below members can earn, unless chosen otherwise), and each place, event, boost, offer or segment
 * it changes, the ones that need staff afterwards marked. The last tier switched on cannot go, and says why.
 */
export function RemoveTier({ tier, onClose }: { tier: Tier; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const query = useQuery({ queryKey: removalKey('tier', tier.id), queryFn: () => programApi.tierRemoval(tier.id), staleTime: 0, gcTime: 0 })
  const removal = query.data?.removal
  const [chosen, setChosen] = useState<number | null>(null)
  const target = removal ? moveTarget(removal, chosen) : null
  const remove = useMutation({
    mutationFn: () => programApi.removeTier(tier.id, removal && removal.members + removal.members_off > 0 ? target : null),
    onSuccess: () => { onClose(); afterDelete(client) },
    onError: (error) => {
      const code = failureOf(error).code
      if (code === 'not_found') afterDelete(client)
      if (code === 'move_to_unknown' || code === 'last_tier') void query.refetch()
    },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  const loadFailure = query.isError ? failureOf(query.error) : null

  return (
    <Dialog title={t('loyalty.program.remove_tier.title', 'Delete {{name}}?', { name: tier.name })} onClose={onClose} busy={remove.isPending}>
      <div className="space-y-4 text-sm text-a-text">
        {!removal && query.isLoading && (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-16" />
          </div>
        )}
        {loadFailure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'remove_tier', loadFailure))}</Notice>}

        {removal && removal.blocked === 'last_tier' && (
          <Notice tone="warning">
            {t('loyalty.program.remove_tier.last', '{{tier}} is the last tier switched on. Members need a tier, so it cannot be deleted. Add or switch on another tier first.', { tier: removal.tier.name })}
          </Notice>
        )}

        {removal && removal.blocked === null && (
          <>
            <p>{t('loyalty.program.remove_tier.intro', '{{tier}} leaves the programme and every list. Members’ history keeps its name.', { tier: removal.tier.name })}</p>
            {removal.members + removal.members_off > 0 ? (
              <FormField
                label={removal.members > 0
                  ? t('loyalty.program.remove_tier.move_to', 'Members of {{tier}} ({{n}}) move to', { tier: removal.tier.name, n: points(removal.members, locale) })
                  : t('loyalty.program.remove_tier.move_off_only', 'Switched-off members of {{tier}} ({{n}}) move to', { tier: removal.tier.name, n: points(removal.members_off, locale) })}
                hint={[
                  t('loyalty.program.remove_tier.move_hint', 'Their points stay as they are. They are not sent a message.'),
                  removal.members > 0 && removal.members_off > 0 ? t('loyalty.program.remove_tier.move_off', 'Switched-off members ({{n}}) move with them.', { n: points(removal.members_off, locale) }) : '',
                ].filter(Boolean).join(' ')}>
                <select value={target ?? ''} onChange={(e) => { setChosen(Number(e.target.value)); if (remove.isError) remove.reset() }} className={INPUT}>
                  {removal.move_options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </FormField>
            ) : (
              <p data-no-members="" className="text-a-text-2">{t('loyalty.program.remove_tier.no_members', 'No member holds this tier.')}</p>
            )}
            <RemovalList removal={removal} />
          </>
        )}

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'remove_tier', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={remove.isPending}>
            {removal?.blocked ? t('loyalty.program.remove_tier.close', 'Close') : t('loyalty.program.remove_tier.keep', 'Keep it')}
          </Button>
          {removal && removal.blocked === null && (
            <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('loyalty.program.remove_tier.confirm', 'Delete {{name}}', { name: removal.tier.name })}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/** What else deleting the tier changes, one line each; a line that asks staff to act afterwards stands out. */
function RemovalList({ removal }: { removal: TierRemoval }) {
  const { t } = useTranslation()
  const lines = tierRemovalLines(removal)
  if (lines.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-a-text-2">{t('loyalty.program.remove_tier.also', 'It also changes')}</p>
      <ul aria-label={t('loyalty.program.remove_tier.also', 'It also changes')} className="space-y-1.5">
        {lines.map((line, i) => {
          const Icon = line.warn ? AlertTriangle : Info
          return (
            <li key={i} data-line={line.code} data-warn={line.warn ? '' : undefined}
              className={`flex gap-2 rounded-lg px-3 py-2 ${line.warn ? 'l-st-tint' : 'bg-a-surface-2'}`} data-state={line.warn ? 'pending' : undefined}>
              <Icon size={15} aria-hidden className={`mt-0.5 shrink-0 ${line.warn ? 'l-st-text' : 'text-a-text-2'}`} />
              <span>{t(`loyalty.program.remove_tier.line.${line.code}`, REMOVAL_WORDS[line.code] ?? line.code, line.vars)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Release 11: delete a benefit from the catalogue (BenefitRemoval) — off every tier that gives it, its requests kept
 * under its name, the ones still waiting left for staff to decide.
 */
export function RemoveBenefit({ benefit, onClose }: { benefit: Benefit; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const query = useQuery({ queryKey: removalKey('benefit', benefit.id), queryFn: () => programApi.benefitRemoval(benefit.id), staleTime: 0, gcTime: 0 })
  const removal: BenefitRemoval | undefined = query.data?.removal
  const remove = useMutation({
    mutationFn: () => programApi.removeBenefit(benefit.id),
    onSuccess: () => { onClose(); afterDelete(client) },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterDelete(client) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  const loadFailure = query.isError ? failureOf(query.error) : null

  return (
    <Dialog title={t('loyalty.program.remove_benefit.title', 'Delete {{name}}?', { name: benefit.name })} onClose={onClose} busy={remove.isPending}>
      <div className="space-y-4 text-sm text-a-text">
        {!removal && query.isLoading && (
          <div role="status"><span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span><Skeleton className="h-16" /></div>
        )}
        {loadFailure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'remove_benefit', loadFailure))}</Notice>}
        {removal && (
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{removal.tiers.length > 0
              ? t('loyalty.program.remove_benefit.tiers', 'It leaves the catalogue and the tiers that give it: {{tiers}}.', { tiers: removal.tiers.join(' · ') })
              : t('loyalty.program.remove_benefit.no_tiers', 'It leaves the catalogue. No tier gives it now.')}</li>
            {removal.waiting > 0 && (
              <li data-waiting="">{t('loyalty.program.remove_benefit.waiting', 'Requests for it still waiting: {{n}}. They stay in Requests for you to approve or decline.', { n: points(removal.waiting, locale) })}</li>
            )}
            {removal.requests > 0 && <li>{t('loyalty.program.remove_benefit.history', 'Members’ past requests keep its name.')}</li>}
            <li>{t('loyalty.program.remove_benefit.instead', 'To pause it instead, switch it off: it comes back with one press.')}</li>
          </ul>
        )}
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'remove_benefit', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={remove.isPending}>{t('loyalty.program.remove_benefit.keep', 'Keep it')}</Button>
          {removal && (
            <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('loyalty.program.remove_benefit.confirm', 'Delete benefit')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/**
 * A delete reaches past Program (places, events, offers, segments, members, the shell's tiers): read it all again — all
 * but the previews, which would ask after what is gone.
 */
function afterDelete(client: ReturnType<typeof useQueryClient>): void {
  client.removeQueries({ queryKey: ['loyalty', 'program', 'removal'] })
  afterProgramChange(client, { tiers: true, benefits: true })
  void client.invalidateQueries({ queryKey: ['loyalty'] })
}
