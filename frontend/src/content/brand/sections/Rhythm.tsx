import { useTranslation } from 'react-i18next'
import { Button } from '../../../workspace/ui/Button'
import { addDays, formatDate } from '../../../workspace/lib/wallClock'
import {
  DEFAULT_RHYTHM, ENGAGEMENT_GOALS, IMAGE_TYPES, MIX_CATEGORIES, optionText, RHYTHM_DAYS, TREND_HINTS, TREND_MODES, VISUAL_STYLES, WEEKDAY_ROLES,
} from '../../lib/options'
import type { BrandPayload, ProfileFields, RhythmDay, VisualStyle } from '../../lib/types'
import { asList, asMix, asRhythm, asText, changedFields } from '../brandForms'
import { ChoiceChips, INPUT, ReadRow, ReadTags, Segmented, SelectField, TagInput } from '../inputs'
import { balanceMix, mixTotal } from '../mixMath'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

/** A Monday: the rhythm's days are named from it in the reader's language. */
const A_MONDAY = '2026-10-12'

interface RhythmForm {
  rhythm: Record<string, RhythmDay>
  mixMode: 'ai' | 'manual'
  mix: Record<string, number>
  engagement_goals: string[]
  trend_mode: string
  visualRest: Record<string, unknown>
  style: string; image_types: string[]; colors: string[]; avoid: string[]
}

const blank = (day: RhythmDay) => asText(day.role) === '' && asText(day.notes) === ''

// eslint-disable-next-line react-refresh/only-export-components
export const rhythmForm = (brand: BrandPayload): RhythmForm => {
  const p = brand.profile
  const mix = asMix(p?.content_mix)
  const visual = (p?.visual_style && typeof p.visual_style === 'object' && !Array.isArray(p.visual_style) ? p.visual_style : {}) as VisualStyle & Record<string, unknown>
  const { style, image_types, colors, avoid, ...visualRest } = visual
  return {
    rhythm: asRhythm(p?.weekly_rhythm), mixMode: Object.keys(mix).length > 0 ? 'manual' : 'ai', mix,
    engagement_goals: asList(p?.engagement_goals), trend_mode: asText(p?.trend_mode), visualRest,
    style: asText(style), image_types: asList(image_types), colors: asList(colors), avoid: asList(avoid),
  }
}

/** The form as the server takes it: an all-empty week is "none"; the AI deciding the mix is an empty mix; trend_mode may not be null. */
// eslint-disable-next-line react-refresh/only-export-components
export const rhythmFields = (f: RhythmForm): ProfileFields => ({
  weekly_rhythm: Object.values(f.rhythm).every(blank) ? {} : f.rhythm,
  content_mix: f.mixMode === 'ai' ? {} : Object.fromEntries(Object.entries(f.mix).filter(([, pct]) => pct > 0)),
  engagement_goals: f.engagement_goals,
  trend_mode: f.trend_mode === '' ? undefined : f.trend_mode,
  visual_style: { ...f.visualRest, style: f.style, image_types: f.image_types, colors: f.colors, avoid: f.avoid },
})

