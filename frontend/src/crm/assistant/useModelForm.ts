import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { get, send } from '../lib/api'
import { modelForm, modelPayload, modelProblems, sameModel, type ModelConfig, type ModelForm, type ModelProblem } from './modelLogic'
import { MODEL_KEY } from './queries'

export interface ModelFormState {
  query: UseQueryResult<ModelConfig>
  saved: ModelForm
  form: ModelForm
  allowed: string[] | null
  set: (patch: Partial<ModelForm>) => void
  replace: (next: ModelForm) => void
  dirty: boolean
  problems: ModelProblem[]
  save: () => Promise<unknown>
  saving: boolean
  discard: () => void
}

/** The model's form beside the behaviour's (one save bar saves both). */
export function useModelForm(): ModelFormState {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: MODEL_KEY, queryFn: () => get<ModelConfig>('chatbot-config/model') })
  const saved = useMemo(() => modelForm(query.data), [query.data])
  const allowed = Array.isArray(query.data?.allowed_models) ? query.data.allowed_models : null
  const [draft, setDraft] = useState<ModelForm | null>(null)
  const form = draft ?? saved
  const save = useMutation({
    mutationFn: () => send<ModelConfig>('put', 'chatbot-config/model', modelPayload(form)),
    onSuccess: data => {
      qc.setQueryData<ModelConfig>(MODEL_KEY, old => ({ ...(old ?? {}), ...(data ?? {}), allowed_models: old?.allowed_models ?? null }))
      setDraft(null)
    },
  })
  return {
    query,
    saved,
    form,
    allowed,
    set: patch => setDraft(prev => ({ ...(prev ?? saved), ...patch })),
    replace: next => setDraft(next),
    dirty: draft !== null && !sameModel(draft, saved),
    problems: modelProblems(form, saved, allowed),
    save: () => save.mutateAsync(),
    saving: save.isPending,
    discard: () => setDraft(null),
  }
}
