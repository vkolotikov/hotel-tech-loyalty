import { useTranslation } from 'react-i18next'

/** "Tell the client by email": ticked or not by the venue's setting, and staff may untick it. With no address, it says so instead. */
export function TellClient({ email, checked, onChange }: { email: string | null; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation()
  if (!email) {
    return <p className="text-sm text-a-text-2">{t('appointments.messages.no_email', 'No email address — the client will not be told.')}</p>
  }
  return (
    <label className="flex items-center gap-2 text-sm text-a-text">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t('appointments.messages.tell', 'Tell the client by email ({{email}})', { email })}
    </label>
  )
}
