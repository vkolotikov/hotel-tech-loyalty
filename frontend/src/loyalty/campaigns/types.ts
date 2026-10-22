import type { MemberRow, Paged } from '../lib/types'

/**
 * What Campaigns' calls answer and take (spec 2026-10-21 release 2 §6; SegmentController, CampaignController).
 * Instants are UTC ISO strings shown on the venue's clock.
 */

// ─── Segments ─────────────────────────────────────────────────────────────

/** What a rule's value is (SegmentRules::TYPES): tier ids, days, a number of points, a date, or nothing. */
export type ValueKind = 'tiers' | 'days' | 'points' | 'date' | 'none'

/** One rule type as the server offers it, with its operators and the bounds of its value. */
export interface RuleType {
  type: string
  ops: string[]
  value: ValueKind
  min?: number | string
  max?: number | string
}

export interface OptionTier {
  id: number
  name: string
  color: string | null
  is_active: boolean
}

/** `GET segments/options`: the editor's choices, served by the server. */
export interface SegmentOptions {
  operators: string[]
  max_rules: number
  types: RuleType[]
  tiers: OptionTier[]
}

/** A rule in MemberSegmentService's format. */
export interface Rule {
  type: string
  op: string
  value?: number | string | number[] | null
}

/** What is wrong with a segment's rules: the rule's index (null for the segment as a whole) and why. */
export interface RuleProblem {
  index: number | null
  reason: string
}

export interface Segment {
  id: number
  name: string
  description: string | null
  /** The explicit "Everyone": no rules. */
  everyone: boolean
  operator: string
  filters: Rule[]
  /** The active members the shared service matches now. */
  members: number
  /** A stored rule the workspace would refuse (one the full admin saved); such a segment is not sent to. */
  problem: RuleProblem | null
  last_sent_at: string | null
  updated_at: string | null
}

export interface SegmentBody {
  name: string
  description: string | null
  everyone: boolean
  operator: string
  filters: Rule[]
}

/** What the rules match now: the members, those who agreed to marketing email, and the newest ten. */
export interface SegmentPreview {
  count: number
  marketing: number
  sample: MemberRow[]
}

// ─── Campaigns ────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type Align = 'left' | 'center' | 'right'

/** A body block in the full admin's EmailBlockBuilder format, the subset the workspace writes. */
export type Block =
  | { id: string; type: 'heading'; text: string; level: 1 | 2 | 3; align: Align; color: string }
  | { id: string; type: 'text'; text: string; color: string; align: Align; fontSize: number }
  | { id: string; type: 'button'; text: string; url: string; bgColor: string; textColor: string; align: Align }
  | { id: string; type: 'divider'; color: string }
  | { id: string; type: 'spacer'; height: number }

export type BlockType = Block['type']

export interface CampaignRow {
  id: number
  name: string
  subject: string
  /** The server's word; one it might add later reads as a draft's quiet tone. */
  status: string
  segment: { id: number; name: string } | null
  recipient_count: number
  sent_count: number
  failed_count: number
  /** Release 4, send later: the instant it is (or was) due, and the same on the venue's clock (`YYYY-MM-DDTHH:mm`). */
  scheduled_at: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CampaignsPage extends Paged {
  campaigns: CampaignRow[]
}

export interface Campaign extends CampaignRow {
  segment_id: number | null
  /** The blocks are the workspace's subset: the draft is edited and sent here. */
  editable_here: boolean
  /** null when the draft is the full admin's (an image, or its own HTML). */
  body_blocks: Block[] | null
  /** The server's rendering: what is sent, its tags filled for each member as it goes. */
  body_html: string
  /** The subject and the rendering with the tags filled with the viewer's own sample, as their test email has them: the preview. */
  preview_subject: string
  preview_html: string
  /** What reads as a tag in the saved subject or body but is filled by none: members would read it as written. */
  unknown_tags: string[]
  /** What the saved draft still lacks: `subject`, `body`, `button:<index>`. */
  missing: string[]
  /** Why a scheduled send did not start when it was due (a code), on a failed campaign; null otherwise. */
  schedule_problem: string | null
  last_progress_at: string | null
  created_by: string | null
  sent_by: string | null
  /** The draft's `updated_at`, sent back with Send so the draft that goes out is the one shown. */
  revision: string
}

/** A tag the editor offers (CampaignTags::options): as written, its name, and the server's English description. */
export interface TagOption {
  tag: string
  name: string
  label: string
}

/** The block editor's choices, served with every campaign (CampaignBody::options, CampaignTags::options). */
export interface CampaignOptions {
  block_types: BlockType[]
  /** A new block of each type without its id: the builder's defaults, empty texts. */
  new_blocks: Record<string, Record<string, unknown>>
  aligns: Align[]
  levels: number[]
  font_sizes: number[]
  max_blocks: number
  max_text: { heading: number; text: number; button: number }
  max_url: number
  spacer: { min: number; max: number }
  max_name: number
  max_subject: number
  /** The tags the editor offers. */
  tags: TagOption[]
  /** Every tag that is filled, those offered and the full admin builder's own (`{{member.name}}`, …). */
  known_tags: string[]
}

/** A campaign's answer: the campaign and the editor's choices. */
export interface CampaignAnswer {
  campaign: Campaign
  options: CampaignOptions
}

export interface CampaignBody {
  name: string
  subject: string
  segment_id: number | null
  body_blocks: Block[]
}

/** `GET campaigns/{id}/audience`: who Send would email now, and why the segment's other members would not get it. */
export interface Audience {
  segment: { id: number; name: string }
  members: number
  reached: number
  unsubscribed: number
  no_consent: number
  suppressed: number
  no_email: number
  /** The most one campaign may reach. */
  limit: number
}
