import { useTranslation } from 'react-i18next'

/** The full admin's "Tell the client by email" box (Part D). With no address, it says so instead. */
export function TellClientCheckbox({ email, many, checked, onChange }: { email?: string | null; many?: boolean; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation()
  if (!many && !email?.trim()) {
    return <p className="text-xs text-gray-400">{t('tell_client.no_email', 'No email address — the client will not be told.')}</p>
  }
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {many ? t('tell_client.tell_many', 'Tell the clients by email') : t('tell_client.tell', 'Tell the client by email')}
    </label>
  )
}
