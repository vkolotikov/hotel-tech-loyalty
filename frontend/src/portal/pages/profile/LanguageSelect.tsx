import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SUPPORTED_LANGUAGES, type LangCode } from '../../../i18n'
import { portalApi } from '../../lib/portalApi'
import { Field, INPUT_CLASS } from '../../ui/Field'

/**
 * Writes `users.language` through the member profile endpoint — never the
 * admin preferences endpoint the staff switcher uses, which answers 403 to
 * a member and fires the subscription wall.
 */
export function LanguageSelect() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (language: LangCode) => portalApi.updateProfile({ language }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] }) },
  })
  const current = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.code ?? SUPPORTED_LANGUAGES.find(l => l.code === i18n.resolvedLanguage)?.code ?? 'en'

  return (
    <Field label={t('portal.profile.language', 'Language')}>
      <select
        value={current}
        onChange={e => { const code = e.target.value as LangCode; void i18n.changeLanguage(code); save.mutate(code) }}
        className={INPUT_CLASS}
      >
        {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </Field>
  )
}
