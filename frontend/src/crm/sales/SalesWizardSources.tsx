import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Globe2, Sparkles, Upload, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { IconButton } from '../ui/IconButton'
import { SALES_FIELD } from './assistantData'
import { addFiles, fileKey, type Capture, type Limits, type Sources } from './salesWizard'

export function SalesWizardSources({ value, onChange, limits, website, disabled, busy, capture, error, onCapture }: {
  value: Sources
  onChange: (value: Sources) => void
  limits?: Limits
  website?: string
  disabled: boolean
  busy: boolean
  capture: Capture | null | undefined
  error?: string
  onCapture: () => void
}) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState('')
  const fileError = problem ? t(`crm.wizard.errors.${problem}`) : ''
  const update = (next: Partial<Sources>) => onChange({ ...value, ...next })
  const append = (incoming: File[]) => {
    if (!limits || disabled || incoming.length === 0) return
    const result = addFiles(value.files, incoming, limits)
    setProblem(result.error ?? '')
    update({ files: result.files })
  }
  const formats = limits?.extensions.map(extension => extension.toUpperCase()).join(', ')
  const megabytes = (bytes: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(bytes / 1048576)
  const hasSource = Boolean(value.website.trim() || value.files.length || (value.search && value.name.trim()))
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-website`} className="inline-flex items-center gap-2 text-sm font-medium text-a-text">
              <Globe2 size={16} className="text-a-accent-text" aria-hidden />{t('crm.wizard.website')}
            </label>
            <input id={`${id}-website`} className={SALES_FIELD} value={value.website} disabled={disabled}
              placeholder="example.com" type="text" inputMode="url" maxLength={2000} autoComplete="url"
              onChange={event => update({ website: event.target.value })} />
            {website && !value.website && (
              <button type="button" className="text-left text-xs font-semibold text-a-accent-text hover:underline"
                onClick={() => update({ website })} disabled={disabled}>{t('crm.wizard.use_website')}</button>
            )}
          </div>
          <div className="space-y-2 rounded-xl border border-a-border bg-a-surface-2 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-a-text">
              <input type="checkbox" checked={value.search} onChange={event => update({ search: event.target.checked })}
                className="h-4 w-4 shrink-0 accent-a-accent" disabled={disabled} />
              {t('crm.wizard.search_web')}
            </label>
            {value.search && (
              <label className="block space-y-1 text-sm text-a-text">
                <span>{t('crm.sales.profile.fields.name')}</span>
                <input className={SALES_FIELD} value={value.name} onChange={event => update({ name: event.target.value })}
                  placeholder={t('crm.wizard.name_prompt')} maxLength={200} disabled={disabled} />
              </label>
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <div
            onDragOver={event => {
              if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); if (!disabled) setDragging(true) }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); append(Array.from(event.dataTransfer.files)) }}
            className={`rounded-xl border border-dashed p-4 transition-colors ${dragging ? 'border-a-accent bg-a-accent/10' : 'border-a-border bg-a-surface-2'}`}>
            <label className="block cursor-pointer space-y-2 rounded-lg text-sm text-a-text focus-within:outline-2 focus-within:outline-a-accent">
              <span className="flex items-center gap-2 font-semibold"><Upload size={16} className="text-a-accent-text" aria-hidden />{t('crm.wizard.upload')}</span>
              <input className="sr-only" type="file" multiple disabled={!limits || disabled}
                accept={limits?.extensions.map(extension => `.${extension}`).join(',')}
                onChange={event => { append(Array.from(event.target.files ?? [])); event.target.value = '' }} />
              <span className="block text-xs leading-relaxed text-a-text-2">{t('crm.wizard.upload_hint')}</span>
              {limits && (
                <span className="block text-xs leading-relaxed text-a-text-2">
                  {t('crm.wizard.upload_limits', { count: limits.count, formats, each: megabytes(limits.each_bytes), total: megabytes(limits.total_bytes) })}
                </span>
              )}
            </label>
          </div>
          {value.files.length > 0 && (
            <ul className="space-y-1.5">
              {value.files.map(file => (
                <li key={fileKey(file)} className="flex items-center gap-2 rounded-lg border border-a-border px-2.5 py-1.5">
                  <FileText size={15} className="shrink-0 text-a-text-2" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-a-text" title={file.name}>{file.name}</span>
                  <IconButton icon={X} label={t('crm.wizard.remove_file', { name: file.name })} disabled={disabled} onClick={() => {
                    setProblem('')
                    update({ files: value.files.filter(item => item !== file) })
                  }} />
                </li>
              ))}
            </ul>
          )}
          {fileError && <p role="alert" className="text-sm text-a-danger">{fileError}</p>}
        </div>
      </div>
      {error && <div role="alert"><Notice tone="warning">{error}</Notice></div>}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-a-border pt-3">
        {busy && <span role="status" className="mr-auto text-sm text-a-text-2">{t('crm.wizard.capturing')}</span>}
        <Button type="button" size="sm" className="crm-ai-fill min-h-9" disabled={disabled || !hasSource}
          loading={busy} onClick={onCapture}>
          <Sparkles size={15} aria-hidden />{t(capture?.status === 'ready' ? 'crm.wizard.capture_again' : 'crm.wizard.capture')}
        </Button>
      </div>
    </div>
  )
}
