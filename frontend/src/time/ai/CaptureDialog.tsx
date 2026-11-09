import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, duration } from '../lib/format'
import { assignable, usePeople, useRefresh } from '../lib/queries'
import { choosable, rightsOf } from '../lib/rights'
import { PRIORITIES, plannerApi } from '../lib/tasks'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { VoiceButton } from './VoiceButton'
import { appendWords } from './voice'
import { bodyOf, rowsOf, savable, type DraftRow } from './captureLogic'

/**
 * AI capture (2026-11-09): a message, notes or a voice note become tasks. The AI reads them (time/capture) and matches
 * the team's people, types and tasks; the person checks every line — keeps it or not, changes its day, time, length,
 * person or priority — and only then are the kept ones saved, through the full admin's own `planner/tasks`. In the `own`
 * planning mode the server leaves a colleague the text names as a name only, and the list of people is oneself.
 */
export function CaptureDialog({ onClose, date, initialText = '' }: { onClose: () => void; date?: string; initialText?: string }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const everyone = assignable(usePeople().data?.people)
  const people = choosable(rightsOf(boot), everyone)
  const [text, setText] = useState(initialText)
  const [rows, setRows] = useState<DraftRow[] | null>(null)
  const lang = (i18n.language || 'en').slice(0, 2)
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }

  const read = useMutation({
    mutationFn: () => timeApi.capture(text, lang, date),
    onSuccess: answer => {
      if (answer.tasks.length === 0) toast(t('time.capture.none', 'No task was found in the text. Say what needs doing, by whom and when.'), 'danger')
      else setRows(rowsOf(answer.tasks))
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const save = useMutation({
    mutationFn: async (list: DraftRow[]) => {
      for (const row of list) {
        const person = people.find(p => p.key === row.person) ?? null
        const created = await plannerApi.create(bodyOf(row, person))
        for (const step of row.subtasks) await plannerApi.addSubtask(created.id, step)
      }
      return list.length
    },
    onSuccess: n => { refresh(); toast(t('time.capture.saved', '{{count}} task(s) added', { count: n })); onClose() },
    onError: error => { refresh(); toast(errorText(t, error), 'danger') },
  })

  const update = (i: number, patch: Partial<DraftRow>) => setRows(list => list?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null)
  const keep = rows ? savable(rows) : []
  const ready = boot.ai.ready

  return (
    <SidePanel title={t('time.capture.title', 'Add tasks with AI')} onClose={onClose}
      footer={rows ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setRows(null)} disabled={save.isPending}><ArrowLeft size={14} aria-hidden />{t('time.capture.back', 'Back to the text')}</Button>
          <Button className="ml-auto" onClick={() => save.mutate(keep)} loading={save.isPending} disabled={keep.length === 0}>
            {t('time.capture.add', 'Add {{count}} task(s)', { count: keep.length })}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onClose}>{t('time.common.cancel', 'Cancel')}</Button>
          <Button className="ml-auto" onClick={() => read.mutate()} loading={read.isPending} disabled={!ready || text.trim().length < 2}>
            <Wand2 size={15} aria-hidden />{t('time.capture.read', 'Find the tasks')}
          </Button>
        </div>
      )}>
      {!rows ? (
        <div className="space-y-4">
          <p className="text-sm text-a-text-2">{t('time.capture.line', 'Paste a message or notes, or speak: “Tomorrow at 10 Anna deep-cleans room 204, then the boiler check, about an hour.” The AI writes the tasks; you check them before anything is saved.')}</p>
          {!ready && <Notice tone="warning">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))}</Notice>}
          <div className="flex items-start gap-3">
            <TextArea rows={8} value={text} onChange={e => setText(e.target.value)} maxLength={10000} aria-label={t('time.capture.text', 'What needs doing')}
              placeholder={t('time.capture.placeholder', 'What needs doing, by whom and when…')} />
          </div>
          {boot.features.voice && (
            <div className="flex flex-wrap items-center gap-3">
              <VoiceButton big language={i18n.language} onText={words => setText(before => appendWords(before, words))} label={t('time.capture.speak', 'Speak the tasks')} />
              <span className="text-xs text-a-text-2">{t('time.capture.speak_line', 'Press, speak up to two minutes, press again. The words appear above for you to check.')}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm time-ai-text"><Sparkles size={15} aria-hidden />{t('time.capture.found', 'Check each task. Untick what should not be added.')}</p>
          {rows.map((row, i) => (
            <div key={i} className={`space-y-2.5 rounded-2xl border p-3 ${row.keep ? 'border-a-border bg-a-surface' : 'border-dashed border-a-border bg-a-surface-2 opacity-70'}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={row.keep} onChange={e => update(i, { keep: e.target.checked })} aria-label={t('time.capture.keep', 'Add this task')} className="h-4 w-4 accent-[rgb(var(--a-accent))]" />
                <TextInput value={row.title} onChange={e => update(i, { title: e.target.value })} maxLength={200} aria-label={t('time.task.title', 'Title')} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <TextInput type="date" value={row.task_date ?? ''} onChange={e => update(i, { task_date: e.target.value || null })} aria-label={t('time.task.day', 'Day')} />
                <TextInput type="time" step={300} value={row.start_time ?? ''} disabled={!row.task_date} onChange={e => update(i, { start_time: e.target.value || null })} aria-label={t('time.task.start', 'Start')} />
                <Select value={row.person ?? ''} onChange={e => update(i, { person: e.target.value || null })} aria-label={t('time.task.person', 'Who')}>
                  <option value="">{row.task_date ? t('time.task.nobody', 'Nobody yet') : t('time.task.pool', 'Nobody: the open pool')}</option>
                  {people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                </Select>
                <Select value={row.priority} onChange={e => update(i, { priority: e.target.value as DraftRow['priority'] })} aria-label={t('time.task.priority', 'Priority')}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{t(`time.priority.${p.toLowerCase()}`, p)}</option>)}
                </Select>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-a-text-2">
                {row.task_date && <span className="rounded-full bg-a-surface-2 px-2 py-0.5">{dayLabel(row.task_date, i18n.language)}</span>}
                {row.duration_minutes && (
                  <span className={`rounded-full px-2 py-0.5 ${row.estimated ? 'time-ai-soft' : 'bg-a-surface-2'}`}>
                    {duration(row.duration_minutes, units)}{row.estimated ? ` · ${t('time.capture.estimated', 'estimated')}` : ''}
                  </span>
                )}
                {row.task_group && <span className="rounded-full bg-a-surface-2 px-2 py-0.5">{row.task_group}</span>}
                {row.task_category && <span className="rounded-full bg-a-surface-2 px-2 py-0.5">{boot.settings.channels.find(c => c.key === row.task_category)?.label ?? row.task_category}</span>}
                {row.subtasks.length > 0 && <span className="rounded-full bg-a-surface-2 px-2 py-0.5">{t('time.capture.steps', '{{count}} step(s)', { count: row.subtasks.length })}</span>}
                {row.person_named && !row.person && (
                  <span className="rounded-full bg-a-st-pending/12 px-2 py-0.5 text-a-st-pending">{everyone.some(p => p.name === row.person_named)
                    ? t('time.capture.colleague_named', '“{{name}}” plans their own day: keep it for yourself or for nobody', { name: row.person_named })
                    : t('time.capture.unknown_person', '“{{name}}” is not on the team', { name: row.person_named })}</span>
                )}
              </div>
              {row.description && <p className="text-xs text-a-text-2">{row.description}</p>}
            </div>
          ))}
        </div>
      )}
    </SidePanel>
  )
}
