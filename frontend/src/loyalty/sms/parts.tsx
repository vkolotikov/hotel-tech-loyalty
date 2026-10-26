import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { ToneBadge } from '../ui/formParts'
import { ERRORS } from './errors'
import { FULL_ADMIN_INTEGRATIONS, statusTone, twilioCode, twilioSteps } from './smsMath'
import type { SmsLength, TwilioReadiness } from './types'
import { ENCODING_WORDS, FAILURE_WORDS, SETTING_STATE_WORDS, SETTING_WORDS, STATUS_WORDS, TWILIO_WORDS } from './words'

/** What the SMS tab shows while loading, when a load failed, and when there is nothing yet. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  )
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-xl space-y-3">
      <Notice tone="danger">{t(...refusalKey('loyalty.sms', ERRORS, 'load', failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}

/** A campaign's status as its tone's badge; a status without a word is shown as sent. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  return <ToneBadge tone={statusTone(status)}>{status in STATUS_WORDS ? t(`loyalty.sms.status.${status}`, STATUS_WORDS[status]) : status}</ToneBadge>
}

/** A refusal in SMS campaigns' words, with what it carries filled in (`reached`, `limit`); a failed test also says Twilio's reason. */
export function Refusal({ family, failure, vars = {} }: { family: string; failure: ApiFailure; vars?: Record<string, unknown> }) {
  const { t } = useTranslation()
  const reason = typeof failure.extra.reason === 'string' ? failure.extra.reason : null
  return (
    <Notice tone="danger">
      {t(...refusalKey('loyalty.sms', ERRORS, family, failure), { ...failure.extra, ...vars })}
      {failure.code === 'test_failed' && reason && <> <ReasonText reason={reason} /></>}
    </Notice>
  )
}

/** Why a member's SMS, a test or a campaign failed: Twilio's own code explained, else a general sentence. */
export function ReasonText({ reason }: { reason: string }) {
  const { t } = useTranslation()
  const code = twilioCode(reason)
  if (code && code in TWILIO_WORDS) return <>{t(`loyalty.sms.twilio.${code}`, TWILIO_WORDS[code])}</>
  if (reason in FAILURE_WORDS) return <>{t(`loyalty.sms.failure.${reason}`, FAILURE_WORDS[reason])}</>
  return <>{t('loyalty.sms.failure.other', FAILURE_WORDS.other, { reason })}</>
}

/**
 * Where the venue's Twilio account is set and what it still lacks: SMS goes only through the venue's own account,
 * which a super admin enters in the full admin's Settings → Integrations.
 */
export function TwilioSetup({ twilio }: { twilio: TwilioReadiness }) {
  const { t } = useTranslation()
  const steps = twilioSteps(twilio)
  return (
    <div className="max-w-2xl space-y-2" data-twilio-setup="">
      <Notice tone="info">
        <p className="font-medium">{t('loyalty.sms.setup.title', 'SMS goes out through the venue’s own Twilio account, which is not set up yet.')}</p>
        <p className="mt-1">{t('loyalty.sms.setup.where', 'A super admin enters it in the full admin: Settings → Integrations → Twilio. It needs the Account SID, the Auth Token and the number SMS are sent from (with + and the country code), or a Messaging Service SID in its place.')}</p>
        {steps.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {steps.map(s => (
              <li key={s.field}>{t(`loyalty.sms.setting_state.${s.state}`, SETTING_STATE_WORDS[s.state], { setting: t(`loyalty.sms.setting.${s.field}`, SETTING_WORDS[s.field]) })}</li>
            ))}
          </ul>
        )}
        <p className="mt-1">{t('loyalty.sms.setup.billing', 'Twilio bills the venue for every SMS part sent.')}</p>
      </Notice>
      <Link to={FULL_ADMIN_INTEGRATIONS} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10">
        {t('loyalty.sms.setup.open', 'Open Settings → Integrations in the full admin')}<ExternalLink size={14} aria-hidden />
      </Link>
    </div>
  )
}

/** How long a text is: its characters, its parts, and the alphabet — and which characters make it Unicode. */
export function LengthLine({ length, max, chars }: { length: SmsLength; max: number; chars: number }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const n = (count: number) => points(count, locale)
  return (
    <span className="block space-y-0.5" data-length={length.encoding}>
      <span className="block">
        {t('loyalty.sms.length.line', '{{chars}} of {{max}} characters · {{segments}} SMS (up to {{per}} characters each) · {{alphabet}}', {
          chars: n(chars), max: n(max), segments: n(length.segments), per: n(length.per_segment),
          alphabet: t(`loyalty.sms.encoding.${length.encoding}`, ENCODING_WORDS[length.encoding]),
        })}
      </span>
      {length.encoding === 'ucs2' && (
        <span className="block" data-unicode="">
          {t('loyalty.sms.length.unicode', 'These characters make it Unicode, which fits fewer characters in each SMS: {{chars}}', { chars: length.unicode.join(' ') })}
        </span>
      )}
    </span>
  )
}

/** The text as a phone's messages show it: the sender, and one bubble; phones differ, this is the common case. */
export function PhoneBubble({ text, from, sample }: { text: string; from: string | null; sample: boolean }) {
  const { t } = useTranslation()
  return (
    <figure className="space-y-2" data-sms-preview="">
      <div className="mx-auto w-full max-w-[320px] rounded-[2.25rem] border border-a-border bg-a-surface-2 px-4 pb-8 pt-3 shadow-a-sm">
        <div aria-hidden className="mx-auto h-1.5 w-16 rounded-full bg-a-border" />
        <p className="mt-4 text-center text-xs font-medium text-a-text-2">{from ?? t('loyalty.sms.preview.no_from', 'The venue’s number')}</p>
        <div className="mt-4 max-w-[85%] rounded-2xl rounded-bl-md border border-a-border bg-a-surface px-3 py-2">
          <p className={`whitespace-pre-line break-words text-sm ${text.trim() ? 'text-a-text' : 'text-a-text-2'}`}>
            {text.trim() || t('loyalty.sms.preview.no_text', 'Your text')}
          </p>
        </div>
      </div>
      <figcaption className="text-center text-xs text-a-text-2">
        {sample
          ? t('loyalty.sms.preview.sample', 'With your own name in the tags, as your test has them. Each member’s copy has theirs.')
          : t('loyalty.sms.preview.caption', 'How it shows on a phone. Phones differ.')}
      </figcaption>
    </figure>
  )
}
