import { useTranslation } from 'react-i18next'
import { LANGUAGES, languageName } from '../../lib/languages'
import { optionText, PRICE_POSITIONS } from '../../lib/options'
import type { BrandPayload, ProfileFields } from '../../lib/types'
import { asList, asText, changedFields, orNull } from '../brandForms'
import { ReadRow, ReadTags, Segmented, SelectField, TagInput, TextField } from '../inputs'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

export interface DnaForm {
  name: string; default_language: string; primary_goal: string; brand_summary: string; usp: string; mission: string
  brand_promise: string; differentiators: string; brand_values: string[]; proof_points: string[]; price_position: string
  main_cta: string; important_links: string[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const dnaForm = (brand: BrandPayload): DnaForm => {
  const p = brand.profile
  return {
    name: asText(p?.name), default_language: asText(p?.default_language), primary_goal: asText(p?.primary_goal),
    brand_summary: asText(p?.brand_summary), usp: asText(p?.usp), mission: asText(p?.mission), brand_promise: asText(p?.brand_promise),
    differentiators: asText(p?.differentiators), brand_values: asList(p?.brand_values), proof_points: asList(p?.proof_points),
    price_position: asText(p?.price_position), main_cta: asText(p?.main_cta), important_links: asList(p?.important_links),
  }
}

/** The form as the server takes it; `name` and `default_language` may not be null, so an emptied one is left out. */
// eslint-disable-next-line react-refresh/only-export-components
export const dnaFields = (f: DnaForm): ProfileFields => ({
  name: f.name.trim() === '' ? undefined : f.name.trim(),
  default_language: f.default_language === '' ? undefined : f.default_language,
  primary_goal: orNull(f.primary_goal), brand_summary: orNull(f.brand_summary), usp: orNull(f.usp), mission: orNull(f.mission),
  brand_promise: orNull(f.brand_promise), differentiators: orNull(f.differentiators), brand_values: f.brand_values,
  proof_points: f.proof_points, price_position: orNull(f.price_position), main_cta: orNull(f.main_cta), important_links: f.important_links,
})

/** What stops a Brand DNA save: a brand needs a name (the server keeps the old one rather than none). */
// eslint-disable-next-line react-refresh/only-export-components
export const dnaProblems = (form: DnaForm): string[] => (form.name.trim() === '' ? ['name'] : [])

/** Brand DNA (spec §4.6): who the brand is — its name and language for posts, goal, summary, what sets it apart, values, proof, price, call to action, links. */
export function BrandDnaSection({ brand, canEdit, startOpen, onSaved, defaults }: {
  brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void
  /** What a brand with no profile starts from (Guided setup: its name and language), so the first Save creates the profile. */
  defaults?: Partial<DnaForm>
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const { saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.dna.${key}`, english)
  const shown = dnaForm(brand)
  const prices = Object.keys(PRICE_POSITIONS).map(v => [v, optionText(t, 'price', v)] as [string, string])
  const languages = LANGUAGES.map(code => [code, languageName(code, locale)] as [string, string])

  return (
    <SectionCard<DnaForm> id="content-dna" title={w('title', 'Brand DNA')} description={w('intro', 'Who the brand is, in its own words. The AI writes from this.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} check={dnaProblems}
      makeDraft={() => ({ ...dnaForm(brand), ...(brand.profile ? {} : defaults) })}
      makeBase={() => dnaForm(brand)}
      save={(draft, base) => saveProfile(changedFields(dnaFields(base), dnaFields(draft)))}
      readView={(
        <dl className="grid gap-4 md:grid-cols-2">
          <ReadRow label={w('name', 'Brand name')} value={shown.name} />
          <ReadRow label={w('language', 'Language of the posts')} value={shown.default_language ? languageName(shown.default_language, locale) : ''} />
          <ReadRow label={w('goal', 'Main goal')} value={shown.primary_goal} />
          <ReadRow label={w('price', 'Price position')} value={shown.price_position ? optionText(t, 'price', shown.price_position) : ''} />
          <ReadRow label={w('summary', 'Brand summary')} value={shown.brand_summary} />
          <ReadRow label={w('usp', 'What makes it different')} value={shown.usp} />
          <ReadRow label={w('mission', 'Mission')} value={shown.mission} />
          <ReadRow label={w('promise', 'Brand promise')} value={shown.brand_promise} />
          <ReadRow label={w('differentiators', 'Differentiators')} value={shown.differentiators} />
          <ReadRow label={w('cta', 'Main call to action')} value={shown.main_cta} />
          <ReadTags label={w('values', 'Values')} values={shown.brand_values} />
          <ReadTags label={w('proof', 'Proof points')} values={shown.proof_points} />
          <ReadTags label={w('links', 'Important links')} values={shown.important_links} />
        </dl>
      )}
      editView={(draft, change, invalid) => (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label={w('name', 'Brand name')} value={draft.name} maxLength={255} required invalid={invalid.includes('name')} onChange={(name) => change({ ...draft, name })} />
          <SelectField label={w('language', 'Language of the posts')} value={draft.default_language} options={languages} empty={w('language_none', 'Choose a language')} required
            onChange={(default_language) => change({ ...draft, default_language })} />
          <div className="md:col-span-2"><TextField label={w('goal', 'Main goal')} value={draft.primary_goal} rows={2} invalid={invalid.includes('primary_goal')} onChange={(primary_goal) => change({ ...draft, primary_goal })} /></div>
          <div className="md:col-span-2"><TextField label={w('summary', 'Brand summary')} value={draft.brand_summary} rows={4} invalid={invalid.includes('brand_summary')} onChange={(brand_summary) => change({ ...draft, brand_summary })} /></div>
          <TextField label={w('usp', 'What makes it different')} value={draft.usp} rows={3} invalid={invalid.includes('usp')} onChange={(usp) => change({ ...draft, usp })} />
          <TextField label={w('differentiators', 'Differentiators')} value={draft.differentiators} rows={3} invalid={invalid.includes('differentiators')} onChange={(differentiators) => change({ ...draft, differentiators })} />
          <TextField label={w('mission', 'Mission')} value={draft.mission} rows={2} invalid={invalid.includes('mission')} onChange={(mission) => change({ ...draft, mission })} />
          <TextField label={w('promise', 'Brand promise')} value={draft.brand_promise} rows={2} invalid={invalid.includes('brand_promise')} onChange={(brand_promise) => change({ ...draft, brand_promise })} />
          <TagInput label={w('values', 'Values')} values={draft.brand_values} onChange={(brand_values) => change({ ...draft, brand_values })} />
          <TagInput label={w('proof', 'Proof points')} values={draft.proof_points} onChange={(proof_points) => change({ ...draft, proof_points })} />
          <Segmented label={w('price', 'Price position')} options={prices} value={draft.price_position} onChange={(price_position) => change({ ...draft, price_position })} />
          <TextField label={w('cta', 'Main call to action')} value={draft.main_cta} invalid={invalid.includes('main_cta')} onChange={(main_cta) => change({ ...draft, main_cta })} />
          <div className="md:col-span-2"><TagInput label={w('links', 'Important links')} values={draft.important_links} onChange={(important_links) => change({ ...draft, important_links })} /></div>
        </div>
      )} />
  )
}
