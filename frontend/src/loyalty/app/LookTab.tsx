import { useId, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check as CheckIcon, ImagePlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { named } from '../lib/forms'
import { Toggle } from '../ui/formParts'
import { megabytes, pictureProblem } from '../rewards/rewardsMath'
import { PICTURE_PROBLEM_WORDS } from '../rewards/words'
import { LOOK_KEY, appApi } from './api'
import {
  applyPreset, chosenPreset, lookBody, lookChanged, lookFormOf, lookProblems, lookServerProblems, previewPaint, previewTier, type LookForm,
} from './appMath'
import { ERRORS } from './errors'
import { ColourField, LoadFailed, Loading, Part } from './parts'
import { PhonePreview } from './PhonePreview'
import type { LookAnswer, Preset } from './types'
import {
  ACCENT_WORDS, BUTTON_STYLE_WORDS, CARD_STYLE_WORDS, COLOUR_WORDS, LOOK_PROBLEM_WORDS, PRESET_LINE_WORDS, PRESET_WORDS,
} from './words'

/**
 * The member app's look (release 2 §7): the presets, the eleven colours with their swatches, the card and button
 * styles, the corner radius, the accent's strength, the logo, and a phone-sized preview drawn with what the form holds.
 * The lists and the presets are the server's (AppLook); the look is saved as a whole, the logo at once on its own.
 */
export function LookTab() {
  const query = useQuery({ queryKey: LOOK_KEY, queryFn: appApi.look })
  const data = query.data

  if (query.isError && !data) return <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />
  if (!data) return <Loading />
  return <LookEditor answer={data} />
}

/** The look once read. The form starts from the saved look and takes the server's answer after each save. */
export function LookEditor({ answer }: { answer: LookAnswer }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const client = useQueryClient()
  const { look, options } = answer
  const [form, setForm] = useState<LookForm>(() => lookFormOf(look, options))
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => appApi.saveLook(lookBody(form, options)),
    onSuccess: (saved) => {
      client.setQueryData<LookAnswer>(LOOK_KEY, prev => (prev ? { ...prev, look: { ...saved.look, logo_url: prev.look.logo_url } } : prev))
      setForm(lookFormOf(saved.look, options))
      setTried(false)
    },
  })
  const update = (patch: Partial<LookForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError || save.isSuccess) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? lookProblems(form, options) : {}), ...lookServerProblems(failure?.fields) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.app.look.problem.${code}`, LOOK_PROBLEM_WORDS[code] ?? LOOK_PROBLEM_WORDS.colour) : null
  }
  const word = (prefix: string, words: Record<string, string>, value: string) => {
    const key = named(prefix, words, value)
    return key ? t(...key) : value
  }
  const chosen = chosenPreset(form, look.preset, options)
  const changed = lookChanged(form, look, options)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-5">
      <form className="space-y-5" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(lookProblems(form, options)).length === 0) save.mutate()
      }}>
        <Part title={t('loyalty.app.look.presets', 'Presets')} line={t('loyalty.app.look.presets_line', 'A preset sets all eleven colours; change any of them afterwards.')}>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {options.presets.map(preset => (
              <li key={preset.key}>
                <PresetButton preset={preset} on={chosen?.key === preset.key} onPick={() => update(applyPreset(form, preset))}
                  name={word('loyalty.app.preset', PRESET_WORDS, preset.key)} line={word('loyalty.app.preset_line', PRESET_LINE_WORDS, preset.key)} />
              </li>
            ))}
          </ul>
          {chosen?.changed && (
            <p className="text-xs text-a-text-2">{t('loyalty.app.look.preset_changed', '{{name}}, with your changes.', { name: word('loyalty.app.preset', PRESET_WORDS, chosen.key) })}</p>
          )}
        </Part>

        <Part title={t('loyalty.app.look.colours', 'Colours')}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {options.colors.map(key => (
              <ColourField key={key} label={word('loyalty.app.colour', COLOUR_WORDS, key)} value={form.colors[key] ?? ''} problem={problem(`colors.${key}`)}
                onChange={(text) => update({ colors: { ...form.colors, [key]: text } })} />
            ))}
          </div>
        </Part>

        <Part title={t('loyalty.app.look.styles', 'Shapes and styles')}>
          <Choice label={t('loyalty.app.look.card_style', 'Member card')} problem={problem('card_style')}>
            {options.card_styles.map(value => (
              <Toggle key={value} on={form.card_style === value} onClick={() => update({ card_style: value })}>{word('loyalty.app.card_style', CARD_STYLE_WORDS, value)}</Toggle>
            ))}
          </Choice>
          <Radius value={form.radius} min={options.radius.min} max={options.radius.max} problem={problem('radius')} onChange={(radius) => update({ radius })} />
          <Choice label={t('loyalty.app.look.button_style', 'Buttons')} problem={problem('button_style')}>
            {options.button_styles.map(value => (
              <Toggle key={value} on={form.button_style === value} onClick={() => update({ button_style: value })}>{word('loyalty.app.button_style', BUTTON_STYLE_WORDS, value)}</Toggle>
            ))}
          </Choice>
          <Choice label={t('loyalty.app.look.accent', 'Accent strength')} problem={problem('accent_intensity')}>
            {options.accent_intensities.map(value => (
              <Toggle key={value} on={form.accent_intensity === value} onClick={() => update({ accent_intensity: value })}>{word('loyalty.app.accent', ACCENT_WORDS, value)}</Toggle>
            ))}
          </Choice>
        </Part>

        <div className="space-y-3">
          {failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'look', failure))}</Notice>}
          {save.isSuccess && <Notice tone="success">{t('loyalty.app.look.saved', 'Saved. The app shows it the next time it opens.')}</Notice>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {changed && <p className="text-sm text-a-text-2">{t('loyalty.app.look.unsaved', 'Not saved yet.')}</p>}
            <Button type="submit" loading={save.isPending}>{t('loyalty.app.look.save', 'Save look')}</Button>
          </div>
        </div>
      </form>

      <LogoField logo={look.logo_url} limits={options.logo} />
      </div>

      <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start" aria-label={t('loyalty.app.look.preview', 'Preview')}>
        <PhonePreview paint={previewPaint(form, look.colors, options)} logo={look.logo_url} venue={boot.organization.name} tier={previewTier(boot.programme.tiers)} />
        <p className="text-center text-xs text-a-text-2">{t('loyalty.app.look.preview_line', 'As the app draws it. It changes as you edit.')}</p>
      </aside>
    </div>
  )
}

/** A preset: a strip of its colours, its name and line; pressed while it is the one applied. */
function PresetButton({ preset, on, name, line, onPick }: { preset: Preset; on: boolean; name: string; line: string; onPick: () => void }) {
  const bars = [preset.colors.primary, preset.colors.background, preset.colors.surface, preset.colors.success, preset.colors.info]
  return (
    <button type="button" aria-pressed={on} onClick={onPick} data-preset={preset.key}
      className={`flex w-full flex-col overflow-hidden rounded-xl border text-left ${on ? 'border-a-accent-text ring-1 ring-a-accent-text' : 'border-a-border hover:border-a-accent-text'}`}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden className="block h-6 w-full">
        {bars.map((hex, i) => <rect key={i} x={i * 20} y="0" width={i === bars.length - 1 ? 20 : 20.5} height="10" fill={hex} />)}
      </svg>
      <span className="flex items-start gap-1.5 bg-a-surface px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-a-text">{name}</span>
          <span className="block text-xs text-a-text-2">{line}</span>
        </span>
        {on && <CheckIcon size={15} aria-hidden className="mt-0.5 shrink-0 text-a-accent-text" />}
      </span>
    </button>
  )
}

/** One choice of a few, as pressed chips, with its label and what is wrong. */
function Choice({ label, problem, children }: { label: string; problem: string | null; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="space-y-1.5">
      <p id={id} className="text-xs font-medium text-a-text-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {problem && <p className="text-xs font-medium text-a-danger">{problem}</p>}
    </div>
  )
}

/** The corner radius: the full admin's slider, 0 to 32 pixels. */
function Radius({ value, min, max, problem, onChange }: { value: number; min: number; max: number; problem: string | null; onChange: (n: number) => void }) {
  const { t, i18n } = useTranslation()
  const id = useId()
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium text-a-text-2">{t('loyalty.app.look.radius', 'Corner radius')}</label>
        <span className="font-a-mono text-xs text-a-text">{t('loyalty.app.look.pixels', '{{n}} px', { n: points(value, i18n.language || 'en') })}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={problem ? true : undefined} className="w-full accent-a-accent-text" />
      {problem && <p className="text-xs font-medium text-a-danger">{problem}</p>}
    </div>
  )
}

/**
 * The venue's logo, the same one the full admin's Branding sets (`company_logo`): uploaded or replaced at once, apart
 * from Save; the server deletes the old file when it is ours.
 */
function LogoField({ logo, limits }: { logo: string | null; limits: LookAnswer['options']['logo'] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  const send = useMutation({
    mutationFn: (file: File) => appApi.uploadLogo(file),
    onSuccess: ({ logo_url }) => client.setQueryData<LookAnswer>(LOOK_KEY, prev => (prev ? { ...prev, look: { ...prev.look, logo_url } } : prev)),
  })
  const vars = { mb: points(megabytes(limits.max_kb), locale), edge: points(limits.max_edge, locale) }
  const failure = send.isError ? failureOf(send.error) : null

  return (
    <Part title={t('loyalty.app.logo.title', 'Logo')} line={t('loyalty.app.logo.line', 'Shown in the app and the member portal. It is the same logo as in the full admin’s Branding.')}>
      <div className="flex flex-wrap items-center gap-4">
        {logo
          ? <img src={logo} alt={t('loyalty.app.logo.alt', 'The venue’s logo')} loading="lazy" className="h-16 w-16 rounded-xl border border-a-border bg-a-surface-2 object-contain p-1" />
          : <p className="rounded-xl border border-dashed border-a-border px-4 py-4 text-sm text-a-text-2">{t('loyalty.app.logo.none', 'No logo yet.')}</p>}
        <input ref={input} type="file" accept={limits.types.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => {
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
      {problem && <p className="text-xs font-medium text-a-danger">{t(`loyalty.rewards.picture.problem.${problem}`, PICTURE_PROBLEM_WORDS[problem], vars)}</p>}
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'logo', failure), vars)}</Notice>}
    </Part>
  )
}
