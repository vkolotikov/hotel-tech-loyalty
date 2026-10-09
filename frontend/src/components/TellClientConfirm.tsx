import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { notifyFor } from '../lib/clientMessages'
import { TellClientCheckbox } from './TellClient'

/** A small question before a confirm or a cancel in the full admin, with the "Tell the client" box (Part D, ruling R4). */
export function TellClientConfirm({ title, email, many, defaultTell, busy, onConfirm, onClose }: {
  title: string; email?: string | null; many?: boolean; defaultTell: boolean; busy?: boolean
  onConfirm: (tell: boolean) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [tell, setTell] = useState(defaultTell)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-white/[0.08] bg-dark-surface p-5">
        <p className="text-base font-semibold text-white">{title}</p>
        <TellClientCheckbox email={email} many={many} checked={tell} onChange={setTell} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white">{t('tell_client.back', 'Back')}</button>
          <button type="button" disabled={busy} onClick={() => onConfirm(many ? tell : notifyFor(email, tell))} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-on-fill disabled:opacity-50">{t('tell_client.go', 'Yes')}</button>
        </div>
      </div>
    </div>
  )
}
