import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, ScanLine, SmartphoneNfc, LogOut, MapPin, Gift } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import { useAuthStore } from '../../stores/authStore'
import { Notice } from '../../workspace/ui/Notice'
import { formatDate } from '../../workspace/lib/wallClock'
import { FormField } from '../ui/formParts'
import { useLook } from '../lib/look'
import { failureOf, newPressKey } from '../lib/api'
import { amountOf } from '../lib/format'
import { CameraScanner } from '../scan/CameraScanner'
import { useWebNfc } from '../scan/useWebNfc'
import { benefitDetail } from '../scan/verdict'
import { entryWords } from '../places/placesMath'
import { VALUE_PHRASE_WORDS } from '../program/words'
import { OverviewButton } from '../overview/OverviewUI'
import { partnerApi, type PartnerScanBody } from './api'
import { usePartnerWords } from './words'
import '../overview/overview.css'
import './partners.css'

/** A separate entrance: no programme bootstrap, directory, editing controls or member-page links. */
export function PartnerScanPage() {
  const { t, i18n } = useTranslation(), w = usePartnerWords(), look = useLook(), auth = useAuthStore()
  const context = useQuery({ queryKey: ['loyalty', 'partner-context', auth.user?.id], queryFn: partnerApi.context, retry: false, refetchInterval: 60_000 })
  const [place, setPlace] = useState(0), [code, setCode] = useState(''), [camera, setCamera] = useState(false)
  const [physical, setPhysical] = useState(false)
  const pending = useRef(false), attempt = useRef<PartnerScanBody | null>(null)
  const places = context.data?.places ?? [], selected = places.find(row => row.id === place) ?? places[0]
  const scan = useMutation({ mutationFn: partnerApi.scan, onSettled: () => { pending.current = false }, onError: error => {
    if (failureOf(error).status === 403) void context.refetch()
  } })
  // A returned card can still carry its former holder's NDEF record. Explicit physical identity uses its UID.
  const nfc = useWebNfc(read => { setPhysical(!!read.card); submit(read.card ?? read.code, !!read.card) }, true)
  function submit(raw: string, asCard = physical) {
    const trimmed = raw.trim()
    if (!trimmed || !selected || pending.current) return
    const value = asCard && !/^HTCARD:/i.test(trimmed) ? 'HTCARD:' + trimmed : trimmed
    pending.current = true; setCode(value); setCamera(false); nfc.stop()
    const same = attempt.current?.code === value && attempt.current?.place_id === selected.id
    const body = same && scan.isError && failureOf(scan.error).code === 'network' ? attempt.current! : { code: value, place_id: selected.id, idempotency_key: newPressKey() }
    attempt.current = body; scan.mutate(body)
  }
  const reset = () => { scan.reset(); attempt.current = null; setCode(''); setCamera(false); nfc.stop() }
  const result = scan.data, verdict = result?.verdict
  const reason = result ? entryWords({ member: result.member, granted: result.verdict.granted, reason: result.verdict.reason }) : null
  const problem = scan.isError ? failureOf(scan.error) : null
  const refusal = problem ? entryWords({ member: null, granted: false, reason: problem.code }) : null
  const typed = (type: string, amount: number) => VALUE_PHRASE_WORDS[type] && context.data ? t(`loyalty.program.value_phrase.${type}`, VALUE_PHRASE_WORDS[type], { amount: amountOf(type, amount, context.data.currency, i18n.language) }) : null
  const day = (value: string) => formatDate(value, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  return <div data-workspace="" data-loyalty="" data-overview="" data-theme={look.resolved} className="l-partner-frame">
    <main className="l-partner-scanner">
      <header className="l-partner-top"><div><small>{context.data?.organization.name ?? 'HexaTech Loyalty'}</small><h1>{w('app')}</h1></div><div className="l-partner-actions"><select aria-label={t('workspace.shell.language', 'Language')} value={i18n.language.slice(0, 2)} onChange={e => { void i18n.changeLanguage(e.target.value) }}>{SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}</select><OverviewButton onClick={() => look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')}>{t(look.resolved === 'dark' ? 'workspace.theme.light' : 'workspace.theme.dark', look.resolved === 'dark' ? 'Light' : 'Dark')}</OverviewButton><OverviewButton onClick={auth.logout} aria-label={w('signOut')} title={w('signOut')}><LogOut size={18} aria-hidden /></OverviewButton></div></header>
      {context.isError && <Notice tone="danger">{w('loadFailed')} <OverviewButton onClick={() => { void context.refetch() }}>{w('retry')}</OverviewButton></Notice>}
      {context.isLoading && <p role="status">{w('scanning')}</p>}
      {context.data && !selected && <Notice tone="warning">{w('noAccess')}</Notice>}
      {selected && <section className="l-ov-panel l-partner-controls"><p>{w('scanHint')}</p><FormField label={w('places')}><select value={selected.id} disabled={scan.isPending} onChange={e => { setPlace(Number(e.target.value)); reset() }}>{places.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></FormField>
        <div className="l-partner-actions" role="group" aria-label={w('readAs')}><OverviewButton aria-pressed={!physical} disabled={scan.isPending} onClick={() => { reset(); setPhysical(false) }}>{w('memberCode')}</OverviewButton><OverviewButton aria-pressed={physical} disabled={scan.isPending} onClick={() => { reset(); setPhysical(true) }}>{w('cardId')}</OverviewButton></div>
        <form onSubmit={e => { e.preventDefault(); submit(code) }}><FormField label={w(physical ? 'cardId' : 'code')}><input value={code} autoComplete="off" spellCheck={false} disabled={scan.isPending} maxLength={2048} onChange={e => { setCode(e.target.value); if (!scan.isPending) scan.reset() }} /></FormField><OverviewButton primary type="submit" disabled={scan.isPending || !code.trim()}>{scan.isPending ? w('scanning') : w('scan')}</OverviewButton></form>
        <div className="l-partner-actions"><OverviewButton disabled={scan.isPending} onClick={() => { reset(); setPhysical(false); setCamera(true) }}><ScanLine size={18} aria-hidden />{w('camera')}</OverviewButton><OverviewButton disabled={scan.isPending} onClick={nfc.listening ? nfc.stop : () => { setCamera(false); nfc.start() }}><SmartphoneNfc size={18} aria-hidden />{w(nfc.listening ? 'stop' : 'nfc')}</OverviewButton></div><small>{w('nfcHint')}</small>
        {nfc.trouble && <Notice tone="warning">{w('nfcHint')}</Notice>}
        {camera && <CameraScanner onCode={value => submit(value, false)} onStop={() => setCamera(false)} />}
      </section>}
      {problem && <Notice tone="danger">{problem.status === 403 ? w('blocked') : refusal && t(...refusal)}{problem.code === 'network' && <OverviewButton disabled={scan.isPending} onClick={() => submit(code)}>{w('retry')}</OverviewButton>}</Notice>}
      {result && verdict && <section className="l-ov-panel l-partner-result" data-granted={verdict.granted} role="status" aria-live="polite"><div className="l-partner-verdict">{verdict.granted ? <CheckCircle2 size={36} aria-hidden /> : <XCircle size={36} aria-hidden />}<h2>{w(verdict.granted ? 'checked' : 'denied')}</h2></div><h2>{result.member.name}</h2><p>{result.member.member_number} · {verdict.tier?.name}</p>{!verdict.granted && reason && <p>{t(...reason)}</p>}<p className="l-partner-place-line"><MapPin size={16} aria-hidden />{verdict.place?.name}</p>
        <dl className="l-partner-dates">{verdict.valid_from && <div><dt>{w('from')}</dt><dd>{day(verdict.valid_from)}</dd></div>}{verdict.valid_until && <div><dt>{w('until')}</dt><dd>{day(verdict.valid_until)}</dd></div>}</dl>
        <h3 className="l-partner-place-line"><Gift size={18} aria-hidden />{w('benefits')}</h3>{!verdict.granted && <p>{w('reference')}</p>}{!result.benefits.length && <p>{t('loyalty.membership.assignment.noBenefits', 'This level has no benefits configured yet.')}</p>}<ul className="l-partner-benefits">{result.benefits.map((benefit, index) => <li key={index}><strong>{benefit.name}</strong>{benefitDetail(benefit, typed) && <span>{benefitDetail(benefit, typed)}</span>}</li>)}</ul><OverviewButton onClick={reset}>{w('again')}</OverviewButton>
      </section>}
    </main>
  </div>
}
