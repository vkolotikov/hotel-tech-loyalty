import type { Paged } from '../lib/types'

/**
 * What the push messages' calls answer and take (spec 2026-10-22 release 3 §5; PushController). Instants are UTC ISO
 * strings shown on the venue's clock. The categories and every limit come from the server (`options`).
 */

export type PushStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'

/** How far a message got, from its delivery rows: each member counted once, by how it went. */
export interface PushResults {
  /** Expo accepted the push. */
  sent: number
  /** Expo refused it or could not be reached; it is still in the member's inbox. */
  failed: number
  /** Kept in the inbox, no push: the member switched push off or lost the app after Send. */
  inbox_only: number
  /** Nothing sent: the member switched the category off or was deactivated after Send. */
  skipped: number
  /** Under way when sending stopped; not sent again. */
  pending: number
}

export interface PushRow {
  id: number
  name: string
  title: string
  /** The server's category (one of `options.categories`), or null while the draft has none. */
  category: string | null
  /** The server's word; one it might add later reads as a draft's quiet tone. */
  status: string
  segment: { id: number; name: string } | null
  /** The members it was handed when it started. */
  recipient_count: number
  results: PushResults
  /** Release 4, send later: the instant it is (or was) due, and the same on the venue's clock (`YYYY-MM-DDTHH:mm`). */
  scheduled_at: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PushesPage extends Paged {
  messages: PushRow[]
  all_total?: number
}

export interface Push extends PushRow {
  body: string
  segment_id: number | null
  /** What the saved draft still lacks: `title`, `body`, `category`. */
  missing: string[]
  /** Why a scheduled message did not start when it was due (a code), on a failed message; null otherwise. */
  schedule_problem: string | null
  last_progress_at: string | null
  created_by: string | null
  sent_by: string | null
  /** The draft's `updated_at`, sent back with Send so the message that goes out is the one shown. */
  revision: string
}

/** The editor's choices, served with every message (PushMessage::options). */
export interface PushOptions {
  categories: string[]
  max_name: number
  max_title: number
  /** About how many characters of a title phones show in full. */
  title_guide: number
  max_body: number
  /** About how many characters of a message a lock screen shows. */
  body_guide: number
  /** The most members one message may reach. */
  limit: number
}

export interface PushAnswer {
  push: Push
  options: PushOptions
}

export interface PushBody {
  name: string
  title: string
  body: string
  category: string | null
  segment_id: number | null
}

/** `GET push/{id}/audience`: who Send would push to now, and why the segment's other members would not get it. */
export interface PushAudience {
  segment: { id: number; name: string }
  category: string
  members: number
  reached: number
  push_off: number
  no_device: number
  opted_out: number
  limit: number
}

/** A segment as the segments list answers it, the parts the editor reads. */
export interface SegmentChoice {
  id: number
  name: string
  members: number
  problem: { index: number | null; reason: string } | null
}
