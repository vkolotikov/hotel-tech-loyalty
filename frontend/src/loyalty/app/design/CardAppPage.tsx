import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { failureOf, mediaUrl } from '../../lib/api'
import { overviewScope } from '../../overview/overviewMath'
import { useOverviewModule } from '../../overview/useOverview'
import { OverviewButton, OverviewRecovery, OverviewSkeleton } from '../../overview/OverviewUI'
import { DesignDialog } from '../../redesign/DesignUI'
import { useLeaveGuard } from '../../earn/useLeaveGuard'
import { LOOK_KEY, appApi } from '../api'
import { applyPreset, chosenPreset, lookBody, lookChanged, lookFormOf, lookProblems, lookServerProblems, previewPaint, type LookForm } from '../appMath'
import { ColourField } from '../parts'
import { Choice, PresetButton, Radius } from '../LookTab'
import { CARD_STYLE_WORDS, BUTTON_STYLE_WORDS, ACCENT_WORDS, COLOUR_WORDS, PRESET_WORDS, PRESET_LINE_WORDS, LOOK_PROBLEM_WORDS } from '../words'
import { pictureProblem, megabytes } from '../../rewards/rewardsMath'
import { PICTURE_PROBLEM_WORDS } from '../../rewards/words'
import type { LookAnswer } from '../types'
import { applyColorMode, colorMode } from './designMath'
import { MemberPreview } from './MemberPreview'
import { WalletConnections } from './WalletConnections'
import { useCardWords } from './words'
import './cardApp.css'

export function CardAppPage() {
  const boot = useBoot(), say = useCardWords()
  const allowed = boot.staff.can.manage_app
  const key = [...LOOK_KEY, overviewScope(boot)]
  const query = useQuery({ queryKey: key, queryFn: appApi.look, enabled: allowed, refetchOnWindowFocus: false,
    retry: (count, error) => ![401, 402, 403].includes(failureOf(error).status) && count < 1 })
  const denied = !allowed || [401, 402, 403].includes(failureOf(query.error).status)
  return <div className="l-ov-page l-ca-page">
    <header className="l-ov-page-heading"><div><h1>{say('title')}</h1><p>{say('line')}</p></div></header>
    {denied ? <OverviewRecovery forbidden onRetry={() => { void query.refetch() }} /> : <>
      {query.isError && <OverviewRecovery title={query.data ? say('stale') : undefined} busy={query.isFetching} onRetry={() => { void query.refetch() }} />}
      {!query.data && query.isPending && <OverviewSkeleton rows={6} />}
      {query.data && <AppearanceEditor key={overviewScope(boot)} answer={query.data} blocked={query.isError} />}
    </>}
  </div>
}