/** Rhythm and goals (spec §4.6): the week's shape, the content mix, what posts should achieve, how far to follow trends, the look of images. */
export function RhythmSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const { saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.rhythm.${key}`, english)
  const dayName = (i: number) => formatDate(addDays(A_MONDAY, i), locale, { weekday: 'long' })
  const roles = Object.keys(WEEKDAY_ROLES).map(v => [v, optionText(t, 'role', v)] as [string, string])
  const shown = rhythmForm(brand)

  return (
    <SectionCard<RhythmForm> id="content-rhythm" title={w('title', 'Rhythm and goals')}
      description={w('intro', 'The shape of the week, the content mix, and what the posts should achieve.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} makeDraft={() => rhythmForm(brand)}
      save={(draft, base) => saveProfile(changedFields(rhythmFields(base), rhythmFields(draft)))}
      readView={(
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-a-text-2">{w('days', 'Weekly rhythm')}</p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {RHYTHM_DAYS.map((day, i) => (
                <li key={day} className="text-a-text">
                  <span className="text-a-text-2">{dayName(i)}: </span>
                  {blank(shown.rhythm[day]) ? t('content.brand.empty', 'Not set yet') : [shown.rhythm[day].role ? optionText(t, 'role', asText(shown.rhythm[day].role)) : '', asText(shown.rhythm[day].notes)].filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-a-text-2">{w('mix', 'Content mix')}</p>
            {shown.mixMode === 'ai'
              ? <p className="text-sm text-a-text">{w('mix_by_ai', 'The AI decides the mix.')}</p>
              : <ul className="flex flex-wrap gap-1.5">{Object.entries(shown.mix).map(([k, pct]) => <li key={k} className="rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text">{optionText(t, 'mix', k)} {pct} %</li>)}</ul>}
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            <ReadTags label={w('goals', 'Engagement goals')} values={shown.engagement_goals.map(v => optionText(t, 'engagement', v))} />
            <ReadRow label={w('trend', 'Trends')} value={shown.trend_mode ? optionText(t, 'trend', shown.trend_mode) : ''} />
            <ReadRow label={w('style', 'Visual style')} value={shown.style ? optionText(t, 'visual_style', shown.style) : ''} />
            <ReadTags label={w('image_types', 'Kinds of images')} values={shown.image_types.map(v => optionText(t, 'image_type', v))} />
            <ReadTags label={w('colors', 'Colours')} values={shown.colors} />
            <ReadTags label={w('avoid', 'Avoid in images')} values={shown.avoid} />
          </dl>
        </div>
      )}
      editView={(draft, change) => {
        const setDay = (day: string, part: Partial<RhythmDay>) => change({ ...draft, rhythm: { ...draft.rhythm, [day]: { ...draft.rhythm[day], ...part } } })
        const total = mixTotal(draft.mix)
        return (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{w('days', 'Weekly rhythm')}</legend>
              {Object.values(draft.rhythm).every(blank) && (
                <Button size="sm" variant="secondary" onClick={() => change({ ...draft, rhythm: { ...draft.rhythm, ...Object.fromEntries(RHYTHM_DAYS.map(d => [d, { ...draft.rhythm[d], ...DEFAULT_RHYTHM[d] }])) } })}>
                  {w('usual_week', 'Start from a usual week')}
                </Button>
              )}
              {RHYTHM_DAYS.map((day, i) => (
                <div key={day} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr]">
                  <span className="pb-2 text-sm text-a-text">{dayName(i)}</span>
                  <SelectField label={w('role', 'Role of the day')} value={asText(draft.rhythm[day].role)} options={roles} empty="—" onChange={(role) => setDay(day, { role })} />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-a-text-2">{w('notes', 'Notes')}</span>
                    <input value={asText(draft.rhythm[day].notes)} maxLength={500} onChange={(e) => setDay(day, { notes: e.target.value })} className={`${INPUT} border-a-border`} />
                  </label>
                </div>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{w('mix', 'Content mix')}</legend>
              <Segmented label={w('mix_who', 'Who sets it')} value={draft.mixMode}
                options={[['ai', w('mix_ai', 'Let the AI decide')], ['manual', w('mix_manual', 'Set it myself')]]}
                onChange={(mode) => change({ ...draft, mixMode: mode === 'manual' ? 'manual' : 'ai', mix: mode === 'manual' && mixTotal(draft.mix) === 0 ? balanceMix({}) : draft.mix })} />
              {draft.mixMode === 'manual' && (
                <div className="space-y-2">
                  {/* The known categories, then any the stored mix holds that the list does not know (they count in the total). */}
                  {[...Object.keys(MIX_CATEGORIES), ...Object.keys(draft.mix).filter(key => !(key in MIX_CATEGORIES))].map(key => (
                    <label key={key} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-sm text-a-text">
                      {optionText(t, 'mix', key)}
                      <input type="number" min={0} max={100} step={5} value={draft.mix[key] ?? 0}
                        onChange={(e) => change({ ...draft, mix: { ...draft.mix, [key]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } })}
                        className={`${INPUT} border-a-border text-right`} />
                    </label>
                  ))}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-sm font-medium ${total === 100 ? 'text-a-text' : 'text-a-danger'}`}>{t('content.brand.rhythm.total', 'Total {{total}} %', { total })}</span>
                    <Button size="sm" variant="secondary" onClick={() => change({ ...draft, mix: balanceMix(draft.mix) })}>{w('balance', 'Balance to 100 %')}</Button>
                  </div>
                </div>
              )}
            </fieldset>

            <ChoiceChips label={w('goals', 'Engagement goals')} options={Object.keys(ENGAGEMENT_GOALS).map(v => [v, optionText(t, 'engagement', v)])}
              values={draft.engagement_goals} onChange={(engagement_goals) => change({ ...draft, engagement_goals })} />
            <div className="space-y-1">
              <Segmented label={w('trend', 'Trends')} options={Object.keys(TREND_MODES).map(v => [v, optionText(t, 'trend', v)])}
                value={draft.trend_mode} required onChange={(trend_mode) => change({ ...draft, trend_mode })} />
              {draft.trend_mode in TREND_HINTS && <p className="text-xs text-a-text-2">{optionText(t, 'trend_hint', draft.trend_mode)}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label={w('style', 'Visual style')} value={draft.style} empty={w('style_none', 'No style chosen')}
                options={Object.keys(VISUAL_STYLES).map(v => [v, optionText(t, 'visual_style', v)])} onChange={(style) => change({ ...draft, style })} />
              <TagInput label={w('colors', 'Colours')} values={draft.colors} onChange={(colors) => change({ ...draft, colors })} />
              <ChoiceChips label={w('image_types', 'Kinds of images')} options={Object.keys(IMAGE_TYPES).map(v => [v, optionText(t, 'image_type', v)])}
                values={draft.image_types} onChange={(image_types) => change({ ...draft, image_types })} />
              <TagInput label={w('avoid', 'Avoid in images')} values={draft.avoid} onChange={(avoid) => change({ ...draft, avoid })} />
            </div>
          </div>
        )
      }} />
  )
}
