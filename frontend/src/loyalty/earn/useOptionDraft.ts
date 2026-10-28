import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { changesOf, formOf, serverProblems, wayProblems, type OptionsForm } from '../options/optionsMath'
import { afterOptionsChange, optionsApi } from '../options/optionsApi'
import { failureOf } from '../lib/api'
import type { OptionsAnswer, Way } from '../options/types'
import type { EarnGuard } from './useLeaveGuard'

export function useOptionDraft(id: string, ways: Way[], answer: OptionsAnswer, guard: EarnGuard) {
  const described = { ways, fields: answer.fields }
  const stored = formOf(described, answer.options)
  const storedKey = JSON.stringify(stored)
  const [base, setBase] = useState(answer.options)
  const [seen, setSeen] = useState(storedKey)
  const [form, setForm] = useState<OptionsForm>(stored)
  const [tried, setTried] = useState(false)
  const [resetVersion, setResetVersion] = useState(guard.resetVersion)
  const changes = Object.assign({}, ...ways.map(w => changesOf(w, form[w.key], base, answer.fields)))
  const local = Object.assign({}, ...ways.map(w => wayProblems(w, form[w.key], answer.fields, answer.catalogue.rewards)))
  const invalidEdit = Object.keys(local).length > 0 && JSON.stringify(form) !== JSON.stringify(formOf(described, base))
  const dirty = Object.keys(changes).length > 0 || invalidEdit
  // A different form's save must not reset this draft. Clean forms do follow refreshed options.
  if (storedKey !== seen && !dirty) { setSeen(storedKey); setBase(answer.options); setForm(stored) }
  // Discard is page-wide: the rules form may remain mounted when the selected bonus changes.
  if (resetVersion !== guard.resetVersion) { setResetVersion(guard.resetVersion); setSeen(storedKey); setBase(answer.options); setForm(stored); setTried(false) }
  const { mark } = guard
  useEffect(() => { mark(id, dirty); return () => mark(id, false) }, [mark, id, dirty])
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => optionsApi.save(changes), onSuccess: next => {
    setBase(next.options); const nextForm = formOf({ ways, fields: next.fields }, next.options); setForm(nextForm); setSeen(JSON.stringify(nextForm)); setTried(false)
    afterOptionsChange(client, next)
  }, onSettled: guard.end })
  const resetMutation = save.reset
  useEffect(() => { resetMutation() }, [resetVersion, resetMutation])
  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...serverProblems(failure, answer), ...(tried ? local : {}) }
  const edit = (key: string, patch: Partial<OptionsForm[string]>) => { if (guard.busy || !answer.can_change) return; setForm(old => ({ ...old, [key]: { ...old[key], ...patch } })); save.reset() }
  const reset = () => { if (guard.busy) return; setBase(answer.options); setForm(stored); setSeen(storedKey); setTried(false); save.reset() }
  const submit = () => { setTried(true); if (!answer.can_change || !dirty || Object.keys(local).length || !guard.begin()) return; save.mutate() }
  return { form, dirty, problems, valid: Object.keys(local).length === 0, failure, saved: save.isSuccess && !dirty, edit, reset, submit, busy: guard.busy, pending: save.isPending }
}
