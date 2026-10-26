import { useId, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Info, SlidersHorizontal } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ERRORS } from './errors'
import { GROUP_HUE, groupOf } from './groups'
import { afterOptionsChange, optionsApi } from './optionsApi'
import { changesOf, previewOptions, sentenceOf, serverProblems, wayFormOf, wayProblems, type WayForm } from './optionsMath'
import { Sentence, Switch, WayFields, WayIcon } from './parts'
import { useSay, wayTitle } from './say'
import type { OptionsAnswer, Way } from './types'

/**
 * One way to earn or be rewarded on "Ways to earn" (release 7 §1): its switch, what members get with it as it stands
 * (the sentence changes as someone types), and its own Save, which sends only what changed. Design pass 2026-10-26:
 * the card wears its section's colour while the way is on and says On or Off beside the switch; its numbers open with
 * Change (or by themselves once the switch or a number changed), so the grid stays a set of short cards, and close
 * again on Save or Cancel. What the workspace can see is wrong is marked under the field before anything is sent; the
 * server's field errors are marked the same way. Someone who is not a manager sees the card as it is, with nothing to
 * press. `defaultOpen` starts it open (the tests, which cannot press Change).
 */
export function WayCard({ way, answer, manage, defaultOpen = false }: { way: Way; answer: OptionsAnswer; manage: boolean; defaultOpen?: boolean }) {
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
  const [opened, setOpened] = useState(defaultOpen)

  const changes = changesOf(way, form, answer.options, answer.fields)
  const dirty = Object.keys(changes).length > 0
  const local = wayProblems(way, form, answer.fields, answer.catalogue.rewards)
  const save = useMutation({
    mutationFn: () => optionsApi.save(changes),
    onSuccess: (next) => { setTried(false); setOpened(false); afterOptionsChange(client, next) },
  })
  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...serverProblems(failure, answer), ...(tried ? local : {}) }
  const title = wayTitle(say, way.key)
  const text = sentenceOf(way.key, previewOptions(way, form, answer.options, answer.fields), { say, currency, locale, rewards: answer.catalogue.rewards })
  const switchable = way.switch !== null || way.zero_off !== null
  const unused = form.on && (answer.not_used ?? []).includes(way.key)
  const busy = save.isPending
  // A way with no numbers (earning at the desk) has nothing to open.
  const hasFields = way.fields.length > 0
  const open = form.on && hasFields && (opened || dirty || Object.keys(problems).length > 0)

  const edit = (next: WayForm) => {
    setForm(next)
    save.reset()
  }
  const cancel = () => {
    setForm(stored)
    setOpened(false)
    setTried(false)
    save.reset()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!dirty || Object.keys(local).length > 0) return
    save.mutate()
  }

  return (
    <form id={`way-${way.key}`} data-way={way.key} data-on={form.on ? '' : undefined} data-hue={form.on ? GROUP_HUE[groupOf(way.key)] : 'off'}
      aria-labelledby={titleId} noValidate onSubmit={submit}
      className={`flex scroll-mt-20 flex-col gap-3 rounded-2xl border bg-a-surface p-4 sm:p-5 ${form.on ? 'border-a-border' : 'border-dashed border-a-border'} ${open ? 'l-hue-edge shadow-a-sm' : ''} ${defaultOpen ? 'ring-2 ring-a-accent-text/40' : ''}`}>
      <div className="flex items-center gap-3">
        <WayIcon way={way.key} on={form.on} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-a-display text-xl font-normal leading-snug text-a-text">{title}</h3>
          {switchable && (
            <p data-state-word="" className="flex items-center gap-1.5 text-xs font-semibold">
              <span aria-hidden className="l-hue-bar inline-block h-1.5 w-1.5 rounded-full" />
              <span className={form.on ? 'l-hue-text' : 'text-a-text-2'}>{form.on ? t('loyalty.options.card.on', 'On') : t('loyalty.options.card.off', 'Off')}</span>
            </p>
          )}
        </div>
        {switchable && <Switch on={form.on} label={title} disabled={!manage || busy} onChange={(on) => edit({ ...form, on })} />}
      </div>

      <Sentence tinted={form.on && !unused} muted={!form.on || unused}>{text}</Sentence>
      {/* Owner 2026-10-26: a way that does nothing at this venue as it stands says so (ProgrammeAdvice's not_used). */}
      {unused && (
        <p data-not-used="" className="flex items-center gap-1.5 text-xs text-a-text-2">
          <Info size={13} aria-hidden className="shrink-0" />{t('loyalty.options.card.not_used', 'Your venue takes no bookings, so this gives nothing.')}
        </p>
      )}

      {open && (
        <WayFields way={way} form={form} fields={answer.fields} rewards={answer.catalogue.rewards} problems={problems}
          disabled={!manage || busy} currency={currency} locale={locale}
          onChange={(key, value) => edit({ ...form, values: { ...form.values, [key]: value } })} />
      )}

      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', failure))}</Notice>}
      {save.isSuccess && !dirty && <Notice tone="success">{t('loyalty.options.card.saved', 'Saved. Members get this from now on.')}</Notice>}

      {/* A short card offers Change; an open one Save (once something changed — Enter in a field saves too) and Cancel. */}
      {manage && form.on && hasFields && !open && (
        <div className="-mb-1 -ml-2">
          <Button type="button" size="sm" variant="ghost" aria-expanded={false} onClick={() => setOpened(true)}>
            <SlidersHorizontal size={14} aria-hidden />{t('loyalty.options.card.change', 'Change')}<span className="sr-only"> {title}</span>
          </Button>
        </div>
      )}
      {manage && (open || dirty || busy) && (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-3">
          {dirty && <p className="text-sm text-a-text-2">{t('loyalty.options.card.unsaved', 'Not saved yet.')}</p>}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={cancel}>{t('loyalty.options.card.cancel', 'Cancel')}</Button>
          {(dirty || busy) && (
            <Button type="submit" size="sm" loading={busy}>
              {t('loyalty.options.card.save', 'Save')}<span className="sr-only"> {title}</span>
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
