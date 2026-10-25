import { useId, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ERRORS } from './errors'
import { afterOptionsChange, optionsApi } from './optionsApi'
import { changesOf, previewOptions, sentenceOf, serverProblems, wayFormOf, wayProblems, type WayForm } from './optionsMath'
import { Sentence, Switch, WayFields, WayIcon } from './parts'
import { useSay, wayLine, wayTitle } from './say'
import type { OptionsAnswer, Way } from './types'

/**
 * One way to earn or be rewarded on "Ways to earn" (release 7 §1): its switch, what members get with it as it stands
 * (the sentence changes as someone types), its fields while it is on, and its own Save, which sends only what changed.
 * What the workspace can see is wrong is marked under the field before anything is sent; the server's field errors are
 * marked the same way. Someone who is not a manager sees the card as it is, with nothing to press.
 */
export function WayCard({ way, answer, manage }: { way: Way; answer: OptionsAnswer; manage: boolean }) {
  const { t, i18n } = useTranslation()
  const say = useSay()
  const locale = i18n.language || 'en'
  const currency = useBoot().venue.currency
  const client = useQueryClient()
  const titleId = useId()

  // What is stored for this card; a save (this card's, or one elsewhere that changed it) puts the form back to it.
  const stored = useMemo(() => wayFormOf(way, answer.options, answer.fields), [way, answer.options, answer.fields])
  const storedKey = JSON.stringify(stored)
  const [form, setForm] = useState<WayForm>(stored)
  const [seen, setSeen] = useState(storedKey)
  if (storedKey !== seen) {
    setSeen(storedKey)
    setForm(stored)
  }
  const [tried, setTried] = useState(false)

  const changes = changesOf(way, form, answer.options, answer.fields)
  const dirty = Object.keys(changes).length > 0
  const local = wayProblems(way, form, answer.fields, answer.catalogue.rewards)
  const save = useMutation({
    mutationFn: () => optionsApi.save(changes),
    onSuccess: (next) => { setTried(false); afterOptionsChange(client, next) },
  })
  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...serverProblems(failure, answer), ...(tried ? local : {}) }
  const title = wayTitle(say, way.key)
  const text = sentenceOf(way.key, previewOptions(way, form, answer.options, answer.fields), { say, currency, locale, rewards: answer.catalogue.rewards })
  const switchable = way.switch !== null || way.zero_off !== null
  const busy = save.isPending

  const edit = (next: WayForm) => {
    setForm(next)
    save.reset()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!dirty || Object.keys(local).length > 0) return
    save.mutate()
  }

  return (
    <form data-way={way.key} data-on={form.on ? '' : undefined} aria-labelledby={titleId} noValidate onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <WayIcon way={way.key} on={form.on} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-a-display text-xl font-normal leading-snug text-a-text">{title}</h3>
          <p className="text-sm text-a-text-2">{wayLine(say, way.key)}</p>
        </div>
        {switchable && <Switch on={form.on} label={title} disabled={!manage || busy} onChange={(on) => edit({ ...form, on })} />}
      </div>

      <Sentence>{text}</Sentence>

      {form.on && (
        <WayFields way={way} form={form} fields={answer.fields} rewards={answer.catalogue.rewards} problems={problems}
          disabled={!manage || busy} currency={currency} locale={locale}
          onChange={(key, value) => edit({ ...form, values: { ...form.values, [key]: value } })} />
      )}

      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', failure))}</Notice>}
      {save.isSuccess && !dirty && <Notice tone="success">{t('loyalty.options.card.saved', 'Saved. Members get this from now on.')}</Notice>}

      {manage && (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-3">
          {dirty && <p className="text-sm text-a-text-2">{t('loyalty.options.card.unsaved', 'Not saved yet.')}</p>}
          <Button type="submit" size="sm" disabled={!dirty} loading={busy}>
            {t('loyalty.options.card.save', 'Save')}<span className="sr-only"> {title}</span>
          </Button>
        </div>
      )}
    </form>
  )
}
