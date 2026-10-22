import type { TagOption } from '../campaigns/types'
import type { Paged } from '../lib/types'

/**
 * What the SMS campaigns' calls answer and take (spec 2026-10-22 release 4 §5, R4-4; SmsController). Instants are UTC
 * ISO strings shown on the venue's clock; a scheduled time also comes as the venue's wall clock (`scheduled_for`).
 * Every limit, the tags and their sample, and whether the venue's Twilio account is set up come from the server.
 */

export type SmsStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'

/** How far a campaign got, from its delivery rows: each member counted once, by how it went. */
export interface SmsResults {
  /** Twilio took the SMS. */
  sent: number
  /** Twilio refused it for that member (the reason is Twilio's code), or could not be reached. */
  failed: number
  /** Nothing sent: the member turned SMS off, lost their number or was switched off after Send. */
  skipped: number
  /** Under way when sending stopped; not sent again. */
  pending: number
}

/** A text measured as the networks count it (App\Services\Sms\SmsText; smsMath.ts `smsLength`). */
export interface SmsLength {
  encoding: 'gsm7' | 'ucs2'
  /** GSM septets, or UTF-16 code units. */
  units: number
  segments: number
  /** What one part holds for this length: 160/70 alone, 153/67 in a longer text. */
  per_segment: number
  /** The first characters (up to ten) outside the GSM alphabet. */
  unicode: string[]
}

/** Whether the venue's own Twilio account is set up (Settings → Integrations); never a SID or the token. */
export interface TwilioReadiness {
  ready: boolean
  /** `account_sid`, `auth_token`, `phone_number`: empty. */
  missing: string[]
  /** `account_sid`, `phone_number`: not in a form Twilio takes. */
  wrong: string[]
  /** The sender members see: a number, a sender name or a Messaging Service. */
  from: string | null
}

export interface SmsRow {
  id: number
  name: string
  /** The text's first line. */
  excerpt: string
  /** The server's word; one it might add later reads as a draft's quiet tone. */
  status: string
  segment: { id: number; name: string } | null
  /** The members it was handed when it started. */
  recipient_count: number
  results: SmsResults
  /** The SMS parts Twilio counted for those it took. */
  segments_sent: number
  scheduled_at: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SmsPage extends Paged {
  messages: SmsRow[]
  twilio: TwilioReadiness
}

export interface Sms extends SmsRow {
  body: string
  segment_id: number | null
  /** What the saved draft still lacks: `body`. */
  missing: string[]
  /** The saved text as written, and filled with the viewer's own sample (the preview). */
  length: SmsLength
  preview: string
  preview_length: SmsLength
  /** What reads as a tag in the saved text but is filled by none: members would read it as written. */
  unknown_tags: string[]
  /** Why a failed campaign stopped (`twilio_20003`, `not_ready`, …), or why a scheduled one did not start. */
  problem: string | null
  /** The commonest reasons members' SMS failed. */
  failures: { reason: string; count: number }[]
  last_progress_at: string | null
  created_by: string | null
  sent_by: string | null
  /** The draft's `updated_at`, sent back with Send so the campaign that goes out is the one shown. */
  revision: string
}

/** The editor's choices, served with every campaign (SmsMessage::options). */
export interface SmsOptions {
  tags: TagOption[]
  known_tags: string[]
  /** The viewer's own values for every tag (CampaignTags::sample), for the preview. */
  sample: Record<string, string>
  max_name: number
  max_body: number
  limit: number
  gsm: { single: number; part: number }
  ucs2: { single: number; part: number }
  twilio: TwilioReadiness
}

export interface SmsAnswer {
  sms: Sms
  options: SmsOptions
}

export interface SmsBody {
  name: string
  body: string
  segment_id: number | null
}

/** `GET sms/{id}/audience`: who Send would text now, the SMS parts that comes to, and why the others would not get it. */
export interface SmsAudience {
  segment: { id: number; name: string }
  members: number
  reached: number
  no_consent: number
  no_phone: number
  bad_phone: number
  same_phone: number
  segments: number
  limit: number
}
