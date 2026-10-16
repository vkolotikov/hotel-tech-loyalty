import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import { ideaBody } from './ideasMath'

/**
 * "Add an idea…" (spec 2026-10-16 §4.3): type, press Enter, and an idea post with no day is made. The line clears and
 * keeps the focus for the next one (it is never disabled while saving: that would drop the focus).
 */
export function QuickCapture({ autoFocus = false }: { autoFocus?: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ danger: boolean; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    // After the dialog around it has focused its own box (a parent's effect runs after its children's).
    const frame = window.requestAnimationFrame(() => input.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = ideaBody(text, brandInfo.data?.channels ?? [], boot.platforms)
    if (body === null || busy) return
    setBusy(true)
    setNote(null)
    try {
      await api.createPost(body)
      setText('')
      setNote({ danger: false, text: t('content.ideas.added', 'Idea added.') })
      void refreshLists(queryClient, brand)
    } catch (err) {
      const [key, words] = errorKey('idea', failureOf(err).code)
      setNote({ danger: true, text: t(key, words) })
    } finally {
      setBusy(false)
    }
  }

  const label = t('content.ideas.capture', 'Add an idea…')
  return (
    <form onSubmit={(e) => { void add(e) }} className="space-y-1">
      <input ref={input} value={text} maxLength={255} readOnly={busy} aria-busy={busy || undefined} enterKeyHint="done" aria-label={label} placeholder={label}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2" />
      <p role="status" className={`text-xs ${note?.danger ? 'text-a-danger' : 'text-a-text-2'}`}>{note?.text}</p>
    </form>
  )
}
