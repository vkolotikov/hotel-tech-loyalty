import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../i18n'

/** The language picker every workspace draws (its side panel, its phone menu, Content's Settings menu). */
export function LanguageSelect({ className }: { className: string }) {
  const { t, i18n } = useTranslation()
  return (
    <label className="block">
      <span className="sr-only">{t('workspace.shell.language', 'Language')}</span>
      <select value={i18n.language?.slice(0, 2)} onChange={(e) => { void i18n.changeLanguage(e.target.value) }} className={className}>
        {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  )
}
