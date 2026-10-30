import { useState } from 'react'
import { useBoot } from '../LoyaltyProvider'
import { overviewScope } from '../overview/overviewMath'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { Check, FormField, ToneBadge } from '../ui/formParts'
import { WALLET_KEY, appApi } from './api'
import {
  WALLET_COLOURS, WALLET_FILES, appleRgb, fileState, hexOf, passReady, replaces, walletBody, walletFormOf, walletProblems, walletShownProblems,
  type WalletForm,
} from './appMath'
import { ERRORS } from './errors'
import { ColourField, INPUT, LoadFailed, Loading, Part } from './parts'
import type { Wallet, WalletFile } from './types'
import { UploadDialog } from './UploadDialog'
import { FILE_LINE_WORDS, FILE_WORDS, MISSING_WORDS, WALLET_COLOUR_WORDS, WALLET_PROBLEM_WORDS } from './words'

/**
 * The wallet pass (release 2 §7): whether Apple's and Google's passes are ready, or exactly what each still lacks;
 * the fields the full admin edits, the pass's colours with a swatch, the three files (a replacement says so first;
 * nothing a file holds, no path and no password is ever shown) and the on/off switch. Without the plan's `wallet`
 * feature the tab says so and asks the server nothing.
 */
export function WalletTab({ wallet }: { wallet: boolean }) {
  const { t } = useTranslation()
  if (!wallet) {
    return (
      <div className="max-w-xl">
        <Notice>{t('loyalty.app.wallet.locked', 'Your plan does not include wallet passes, so members cannot add their card to Apple Wallet or Google Wallet. The member app’s look is under Member app.')}</Notice>
      </div>
    )
  }
  return <WalletSettings />
}

function WalletSettings() {
  const boot = useBoot(), queryKey = [...WALLET_KEY, overviewScope(boot)]
  const query = useQuery({ queryKey, queryFn: appApi.wallet })
  const data = query.data

  if (query.isError) return <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />
  if (!data) return <Loading />
  return <WalletView key={overviewScope(boot)} wallet={data.wallet} queryKey={queryKey} />
}

