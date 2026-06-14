import { describe, expect, it } from 'vitest'
import { INTENT_META } from './intentMeta'

/**
 * Locks the 7 canonical Engagement Hub intent tags. Drift between this
 * file and the backend's `EngagementAiService::INTENTS` set causes
 * rendered-blank chips (the AI returns an intent the frontend doesn't
 * know how to label or color). The backend normalises unknowns to
 * 'other' before persistence, so the frontend MUST have 'other' as a
 * fallback — without it, a stale row carrying a deleted intent would
 * render unstyled.
 *
 * The 7 canonical intents per CLAUDE.md Engagement Hub section:
 *   booking_inquiry, info_request, complaint, cancellation, support,
 *   spam, other
 */
describe('intentMeta — 7 canonical Engagement Hub intents', () => {
  const CANONICAL_INTENTS = [
    'booking_inquiry',
    'info_request',
    'complaint',
    'cancellation',
    'support',
    'spam',
    'other',
  ] as const

  it('INTENT_META covers all 7 canonical intents', () => {
    for (const intent of CANONICAL_INTENTS) {
      expect(INTENT_META[intent]).toBeTruthy()
    }
  })

  it('INTENT_META has no extra entries beyond the 7 canonical intents', () => {
    // Defends against silent additions that would diverge from the
    // backend's INTENTS set. If a new intent is genuinely needed, the
    // backend has to add it too — this test enforces the lockstep.
    const actual = Object.keys(INTENT_META).sort()
    const expected = [...CANONICAL_INTENTS].sort()
    expect(actual).toEqual(expected)
  })

  it('every intent has a non-empty label', () => {
    for (const intent of CANONICAL_INTENTS) {
      expect(typeof INTENT_META[intent].label).toBe('string')
      expect(INTENT_META[intent].label.length).toBeGreaterThan(0)
    }
  })

  it('every intent has an icon component', () => {
    // The icon is a Lucide React component (function in this build).
    // Asserting it's defined rules out the "forgot to import" failure
    // mode that would render a broken chip.
    for (const intent of CANONICAL_INTENTS) {
      expect(INTENT_META[intent].icon).toBeTruthy()
    }
  })

  it('every intent has a non-empty class-string for badge styling', () => {
    // The `cls` string drives Tailwind utility classes on the chip
    // background + text + border. An empty string would render as
    // an unstyled element — invisible against dark surfaces.
    for (const intent of CANONICAL_INTENTS) {
      expect(typeof INTENT_META[intent].cls).toBe('string')
      expect(INTENT_META[intent].cls.length).toBeGreaterThan(0)
    }
  })

  it("'other' carries a neutral / slate styling — the safe fallback bucket", () => {
    // 'other' is the bucket the backend normalises unknown intents to.
    // It MUST render with a neutral visual that doesn't false-positive
    // as urgency (red/orange) or a success state (green).
    const cls = INTENT_META.other.cls
    expect(cls.includes('slate') || cls.includes('gray')).toBe(true)
  })

  it("'complaint' carries a danger / red styling — escalation signal", () => {
    // Complaints must visually pop as urgent. Drift to neutral here
    // would cost ops the chance to triage angry guests fast.
    expect(INTENT_META.complaint.cls).toContain('red')
  })
})
