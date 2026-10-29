import { useEffect, useState } from 'react'
import { usePhone } from '../overview/useOverview'
import { useMobileWords } from '../mobile/words'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import type { ThemePref } from '../../workspace/lib/look'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { appApi, CURRENCY_KEY } from '../app/api'
import { currencyChanged, currencyLabel, currencyWarnings } from '../app/appMath'
import { warningText } from '../app/CurrencyTab'
import { ERRORS } from '../app/errors'
import type { CurrencyPreview } from '../app/types'
import { useLeaveGuard } from '../earn/useLeaveGuard'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { FULL_ADMIN } from '../lib/links'
import { useOverviewLook } from '../overview/OverviewLookContext'
import { overviewScope } from '../overview/overviewMath'
import { OverviewButton, OverviewDialog, OverviewRecovery } from '../overview/OverviewUI'
import { useSettingsWords } from './words'
import './settings.css'

type Preferences = { language: string; theme: ThemePref; currency: string }

/** ST-01/02. Personal preferences keep their existing stores; venue currency keeps its server dry run and writer. */
export function SettingsPage() {
  const boot = useBoot()
  return <SettingsEditor key={overviewScope(boot)} />
}

function SettingsEditor() {
  const boot = useBoot(), { t, i18n } = useTranslation(), w = useSettingsWords(), look = useOverviewLook(), client = useQueryClient(), guard = useLeaveGuard()
  const phone = usePhone(), mobile = useMobileWords()
  const queryKey = [...CURRENCY_KEY, overviewScope(boot)], allowed = boot.staff.can.manage_app
  const query = useQuery({ queryKey, queryFn: appApi.currency, enabled: allowed, retry: false })
  const base: Preferences = { language: i18n.language.slice(0, 2), theme: look.theme, currency: query.data?.currency ?? boot.venue.currency }
  const [draft, setDraft] = useState<Partial<Preferences> | null>(null), [preview, setPreview] = useState<CurrencyPreview | null>(null), [saved, setSaved] = useState(false)
  const form = { ...base, ...draft }, changed = form.language !== base.language || form.theme !== base.theme || form.currency !== base.currency
  const currencyDirty = Boolean(allowed && query.data && currencyChanged(query.data.currency, form.currency, query.data.options))
  const save = useMutation({
    mutationFn: async (next: Preferences & { changeCurrency: boolean }) => next.changeCurrency ? appApi.saveCurrency(next.currency) : null,
    onSuccess: async (currency, next) => {
      if (currency) {
        client.setQueryData(queryKey, currency)
        void client.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
        void client.invalidateQueries({ queryKey: ['loyalty', 'insights'] })
      }
      look.setTheme(next.theme)
      await i18n.changeLanguage(next.language)
      setDraft(null); setPreview(null); setSaved(true)
    }, onSettled: guard.end,
  })
  const check = useMutation({ mutationFn: appApi.previewCurrency, onSuccess: setPreview, onSettled: guard.end })
  const busy = guard.busy || save.isPending || check.isPending
  const failure = save.isError ? save.error : check.isError ? check.error : null
  const currencyBlocked = query.isError || [failureOf(failure).status].some(status => [401, 402, 403].includes(status))
  const { mark } = guard
  useEffect(() => { mark('preferences', changed) }, [changed, mark])
  const update = (next: Partial<Preferences>) => { setDraft({ ...draft, ...next }); setSaved(false); setPreview(null); save.reset(); check.reset() }
  const submit = () => {
    if (!changed || busy || (currencyDirty && currencyBlocked) || !guard.begin()) return
    if (currencyDirty) check.mutate(form.currency)
    else save.mutate({ ...form, changeCurrency: false })
  }
  const discard = () => { setDraft(null); setPreview(null); setSaved(false); save.reset(); check.reset() }
  const failureNotice = failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'currency', failureOf(failure)))}</Notice>
  return <div className="l-ov-page l-rd-page l-st-page">
    <header className="l-ov-page-heading"><div><h1>{t('workspace.shell.settings', 'Settings')}</h1><p>{w('line')}</p></div></header>
    <div className="l-st-columns">
      <section className="l-ov-panel l-st-panel" aria-labelledby="settings-preferences"><h2 id="settings-preferences">{w('prefs')}</h2><p>{w('prefsLine')}</p>
        <label className="l-st-field"><span>{t('workspace.shell.language', 'Language')}</span><select value={form.language} disabled={busy} onChange={e => update({ language: e.target.value })}>{SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}</select><small>{w('langHint')}</small></label>
        <fieldset className="l-st-theme"><legend>{t('workspace.theme.label', 'Theme')}</legend><div>{(['dark', 'light', 'auto'] as const).map(theme => <OverviewButton key={theme} primary={form.theme === theme} aria-pressed={form.theme === theme} disabled={busy} onClick={() => update({ theme })}>{t(`workspace.theme.${theme}`, theme)}</OverviewButton>)}</div><small>{w('themeHint')}</small></fieldset>
        {allowed && query.isError && <OverviewRecovery forbidden={[401, 402, 403].includes(failureOf(query.error).status)} busy={query.isFetching} onRetry={() => { void query.refetch() }} />}
        <label className="l-st-field"><span>{w('currencyLabel')}</span><select value={form.currency} disabled={busy || !allowed || !query.data || currencyBlocked} onChange={e => update({ currency: e.target.value })}>{(allowed && query.data ? query.data.options : [boot.venue.currency]).map(code => <option key={code} value={code}>{currencyLabel(code, i18n.language)}</option>)}</select><small>{w('savedCurrency', { currency: currencyLabel(base.currency, i18n.language) })}</small></label>
        {!allowed && <small>{w('currencyPermission')}</small>}
        <div className="l-st-currency-note"><strong>{w('relabelTitle')}</strong><p>{w('relabelExample', { from: base.currency, to: form.currency })}</p></div>
        {!preview && failureNotice}
        {saved && <p role="status" className="l-st-saved">{w('saved')}</p>}
      </section>
      <details className="l-st-mobile-more" open={!phone || undefined}><summary>{mobile('allTools')}</summary><aside className="l-st-related">
        <section className="l-ov-panel l-st-panel"><h2>{w('admin')}</h2><p>{w('adminHint')}</p><Link to={FULL_ADMIN} className="l-ov-button">{w('openAdmin')}</Link><small>{w('adminAccess')}</small></section>
        <section className="l-ov-panel l-st-panel"><h2>{w('related')}</h2><div className="l-st-related-links">{[[allowed, '/loyalty/app', t('loyalty.nav.app', 'Card & app'), w('cardHint')], [true, '/loyalty/program', t('loyalty.nav.program', 'Program'), w('programHint')], [true, '/loyalty/options', t('loyalty.nav.options', 'Ways to earn'), w('earnHint')], [boot.staff.can.manage_campaigns, '/loyalty/campaigns', t('loyalty.nav.campaigns', 'Campaigns'), w('campaignsHint')]].map(([show, to, label, hint]) => show && <div key={String(to)}><Link to={String(to)} className="l-ov-link">{label} →</Link><small>{hint}</small></div>)}</div></section>
        <section className="l-ov-panel l-st-panel"><h2>{w('help')}</h2><p>{w('helpLine')}</p><Link to="/loyalty/guide" className="l-ov-button">{w('openGuide')}</Link></section>
      </aside></details>
    </div>
    <footer className="l-ov-panel l-st-save"><p role="status">{changed ? w('unsaved') : saved ? w('saved') : w('prefsLine')}</p><div><OverviewButton disabled={!changed || busy} onClick={discard}>{w('discard')}</OverviewButton><OverviewButton primary disabled={!changed || busy || (currencyDirty && currencyBlocked)} aria-busy={busy} onClick={submit}>{w('save')}</OverviewButton></div></footer>
    {preview && <OverviewDialog kind="form" busy={busy} className="l-st-confirm" title={w('confirmTitle')} onClose={() => { if (!busy) setPreview(null) }}><p>{w('confirmLine')}</p><dl className="l-st-comparison"><div><dt>{w('current')}</dt><dd>100 {preview.from}</dd></div><div><dt>{w('after')}</dt><dd>100 {preview.to}</dd></div></dl><p className="l-st-amber">{w('confirmHint', { currency: preview.to })}</p>{currencyWarnings(preview).length > 0 && <ul className="l-st-warnings">{currencyWarnings(preview).map(item => <li key={item.key}>{warningText(t, item, preview.to, i18n.language)}</li>)}</ul>}{failureNotice}<div className="l-st-dialog-actions"><OverviewButton disabled={busy} onClick={() => setPreview(null)}>{w('keepEditing')}</OverviewButton><OverviewButton primary disabled={busy || currencyBlocked} aria-busy={busy} onClick={() => { if (guard.begin()) save.mutate({ ...form, currency: preview.to, changeCurrency: true }) }}>{w('save')}</OverviewButton></div></OverviewDialog>}
    {guard.destination && <OverviewDialog kind="form" title={w('unsaved')} onClose={guard.keep}><p>{w('unsaved')}</p><div className="l-st-dialog-actions"><OverviewButton onClick={guard.keep}>{w('keepEditing')}</OverviewButton><OverviewButton primary onClick={guard.discard}>{w('discard')}</OverviewButton></div></OverviewDialog>}
  </div>
}
