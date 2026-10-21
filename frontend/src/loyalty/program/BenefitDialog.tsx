import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import { FormField, FormFoot } from './formParts'
import { BENEFIT_FIELDS, benefitBody, benefitFormOf, benefitProblems, named, serverProblems, type BenefitForm } from './programMath'
import type { Benefit, ProgramOptions } from './types'
import { BENEFIT_PROBLEM_WORDS, CATEGORY_WORDS, FULFILLMENT_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add a benefit to the catalogue or change one (spec 2026-10-21 §4.5): its name, a code given once — presets find
 * their benefits by it, so it is shown but not changed afterwards —, its category and how it is given, from the
 * server's lists.
 */
export function BenefitDialog({ benefit, options, onClose }: { benefit: Benefit | null; options: ProgramOptions; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const creating = benefit === null
  const [form, setForm] = useState<BenefitForm>(() => benefitFormOf(benefit))
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => (benefit ? programApi.updateBenefit(benefit.id, benefitBody(form, false)) : programApi.createBenefit(benefitBody(form, true))),
    onSuccess: () => { afterProgramChange(client, { benefits: true }); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client, { benefits: true }) },
  })
  const update = (patch: Partial<BenefitForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? benefitProblems(form, creating, options) : {}), ...serverProblems(failure?.fields, BENEFIT_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.program.benefit.problem.${code}`, BENEFIT_PROBLEM_WORDS[code] ?? BENEFIT_PROBLEM_WORDS.name) : null
  }
  const word = (prefix: string, words: Record<string, string>, value: string) => {
    const key = named(prefix, words, value)
    return key ? t(...key) : value
  }

  return (
    <Dialog title={benefit ? t('loyalty.program.benefit.edit_title', 'Change {{name}}', { name: benefit.name }) : t('loyalty.program.benefit.new_title', 'Add a benefit')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(benefitProblems(form, creating, options)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.program.benefit.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={255} onChange={(e) => update({ name: e.target.value })} className={INPUT}
            placeholder={t('loyalty.program.benefit.name_example', 'e.g. Late checkout')} />
        </FormField>

        {creating ? (
          <FormField label={t('loyalty.program.benefit.code', 'Code')} problem={problem('code')}
            hint={t('loyalty.program.benefit.code_hint', 'A short name for the system, e.g. LATE_CHECKOUT. It cannot be changed later.')}>
            <input type="text" value={form.code} maxLength={50} spellCheck={false} onChange={(e) => update({ code: e.target.value })} className={`${INPUT} font-a-mono`} />
          </FormField>
        ) : (
          <div>
            <p className="mb-1 text-xs font-medium text-a-text-2">{t('loyalty.program.benefit.code', 'Code')}</p>
            <p className="font-a-mono text-sm text-a-text">{benefit.code || '—'}</p>
            <p className="mt-1 text-xs text-a-text-2">{t('loyalty.program.benefit.code_fixed', 'The code stays as it was made: presets find the benefit by it.')}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.program.benefit.category', 'Category')} problem={problem('category')}>
            <select value={form.category} onChange={(e) => update({ category: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.program.benefit.choose', 'Choose…')}</option>
              {options.categories.map(value => <option key={value} value={value}>{word('loyalty.program.category', CATEGORY_WORDS, value)}</option>)}
              {form.category !== '' && !options.categories.includes(form.category) && <option value={form.category}>{form.category}</option>}
            </select>
          </FormField>
          <FormField label={t('loyalty.program.benefit.fulfillment_mode', 'How it is given')} problem={problem('fulfillment_mode')}>
            <select value={form.fulfillment_mode} onChange={(e) => update({ fulfillment_mode: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.program.benefit.choose', 'Choose…')}</option>
              {options.fulfillment_modes.map(value => <option key={value} value={value}>{word('loyalty.program.fulfillment_mode', FULFILLMENT_WORDS, value)}</option>)}
              {form.fulfillment_mode !== '' && !options.fulfillment_modes.includes(form.fulfillment_mode) && <option value={form.fulfillment_mode}>{form.fulfillment_mode}</option>}
            </select>
          </FormField>
        </div>

        <FormField label={t('loyalty.program.benefit.description', 'Description')} hint={t('loyalty.program.benefit.description_hint', 'Optional. Members read it in the app.')}
          problem={problem('description')}>
          <textarea value={form.description} rows={3} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'benefit', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={benefit ? t('loyalty.program.benefit.save', 'Save benefit') : t('loyalty.program.benefit.create', 'Add benefit')} />
      </form>
    </Dialog>
  )
}