function AppearanceEditor({ answer, blocked }: { answer: LookAnswer; blocked: boolean }) {
  const { t } = useTranslation(), say = useCardWords(), boot = useBoot(), client = useQueryClient()
  const { look, options } = answer, key = [...LOOK_KEY, overviewScope(boot)]
  const [draft, setDraft] = useState<LookForm | null>(null)
  const form = draft ?? lookFormOf(look, options)
  const [tried, setTried] = useState(false), [advanced, setAdvanced] = useState(false)
  const [savedPreview, setSavedPreview] = useState(false), [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const [tier, setTier] = useState(String(boot.programme.tiers.find(x => x.is_active)?.id ?? ''))
  const [state, setState] = useState('rewards'), [dialog, setDialog] = useState<string | null>(null)
  const [logoProblem, setLogoProblem] = useState<'type' | 'size' | null>(null)
  const uploadInput = useRef<HTMLInputElement>(null), guard = useLeaveGuard()
  const summary = useOverviewModule('summary', '30d')
  const save = useMutation({ mutationFn: () => appApi.saveLook(lookBody(form, options)),
    onSuccess: ({ look: saved }) => {
      client.setQueryData<LookAnswer>(key, previous => previous ? { ...previous, look: { ...saved, logo_url: previous.look.logo_url } } : previous)
      setDraft(null); setTried(false)
      void client.invalidateQueries({ queryKey: ['loyalty', 'overview'] })
    }, onSettled: guard.end })
  const logo = useMutation({ mutationFn: appApi.uploadLogo,
    onSuccess: ({ logo_url }) => {
      client.setQueryData<LookAnswer>(key, previous => previous ? { ...previous, look: { ...previous.look, logo_url } } : previous)
      void client.invalidateQueries({ queryKey: ['loyalty', 'overview'] })
    }, onSettled: guard.end })
  const changed = lookChanged(form, look, options)
  const { mark } = guard
  useEffect(() => mark('appearance', changed), [changed, mark])
  const failure = save.isError ? failureOf(save.error) : null
  const forbidden = [save.error, logo.error].some(error => [401, 402, 403].includes(failureOf(error).status))
  const busy = guard.busy || blocked
  const issues = { ...(tried ? lookProblems(form, options) : {}), ...lookServerProblems(failure?.fields) }
  const problem = (field: string) => issues[field] ? t(`loyalty.app.look.problem.${issues[field]}`, LOOK_PROBLEM_WORDS[issues[field]] ?? LOOK_PROBLEM_WORDS.colour) : null
  const update = (patch: Partial<LookForm>) => { if (busy) return; setDraft(old => ({ ...(old ?? lookFormOf(look, options)), ...patch })); setSavedPreview(false); save.reset() }
  const reset = () => { if (busy) return; setDraft(null); setTried(false); save.reset(); setDialog(null) }
  const word = (family: string, words: Record<string, string>, value: string) => value in words ? t(`loyalty.app.${family}.${value}`, words[value]) : value
  const chosen = chosenPreset(form, look.preset, options)
  const selectedTier = boot.programme.tiers.find(x => String(x.id) === tier)
  const previewForm = savedPreview ? lookFormOf(look, options) : form
  const paint = previewPaint(previewForm, look.colors, options)
  if (forbidden) return <OverviewRecovery forbidden onRetry={() => {}} />
  return <>
    <form id="l-ca-appearance" noValidate onSubmit={event => {
      event.preventDefault(); if (busy || !changed) return; setTried(true)
      if (Object.keys(lookProblems(form, options)).length === 0 && guard.begin()) save.mutate()
    }}>
      <div className="l-ca-columns">
        <fieldset className="l-ca-editor" disabled={busy}>
          <section className="l-ov-panel l-ca-panel" aria-labelledby="l-ca-brand">
            <h2 id="l-ca-brand">{say('brand')}</h2>
            <label className="l-ca-field">{say('cardName')}<input value={boot.organization.name} readOnly aria-describedby="l-ca-name-source" /></label>
            <p id="l-ca-name-source" className="l-ca-small">{say('nameSource')}</p>
            <div className="l-ca-logo">
              {look.logo_url && <img src={mediaUrl(look.logo_url)} alt={say('logoAlt')} />}
              <div><strong>{say(look.logo_url ? 'yourLogo' : 'addLogo')}</strong><p>{say('logoHint')}</p></div>
              <input ref={uploadInput} type="file" accept={options.logo.types.join(',')} hidden onChange={event => {
                const file = event.target.files?.[0]; event.target.value = ''; if (!file || busy) return
                const issue = pictureProblem(file, options.logo); setLogoProblem(issue); logo.reset()
                if (!issue && guard.begin()) logo.mutate(file)
              }} />
              <OverviewButton type="button" disabled={busy} aria-busy={logo.isPending} onClick={() => uploadInput.current?.click()}>{say(logo.isPending ? 'uploading' : look.logo_url ? 'replaceLogo' : 'uploadLogo')}</OverviewButton>
            </div>
            <small>{say('logoImmediate', { mb: megabytes(options.logo.max_kb) })}</small>
            {logoProblem && <p className="l-ca-error" role="alert">{t(`loyalty.rewards.picture.problem.${logoProblem}`, PICTURE_PROBLEM_WORDS[logoProblem], { mb: megabytes(options.logo.max_kb), edge: options.logo.max_edge })}</p>}
            {logo.isError && <p className="l-ca-error" role="alert">{say('uploadFailed')}</p>}
            {logo.isSuccess && <p role="status">{say('logoSaved')}</p>}
          </section>
          <section className="l-ov-panel l-ca-panel" aria-labelledby="l-ca-theme">
            <h2 id="l-ca-theme">{say('themeColors')}</h2>
            <div className="l-ca-field" role="group" aria-label={say('appTheme')}><span>{say('appTheme')}</span><div className="l-ca-choices">
              {Object.keys(options.color_modes ?? {}).map(mode => <OverviewButton key={mode} type="button" primary={colorMode(form, options) === mode} aria-pressed={colorMode(form, options) === mode} onClick={() => update(applyColorMode(form, options, mode))}>{mode === 'dark' ? say('dark') : mode === 'light' ? say('light') : mode}</OverviewButton>)}
              <OverviewButton type="button" aria-haspopup="dialog" onClick={() => setDialog('auto')}>{say('auto')}</OverviewButton>
            </div></div>
            <div className="l-ca-colors">{['primary', 'background', 'text'].filter(k => options.colors.includes(k)).map(k => <ColourField key={k} label={k === 'background' ? say('background') : word('colour', COLOUR_WORDS, k)} value={form.colors[k]} problem={problem(`colors.${k}`)} onChange={value => update({ colors: { ...form.colors, [k]: value } })} />)}</div>
            <div className="l-ca-field" role="group" aria-label={say('cardStyle')}><span>{say('cardStyle')}</span><div className="l-ca-styles">{options.card_styles.filter(style => style !== 'glass' || form.card_style === 'glass').map(style => <button key={style} type="button" className="l-ca-style" aria-pressed={form.card_style === style} data-card-style={style} onClick={() => update({ card_style: style })}><span className="l-ca-mini" aria-hidden>CLUB<i /></span><span><strong>{word('card_style', CARD_STYLE_WORDS, style)}</strong><small>{say(form.card_style === style ? 'selected' : 'chooseStyle')}</small></span></button>)}</div>{problem('card_style') && <p className="l-ca-error">{problem('card_style')}</p>}</div>
            <button type="button" className="l-ov-link" aria-expanded={advanced} aria-controls="l-ca-advanced" onClick={() => setAdvanced(!advanced)}>{say(advanced ? 'less' : 'more')} →</button>
            {advanced && <div id="l-ca-advanced" className="l-ca-advanced">
              <h3>{say('presets')}</h3><div className="l-ca-presets">{options.presets.map(preset => <PresetButton key={preset.key} preset={preset} on={chosen?.key === preset.key} name={word('preset', PRESET_WORDS, preset.key)} line={word('preset_line', PRESET_LINE_WORDS, preset.key)} onPick={() => update(applyPreset(form, preset))} />)}</div>
              <div className="l-ca-colors">{options.colors.filter(k => !['primary', 'background', 'text'].includes(k)).map(k => <ColourField key={k} label={word('colour', COLOUR_WORDS, k)} value={form.colors[k]} problem={problem(`colors.${k}`)} onChange={value => update({ colors: { ...form.colors, [k]: value } })} />)}</div>
              <Choice label={say('cardStyle')} problem={problem('card_style')}>{options.card_styles.map(style => <OverviewButton type="button" key={style} primary={form.card_style === style} aria-pressed={form.card_style === style} onClick={() => update({ card_style: style })}>{word('card_style', CARD_STYLE_WORDS, style)}</OverviewButton>)}</Choice>
              <Radius value={form.radius} min={options.radius.min} max={options.radius.max} problem={problem('radius')} onChange={radius => update({ radius })} />
              <Choice label={say('buttons')} problem={problem('button_style')}>{options.button_styles.map(value => <OverviewButton type="button" key={value} primary={form.button_style === value} aria-pressed={form.button_style === value} onClick={() => update({ button_style: value })}>{word('button_style', BUTTON_STYLE_WORDS, value)}</OverviewButton>)}</Choice>
              <Choice label={say('accentStrength')} problem={problem('accent_intensity')}>{options.accent_intensities.map(value => <OverviewButton type="button" key={value} primary={form.accent_intensity === value} aria-pressed={form.accent_intensity === value} onClick={() => update({ accent_intensity: value })}>{word('accent', ACCENT_WORDS, value)}</OverviewButton>)}</Choice>
            </div>}
          </section>
          <section className="l-ov-panel l-ca-panel" aria-labelledby="l-ca-options"><h2 id="l-ca-options">{say('previewOptions')}</h2>
            <div className="l-ca-options"><label className="l-ca-field">{say('exampleMember')}<select aria-label={say('exampleMember')} value={tier} onChange={event => setTier(event.target.value)}><option value="">{say('noLevel')}</option>{boot.programme.tiers.filter(x => x.is_active).map(x => <option key={x.id} value={x.id}>{say('tierMember', { tier: x.name })}</option>)}</select></label><label className="l-ca-field">{say('memberState')}<select aria-label={say('memberState')} value={state} onChange={event => setState(event.target.value)}><option value="rewards">{say('withRewards')}</option><option value="new">{say('newMember')}</option><option value="empty">{say('cardOnly')}</option></select></label></div>
            <div className="l-ca-related"><Link className="l-ov-link" to="/loyalty/program">{say('program')} →</Link><Link className="l-ov-link" to="/loyalty/rewards">{say('rewards')} →</Link><Link className="l-ov-link" to="/loyalty/options">{say('earning')} →</Link></div>
          </section>
        </fieldset>
        <section className="l-ov-panel l-ca-panel l-ca-preview" aria-labelledby="l-ca-preview-title"><h2 id="l-ca-preview-title">{say('memberPreview')}</h2><p>{say(savedPreview || !changed ? 'savedPreview' : 'draftPreview')}</p>
          <div className="l-ca-devices" role="group" aria-label={say('previewDevice')}>{(['mobile', 'desktop'] as const).map(value => <OverviewButton key={value} type="button" primary={device === value} aria-pressed={device === value} onClick={() => { setDevice(value); if (value === 'desktop') setDialog('desktop') }}>{say(value)}</OverviewButton>)}</div>
          <MemberPreview paint={paint} form={previewForm} logo={look.logo_url} tier={selectedTier?.name ?? null} state={state} device={device} summary={summary.data?.data} summaryFailed={summary.isError || summary.forbidden} onAction={setDialog} />
          <OverviewButton type="button" onClick={() => setSavedPreview(!savedPreview)} aria-pressed={savedPreview}>{say(savedPreview ? 'viewDraft' : 'viewSaved')}</OverviewButton>
        </section>
      </div>
    </form>
    <WalletConnections />
    <p className="l-ca-wallet-note">{say('walletBranding')}</p>
    <div className="l-ca-save l-ov-panel"><div><strong>{say(changed ? 'unsaved' : 'upToDate')}</strong><p>{say('saveHint')}</p></div><OverviewButton type="button" disabled={!changed || busy} onClick={() => setDialog('discard')}>{say('discard')}</OverviewButton><OverviewButton type="submit" form="l-ca-appearance" primary disabled={!changed || busy} aria-busy={save.isPending}>{say(save.isPending ? 'saving' : 'save')}</OverviewButton></div>
    {save.isSuccess && <p role="status">{say('saved')}</p>}{failure && <p className="l-ca-error" role="alert">{say('saveFailed')}</p>}{tried && Object.keys(issues).length > 0 && <p className="l-ca-error" role="alert">{say('fixFields')}</p>}
    <div className="l-ca-related l-ca-footer"><Link to="/loyalty/app?tab=currency" className="l-ov-link">{say('currency')} →</Link><Link to="/loyalty/app?view=detailed&tab=app" className="l-ov-link">{say('allSettings')} →</Link></div>
    {dialog === 'desktop' && <DesignDialog wide title={say('desktopLabel')} onClose={() => setDialog(null)}><div className="l-ca-desktop"><MemberPreview paint={paint} form={previewForm} logo={look.logo_url} tier={selectedTier?.name ?? null} state={state} device="desktop" summary={summary.data?.data} summaryFailed={summary.isError || summary.forbidden} onAction={setDialog} /></div></DesignDialog>}
    {dialog && dialog !== 'desktop' && <DesignDialog title={say(dialog === 'discard' ? 'discard' : dialog === 'auto' ? 'autoTitle' : 'exampleTitle')} onClose={() => setDialog(null)}><div className="l-ca-dialog-copy">
      <p>{say(dialog === 'discard' ? 'discardHint' : dialog === 'auto' ? 'autoHint' : dialog === 'code' ? 'codeHint' : dialog === 'wallets' ? 'walletPreviewHint' : dialog === 'reward' ? 'rewardPreviewHint' : 'benefitPreviewHint')}</p>
      {dialog === 'code' && <div className="l-ca-sample-code">{say('sampleCode')}<strong>EXAMPLE-0001</strong></div>}
      {dialog === 'discard' ? <div className="l-ca-actions"><OverviewButton onClick={() => setDialog(null)}>{say('keepEditing')}</OverviewButton><OverviewButton primary onClick={reset}>{say('discard')}</OverviewButton></div> : <OverviewButton onClick={() => setDialog(null)}>{say('close')}</OverviewButton>}
    </div></DesignDialog>}
    {guard.destination && <DesignDialog title={say('leaveTitle')} onClose={guard.keep}><div className="l-ca-dialog-copy"><p>{say('leaveHint')}</p><div className="l-ca-actions"><OverviewButton onClick={guard.keep}>{say('keepEditing')}</OverviewButton><OverviewButton primary onClick={guard.discard}>{say('leave')}</OverviewButton></div></div></DesignDialog>}
  </>
}
