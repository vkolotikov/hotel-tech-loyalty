import type { MemberDetail, MemberRow } from '../lib/types'

/**
 * What the members area's endpoints take and answer (spec 2026-10-21 release 2 §4.2). Days are the venue's own
 * `YYYY-MM-DD`; instants are ISO 8601 strings shown in the venue's zone.
 */

/** A member as their page shows them: the answer of every change this area makes. */
export type MemberProfile = MemberDetail['member']

export interface MemberAnswer {
  member: MemberProfile
}

export interface EnrolBody {
  name: string
  email: string
  phone: string | null
  send_welcome: boolean
}

export interface EnrolAnswer extends MemberAnswer {
  email_sent: boolean
}

/**
 * What `PUT members/{id}/validity` answers (release 8, spec 2026-10-25 §3; ValidityController): the member as their page
 * shows them, the end date (Y-m-d, or null: it never ends) and its state; whether this call changed it, and whether it
 * was a retry of an earlier press (`replayed`: the first answer, nothing written).
 */
export interface ValidityAnswer extends MemberAnswer {
  valid_until: string | null
  state: 'active' | 'expiring' | 'expired' | 'off'
  changed: boolean
  replayed: boolean
}

export interface DetailsBody {
  name: string
  email: string
  phone: string | null
  language: string | null
  nationality: string | null
  date_of_birth: string | null
  marketing_consent: boolean
}

export interface TierBody {
  tier_id: number
  /** The last venue day the tier holds through, or null to leave it to the next review. */
  keep_until: string | null
}

/** The member's card: the static QR code as an SVG data URI. */
export interface CardData {
  member_number: string
  name: string
  qr_svg: string
}

export type DuplicateReason = 'same_email' | 'same_phone'

/** Two members that look like one person; `keep` is the one the server suggests keeping (the oldest). */
export interface DuplicatePair {
  a: MemberRow
  b: MemberRow
  reasons: DuplicateReason[]
  keep: number
}

export interface MergeBody {
  keep_id: number
  merge_id: number
  reason: string
}

export type ImportState = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'

/** A row that was not imported, by code (the server never sends its English). */
export interface ImportProblem {
  line: number
  email: string
  /** Passed over (already a member, a repeat) or refused (no email, an unknown tier…). */
  kind: 'skipped' | 'refused'
  code: string
  first_line?: number
  tier?: string
}

export interface ImportBatch {
  id: number
  filename: string | null
  state: ImportState
  finished: boolean
  /** Rows the file holds that could be read; `file_rows` every data row on disk. */
  rows: number
  file_rows: number
  processed: number
  progress: number
  created: number
  skipped: number
  refused: number
  points: number
  columns_used: string[]
  columns_ignored: string[]
  /** Why a failed batch stopped (a file code), else null. */
  failure: string | null
  by: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  /** The last 100 rows not imported; only on one batch's answers. */
  problems?: ImportProblem[]
}

export interface ImportPreview {
  rows: number
  new: number
  existing: number
  skipped: number
  refused: number
  points: number
  columns_used: string[]
  columns_ignored: string[]
  problems: ImportProblem[]
  sample: { line: number; email: string; tier: string | null; points: number }[]
  plan_limit: number | null
}

export interface ImportsList {
  imports: ImportBatch[]
  /** The columns an import understands (the full admin's own list). */
  columns: string[]
}
