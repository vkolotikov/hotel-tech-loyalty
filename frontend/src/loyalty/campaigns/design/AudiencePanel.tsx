import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { OverviewButton } from '../../overview/OverviewUI'
import { points } from '../../lib/format'
import { campaignsApi, OPTIONS_KEY, SEGMENTS_KEY } from '../api'
import { RulesText } from '../SegmentsTab'
import { SegmentDialog } from '../SegmentDialog'
import { LoadFailed } from '../parts'
import type { Segment } from '../types'
import { useCampaignWords } from './words'
import { deniedRead } from './readState'

export function AudiencePanel({ value, onChange, subject, onMessage, busy }: { value: string; onChange: (value: string) => void; subject: string; onMessage: () => void; busy: boolean }) {
  const w = useCampaignWords(), { t, i18n } = useTranslation(), id = useId()
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: campaignsApi.segments })
  const options = useQuery({ queryKey: OPTIONS_KEY, queryFn: campaignsApi.segmentOptions, staleTime: 60_000 })
  const [copy, setCopy] = useState<Segment | null | false>(false)
  const list = deniedRead(segments.error) ? [] : segments.data?.segments ?? []
  const selected = list.find(s => String(s.id) === value)
  const error = segments.isError ? segments.error : options.isError ? options.error : null
  const opts = deniedRead(options.error) ? undefined : options.data
  return <section className="l-cm-panel"><h2>{w('who')}</h2>{error && <LoadFailed error={error} onRetry={() => { void segments.refetch(); void options.refetch() }} />}<label className="l-cm-field"><span id={id}>{w('savedSegment')}</span><select aria-labelledby={id} value={value} disabled={busy || !segments.data || deniedRead(segments.error)} onChange={e => onChange(e.target.value)}><option value="">{t('loyalty.campaigns.editor.choose_segment', 'Choose a segment')}</option>{list.map(s => <option key={s.id} value={s.id}>{s.problem ? t('loyalty.campaigns.editor.segment_problem', '{{name}} (a rule needs fixing)', { name: s.name }) : t('loyalty.campaigns.editor.segment_option', '{{name}} · {{number}} members', { name: s.name, number: points(s.members, i18n.language) })}</option>)}{value && !selected && <option value={value}>{t('loyalty.campaigns.editor.segment_gone', 'A segment that no longer exists')}</option>}</select></label>
    {selected && opts ? <div className="l-cm-rule-summary"><RulesText segment={selected} options={opts} /><small>{w('segmentCounts')}</small></div> : <p>{w('chooseSegment')}</p>}
    <div className="l-cm-actions"><OverviewButton disabled={busy || !opts || !!error} onClick={() => setCopy(selected ? { ...selected, name: t('loyalty.campaigns.copy_name', '{{name}} (copy)', { name: selected.name }) } : null)}>{selected ? w('customize') : t('loyalty.campaigns.segments.new', 'New segment')}</OverviewButton></div><div className="l-cm-rule-summary"><p>{w('copyHint')}</p></div><div className="l-cm-rule-summary"><strong>{subject}</strong><OverviewButton disabled={busy} onClick={onMessage}>← {w('backMessage')}</OverviewButton></div>
    {copy !== false && opts && <SegmentDialog segment={null} initial={copy ?? undefined} options={opts} onClose={() => setCopy(false)} onSaved={s => onChange(String(s.id))} />}
  </section>
}
