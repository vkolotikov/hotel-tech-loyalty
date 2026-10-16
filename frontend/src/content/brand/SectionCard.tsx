import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'

/**
 * One section of the Brand page (spec §4.6): its read view, and for managers
 * an Edit that opens its own draft (`makeDraft`, from the brand as it is now)
 * with Save and Cancel. The draft lives here, so another section's save never
 * touches it (Review Focus 2). Save compares with the form as it was opened
 * (`base`), so a change someone else made meanwhile is not sent back and
 * undone. A refusal stays on the form, in the portal's
 * words, with the fields it names marked. Guided setup opens it at once
 * (`startOpen`) and moves on when it is saved (`onSaved`). Edit puts the
 * keyboard in the form; Save and Cancel bring it back to Edit.
 */
export function SectionCard<F>({ id, title, description, canEdit, readView, makeDraft, makeBase, editView, save, startOpen = false, saveLabel, onSaved, check }: {
  id: string
  title: string
  description?: string
  canEdit: boolean
  readView: ReactNode
  makeDraft: () => F
  /** What is stored, when the form starts from more (Guided setup fills in a new brand's name): what Save compares with. */
  makeBase?: () => F
  editView: (draft: F, change: (next: F) => void, invalid: string[]) => ReactNode
  /**
   * Saves the draft against the form as it was opened (`base`); the brand's answer is adopted by the caller. A string
   * it resolves to is a warning shown once the section closes (the save went through).
   */
  save: (draft: F, base: F) => Promise<void | string | undefined>
  startOpen?: boolean
  saveLabel?: string
  onSaved?: () => void
  /** Fields that stop a save (the server would refuse or ignore them): marked, with "Some fields need attention." */
  check?: (draft: F) => string[]
}) {
  const { t } = useTranslation()
  const open = () => ({ draft: makeDraft(), base: (makeBase ?? makeDraft)() })
  const [first] = useState(() => (startOpen && canEdit ? open() : null))
  const [draft, setDraft] = useState<F | null>(first?.draft ?? null)
  const [base, setBase] = useState<F | null>(first?.base ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const box = useRef<HTMLElement>(null)
  const focusAfter = useRef<'form' | 'edit' | 'invalid' | null>(null)

  // Edit puts the keyboard in the form; Save and Cancel bring it back to Edit (the buttons that had it are gone);
  // a refusal brings it to the first marked field, else to Save (document order: a field comes before Save).
  useEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    const into = want === 'form' ? 'input, textarea, select, button[aria-pressed]' : want === 'invalid' ? '[aria-invalid="true"], [data-section-save]' : '[data-section-edit]'
    box.current?.querySelector<HTMLElement>(into)?.focus()
  })

  const submit = async () => {
    if (draft === null || busy) return
    const problems = check?.(draft) ?? []
    if (problems.length > 0) {
      setInvalid(problems)
      setError(t('content.brand.error.invalid', 'Some fields need attention.'))
      focusAfter.current = 'invalid'
      return
    }
    setBusy(true)
    setError(null)
    setInvalid([])
    try {
      const said = await save(draft, base ?? draft)
      setWarning(typeof said === 'string' ? said : null)
      setDraft(null)
      if (!onSaved) focusAfter.current = 'edit'
      onSaved?.()
    } catch (e) {
      const failure = failureOf(e)
      setInvalid(Object.keys(failure.fields ?? {}).map(name => name.split('.')[0]))
      const [key, text] = errorKey('brand', failure.code)
      setError(t(key, text))
      focusAfter.current = 'invalid'
    } finally {
      setBusy(false)
    }
  }

  return (
    <section ref={box} aria-labelledby={id} className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id={id} className="font-a-display text-lg font-normal text-a-text">{title}</h2>
          {description && <p className="text-sm text-a-text-2">{description}</p>}
        </div>
        {canEdit && draft === null && (
          <Button size="sm" variant="secondary" data-section-edit=""
            onClick={() => { const opened = open(); focusAfter.current = 'form'; setWarning(null); setDraft(opened.draft); setBase(opened.base) }}>{t('content.brand.edit', 'Edit')}</Button>
        )}
      </div>
      {draft === null ? <>{readView}{warning && <Notice tone="warning">{warning}</Notice>}</> : (
        <div className="space-y-4">
          {editView(draft, setDraft, invalid)}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button data-section-save="" onClick={() => { void submit() }} loading={busy}>{saveLabel ?? t('content.brand.save', 'Save')}</Button>
            {!onSaved && <Button variant="secondary" disabled={busy} onClick={() => { focusAfter.current = 'edit'; setDraft(null); setError(null); setInvalid([]) }}>{t('content.common.cancel', 'Cancel')}</Button>}
          </div>
        </div>
      )}
    </section>
  )
}