/** The settings once read. The form starts from the saved fields and takes the server's answer after each save. */
export function WalletView({ wallet: w, queryKey = WALLET_KEY }: { wallet: Wallet; queryKey?: readonly unknown[] }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [form, setForm] = useState<WalletForm>(() => walletFormOf(w))
  const [tried, setTried] = useState(false)
  const [uploading, setUploading] = useState<WalletFile | null>(null)

  const save = useMutation({
    mutationFn: () => appApi.saveWallet(walletBody(form)),
    onSuccess: (answer) => {
      client.setQueryData(queryKey, answer)
      setForm(walletFormOf(answer.wallet))
      setTried(false)
    },
  })
  const update = (patch: Partial<WalletForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError || save.isSuccess) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = walletShownProblems(form, tried, failure?.fields)
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.app.wallet.problem.${code}`, WALLET_PROBLEM_WORDS[code] ?? WALLET_PROBLEM_WORDS.colour) : null
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <PassCard name={t('loyalty.app.wallet.apple', 'Apple Wallet')} missing={w.apple_missing} />
        <PassCard name={t('loyalty.app.wallet.google', 'Google Wallet')} missing={w.google_missing} />
      </div>

      <form className="space-y-5" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(walletProblems(form)).length === 0) save.mutate()
      }}>
        <Part title={t('loyalty.app.wallet.apple', 'Apple Wallet')} line={t('loyalty.app.wallet.apple_line', 'From your Apple Developer account: the pass type and your team.')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('loyalty.app.wallet.pass_type_id', 'Pass Type ID')} problem={problem('apple_pass_type_id')}>
              <input type="text" value={form.apple_pass_type_id} maxLength={191} spellCheck={false} autoComplete="off" placeholder="pass.com.yourvenue.loyalty"
                onChange={(e) => update({ apple_pass_type_id: e.target.value })} className={`${INPUT} font-a-mono`} />
            </FormField>
            <FormField label={t('loyalty.app.wallet.team_id', 'Team ID')} problem={problem('apple_team_id')}>
              <input type="text" value={form.apple_team_id} maxLength={10} spellCheck={false} autoComplete="off" placeholder="ABCDE12345"
                onChange={(e) => update({ apple_team_id: e.target.value })} className={`${INPUT} font-a-mono uppercase`} />
            </FormField>
          </div>
          <FormField label={t('loyalty.app.wallet.organization_name', 'Name on the pass')} problem={problem('apple_organization_name')}
            hint={t('loyalty.app.wallet.organization_hint', 'Optional. Empty: the venue’s name.')}>
            <input type="text" value={form.apple_organization_name} maxLength={191} onChange={(e) => update({ apple_organization_name: e.target.value })} className={INPUT} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            {WALLET_COLOURS.map(field => (
              <ColourField key={field} label={t(`loyalty.app.wallet_colour.${field}`, WALLET_COLOUR_WORDS[field])} value={form[field]} problem={problem(field)}
                hint={hexOf(form[field]) ? t('loyalty.app.wallet.colour_saved_as', 'Saved as {{value}}', { value: appleRgb(form[field]) }) : undefined}
                onChange={(text) => update({ [field]: text } as Partial<WalletForm>)} />
            ))}
          </div>
        </Part>

        <Part title={t('loyalty.app.wallet.google', 'Google Wallet')} line={t('loyalty.app.wallet.google_line', 'From the Google Pay & Wallet Console: your issuer and the pass class.')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('loyalty.app.wallet.issuer_id', 'Issuer ID')} problem={problem('google_issuer_id')}>
              <input type="text" inputMode="numeric" value={form.google_issuer_id} maxLength={64} spellCheck={false} autoComplete="off"
                onChange={(e) => update({ google_issuer_id: e.target.value })} className={`${INPUT} font-a-mono`} />
            </FormField>
            <FormField label={t('loyalty.app.wallet.class_suffix', 'Class suffix')} problem={problem('google_class_suffix')}
              hint={t('loyalty.app.wallet.class_suffix_hint', 'Your own name for the pass class, e.g. loyalty.')}>
              <input type="text" value={form.google_class_suffix} maxLength={191} spellCheck={false} autoComplete="off"
                onChange={(e) => update({ google_class_suffix: e.target.value })} className={`${INPUT} font-a-mono`} />
            </FormField>
          </div>
        </Part>

        <div className="space-y-3">
          <Check label={t('loyalty.app.wallet.active', 'Wallet passes are on')} checked={form.is_active} onChange={(on) => update({ is_active: on })}
            hint={t('loyalty.app.wallet.active_hint', 'Switched off, members cannot add their card to a wallet. Nothing is deleted.')} />
          {failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'wallet', failure))}</Notice>}
          {save.isSuccess && <Notice tone="success">{t('loyalty.app.wallet.saved', 'Saved.')}</Notice>}
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>{t('loyalty.app.wallet.save', 'Save wallet pass')}</Button>
          </div>
        </div>
      </form>

      <Part title={t('loyalty.app.wallet.files', 'Certificates and keys')}
        line={t('loyalty.app.wallet.files_line', 'Kept on the server and never shown again; only whether each is there.')}>
        <ul className="divide-y divide-a-border">
          {WALLET_FILES.map(kind => <FileRow key={kind} kind={kind} wallet={w} onUpload={() => setUploading(kind)} />)}
        </ul>
      </Part>

      {uploading && <UploadDialog kind={uploading} wallet={w} queryKey={queryKey} onClose={() => setUploading(null)} />}
    </div>
  )
}

/** One pass: ready, or each thing it still needs. */
function PassCard({ name, missing }: { name: string; missing: string[] }) {
  const { t } = useTranslation()
  const ready = passReady(missing)
  return (
    <div data-pass="" className="space-y-2 rounded-2xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-a-text">{name}</p>
        <ToneBadge tone={ready ? 'fulfilled' : 'pending'}>{ready ? t('loyalty.app.wallet.ready', 'Ready to test') : t('loyalty.app.wallet.not_ready', 'Not ready')}</ToneBadge>
      </div>
      {ready
        ? <p className="text-sm text-a-text-2">{t('loyalty.app.wallet.ready_line', 'Connection details are saved. Check provider approval and test adding a card on a real device before rollout.')}</p>
        : (
          <div className="text-sm text-a-text">
            <p className="text-a-text-2">{t('loyalty.app.wallet.still_needed', 'Still needed:')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {missing.map(code => <li key={code}>{code in MISSING_WORDS ? t(`loyalty.app.missing.${code}`, MISSING_WORDS[code]) : code}</li>)}
            </ul>
          </div>
        )}
    </div>
  )
}

/** One file: what it is, whether it is there, and Upload or Replace. */
function FileRow({ kind, wallet, onUpload }: { kind: WalletFile; wallet: Wallet; onUpload: () => void }) {
  const { t } = useTranslation()
  const state = fileState(kind, wallet)
  const name = t(`loyalty.app.file.${kind}`, FILE_WORDS[kind])
  const status = state === 'set' ? t('loyalty.app.wallet.file_set', 'Uploaded')
    : state === 'gone' ? t('loyalty.app.wallet.file_gone', 'No longer on the server')
      : t('loyalty.app.wallet.file_none', 'Not uploaded')
  return (
    <li data-file={kind} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium text-a-text">{name}</p>
        <p className="text-xs text-a-text-2">{t(`loyalty.app.file_line.${kind}`, FILE_LINE_WORDS[kind])}</p>
        <p className="text-xs text-a-text-2">
          <ToneBadge tone={state === 'set' ? 'fulfilled' : state === 'gone' ? 'declined' : 'cancelled'}>{status}</ToneBadge>
          {kind === 'apple_cert' && state === 'set' && (
            <span className="ml-2">{wallet.apple_cert_password_set ? t('loyalty.app.wallet.password_set', 'Password saved') : t('loyalty.app.wallet.password_none', 'No password saved')}</span>
          )}
        </p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={onUpload}>
        <Upload size={14} aria-hidden />
        {replaces(state) ? t('loyalty.app.wallet.replace', 'Replace…') : t('loyalty.app.wallet.upload', 'Upload…')}
        <span className="sr-only"> {name}</span>
      </Button>
    </li>
  )
}
