import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { weekdayName } from '../lib/format'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import type { Person } from '../lib/types'
import { TextArea, TextInput, Toggle } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import {
  BREAK_MAX, BREAKS, WEEKDAYS, canEditProfile, canSetSkills, choices, formOf, formProblem, hasChanges, mergePrefs,
  parsePrefs, savePlan, toggleIn, type FormProblem, type TeamForm,
} from './teamLogic'

/** A problem with the form, in words. */
function problemText(t: TFunction, problem: FormProblem, max: number): string {
  if (problem === 'knowledge') return t('time.team.problem_knowledge', 'Keep what they know to {{max}} characters.', { max })
  if (problem === 'hours_both') return t('time.team.problem_hours_both', 'Give both times, or leave both empty for the venue’s hours.')
  if (problem === 'hours_order') return t('time.team.problem_hours_order', 'The day must end after it starts.')
  if (problem === 'days') return t('time.team.problem_days', 'Choose at least one work day.')
  return t('time.team.problem_break', 'A break is a whole number of minutes, from 0 to {{max}}.', { max: BREAK_MAX })
}

/** One choice of a row (a day, a break, a type): pressed or not. */
export function Choice({ on, onClick, children, color, label }: { on: boolean; onClick: () => void; children: ReactNode; color?: string | null; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${on ? 'border-a-accent bg-a-accent/12 font-semibold text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      {color && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-a-text">{title}</legend>
      {hint && <p className="text-xs text-a-text-2">{hint}</p>}
      {children}
    </fieldset>
  )
}

/**
 * A person's planner profile (a manager's): what they know, their hours, days and break, the types they may take from
 * the open pool, and the work that fits them best. Saved by the writer each part has — `time/people/{user}`, the full
 * admin's `team/{staff}`, and the `planner_employee_prefs` setting (read afresh first, only this person's entry
 * changed) — and only the parts that changed.
 */
export function ProfilePanel({ person, knowledgeMax, onClose }: { person: Person; knowledgeMax: number; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const [form, setForm] = useState<TeamForm>(() => formOf(person))
  const [checked, setChecked] = useState(false)
  const set = <K extends keyof TeamForm>(key: K, value: TeamForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const units = { min: t('time.common.min', 'min') }
  const profile = canEditProfile(person)
  const skillsHere = canSetSkills(person)
  const groups = boot.settings.groups
  const channels = boot.settings.channels
  const venue = boot.settings.window
  const problem = checked ? formProblem(form, knowledgeMax, person) : null

  const save = useMutation({
    mutationFn: async () => {
      const plan = savePlan(person, form)
      if (plan.profile && person.user_id !== null) await timeApi.updatePerson(person.user_id, { ...plan.profile })
      if (plan.skills) await plannerApi.saveSkills(plan.skills.staffId, plan.skills.skills)
      if (plan.prefs) {
        // Read the map as it is now, so someone else's change to another person's entry is kept.
        const settings = await plannerApi.settings()
        await plannerApi.saveSetting('planner_employee_prefs', mergePrefs(parsePrefs(settings.planner_employee_prefs), person.name, plan.prefs.groups, plan.prefs.tasks))
      }
    },
    onSuccess: () => { refresh(); toast(t('time.team.saved', 'Planner profile saved')); onClose() },
    // A part may have been saved before another failed: the page reads everything again either way.
    onError: error => { refresh(); toast(errorText(t, error), 'danger') },
  })

  const submit = () => {
    setChecked(true)
    if (formProblem(form, knowledgeMax, person)) return
    if (!hasChanges(savePlan(person, form))) { onClose(); return }
    save.mutate()
  }

  return (
    <SidePanel title={t('time.team.profile', 'Planner profile')} onClose={onClose}
      footer={(
        <div className="space-y-3">
          {problem && <Notice tone="danger">{problemText(t, problem, knowledgeMax)}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('time.common.cancel', 'Cancel')}</Button>
            <Button onClick={submit} loading={save.isPending}>{t('time.common.save', 'Save')}</Button>
          </div>
        </div>
      )}>
      <div className="space-y-6">
        <div>
          <p className="font-semibold text-a-text">{person.name}</p>
          <p className="text-sm text-a-text-2">{t('time.team.profile_line', 'The planner and its AI plan this person’s days from what you set here.')}</p>
        </div>

        {!profile && (
          <Notice>{t('time.team.no_account_note', '{{name}} has no account, so only their preferred work is kept here.', { name: person.name })}</Notice>
        )}

        {profile && (
          <>
            <div className="space-y-1">
              <Field label={t('time.team.knowledge', 'What they know')}
                hint={t('time.team.knowledge_hint', 'Languages, certificates, equipment, specialties. The AI reads it when it plans their day.')}>
                <TextArea rows={4} value={form.knowledge} maxLength={knowledgeMax} onChange={e => set('knowledge', e.target.value)}
                  placeholder={t('time.team.knowledge_placeholder', 'Speaks Latvian and English; first-aid certificate; drives the van…')} />
              </Field>
              <p className={`text-right text-xs ${form.knowledge.length > knowledgeMax ? 'text-a-danger' : 'text-a-text-2'}`}>
                {t('time.team.knowledge_count', '{{used}} of {{max}}', { used: form.knowledge.length, max: knowledgeMax })}
              </p>
            </div>

            <Group title={t('time.team.hours', 'Hours')}
              hint={t('time.team.hours_hint', 'Leave both empty for the venue’s hours ({{start}}–{{end}}).', { start: venue.start, end: venue.end })}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('time.team.starts', 'Starts')}>
                  <TextInput type="time" step={900} value={form.work_start} onChange={e => set('work_start', e.target.value)} />
                </Field>
                <Field label={t('time.team.ends', 'Ends')}>
                  <TextInput type="time" step={900} value={form.work_end} onChange={e => set('work_end', e.target.value)} />
                </Field>
              </div>
              {(form.work_start || form.work_end) && (
                <button type="button" onClick={() => setForm(f => ({ ...f, work_start: '', work_end: '' }))} className="text-sm font-semibold text-a-accent-text">
                  {t('time.team.use_venue_hours', 'Use the venue’s hours')}
                </button>
              )}
            </Group>

            <Group title={t('time.team.days', 'Work days')} hint={t('time.team.days_hint', 'All seven means every day.')}>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(day => (
                  <Choice key={day} on={form.days.includes(day)} onClick={() => set('days', toggleIn(form.days, day))} label={weekdayName(day, i18n.language, 'long')}>
                    {weekdayName(day, i18n.language)}
                  </Choice>
                ))}
              </div>
            </Group>

            <Group title={t('time.team.break', 'Break')} hint={t('time.team.break_hint', 'Kept free in the middle of their day.')}>
              <div className="flex flex-wrap items-center gap-1.5">
                {BREAKS.map(minutes => (
                  <Choice key={minutes} on={Number(form.break_minutes) === minutes} onClick={() => set('break_minutes', String(minutes))}>
                    {minutes === 0 ? t('time.team.no_break', 'None') : `${minutes} ${units.min}`}
                  </Choice>
                ))}
                <label className="inline-flex items-center gap-2 text-sm text-a-text-2">
                  <span className="sr-only">{t('time.team.break_minutes', 'Break in minutes')}</span>
                  <TextInput type="number" inputMode="numeric" min={0} max={BREAK_MAX} step={5} value={form.break_minutes}
                    onChange={e => set('break_minutes', e.target.value)} className="w-24!" />
                  <span aria-hidden>{units.min}</span>
                </label>
              </div>
            </Group>
          </>
        )}

        {profile && (
          <Group title={t('time.team.skills', 'Types they may take from the pool')}
            hint={t('time.team.skills_hint', 'A rule: the pool shows them only these types, and they can take only these.')}>
            {person.manager ? (
              <Notice>{t('time.team.manager_any', 'Managers take any type from the pool.')}</Notice>
            ) : !skillsHere ? (
              <Notice>{t('time.team.skills_elsewhere', 'Skills are kept for staff members only.')}</Notice>
            ) : (
              <div className="space-y-3">
                <Toggle label={t('time.team.any_type', 'Any type')} checked={form.any_type} onChange={on => set('any_type', on)}
                  hint={form.any_type ? t('time.team.any_type_on', 'They may take everything in the pool.') : t('time.team.any_type_off', 'Only the types ticked below. None ticked: nothing from the pool.')} />
                {!form.any_type && (groups.length === 0 && form.skills.length === 0
                  ? <p className="text-sm text-a-text-2">{t('time.team.no_types', 'No types are set up yet.')}</p>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {choices(groups.map(g => g.name), form.skills).map(name => (
                        <Choice key={name} on={form.skills.includes(name)} onClick={() => set('skills', toggleIn(form.skills, name))}
                          color={groups.find(g => g.name === name)?.color}>{name}</Choice>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </Group>
        )}

        <Group title={t('time.team.prefers', 'Work that fits their knowledge')}
          hint={t('time.team.prefers_hint', 'A hint, not a rule: the planner gives them these first, and anyone can still be given anything.')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('time.team.prefer_types', 'Types')}</p>
          {groups.length === 0 && form.pref_groups.length === 0
            ? <p className="text-sm text-a-text-2">{t('time.team.no_types', 'No types are set up yet.')}</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {choices(groups.map(g => g.name), form.pref_groups).map(name => (
                  <Choice key={name} on={form.pref_groups.includes(name)} onClick={() => set('pref_groups', toggleIn(form.pref_groups, name))}
                    color={groups.find(g => g.name === name)?.color}>{name}</Choice>
                ))}
              </div>
            )}
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('time.team.prefer_tasks', 'Tasks')}</p>
          {channels.length === 0 && form.pref_tasks.length === 0
            ? <p className="text-sm text-a-text-2">{t('time.team.no_tasks', 'No tasks are set up yet.')}</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {choices(channels.map(c => c.key), form.pref_tasks).map(key => (
                  <Choice key={key} on={form.pref_tasks.includes(key)} onClick={() => set('pref_tasks', toggleIn(form.pref_tasks, key))}
                    color={channels.find(c => c.key === key)?.color}>{channels.find(c => c.key === key)?.label ?? key}</Choice>
                ))}
              </div>
            )}
        </Group>
      </div>
    </SidePanel>
  )
}
