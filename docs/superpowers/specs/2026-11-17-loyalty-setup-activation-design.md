# Loyalty setup, reward settings and activation

The owner's 17 November request authorises these improvements and the follow-up says to proceed. Points 2 and 3
describe the same business-template issue. Routine implementation choices below are ours within that request.

## Outcomes

- Every optional earning method can be deselected. Spending points have an explicit programme switch, independent
  of visits, stamps, cashback, bonuses and manual awards. Existing venues default to their current behaviour; the
  saved rate is retained while off. Tier progress is explained as a programme rule rather than a disabled checkbox.
- Changing the setup template refreshes recommended earning rules and reward examples. Existing tiers, balances,
  redemptions and catalogue records remain. The stamp reward chooser distinguishes selected-template suggestions
  from the actual saved catalogue. A suggested reward is created only by the manager's final Apply, in the same
  transaction as setup, and only if it was selected. Preview alone writes nothing.
- Reward detail uses one open Advanced settings area with Terms first. Stock, claim limits and expiry remain visible
  with Key conditions; How to claim stays prominent. The editor has one coherent advanced area and opens it for any
  validation error in its fields. Existing Loyalty tokens, both themes, five languages and mobile layouts apply.
- Activation must work when a member is created in the portal and activated on Android. Reproduce issuance,
  verification and account binding through real controllers. Keep code purpose/identity isolation, expiry and
  throttling; repair the demonstrated claim-purpose mismatch and resend/counter defects without accepting unrelated
  proofs or creating a second account. No real customer mail or production account changes during testing.

## Approaches

Spending points: a new default-on `spend_points_enabled` switch is preferable to storing a zero rate. It preserves
the existing positive rate and avoids changing the legacy fallback for malformed or zero stored rates.

Business changes: replacing the whole preset could erase membership configuration and is outside this request.
Merely relabelling the old catalogue does not provide relevant choices. Use server-described template reward
choices and transactional materialisation of the chosen reward, preserving existing data and idempotent Apply.

Reward layout: combine the two disclosures and use meaningful subsections. Avoid a new theme, decorative cards or
a whole-screen redesign. Existing navy/light surfaces, reward hue, fonts, spacing and focus tokens remain.

Activation: fix the purpose requested by the client and issued by the server. Preserve original expiry when a
resend reuses the current code, and use the same shared counter store on failure and success. Do not broaden proof
purposes for an unproven legacy-client assumption. Trace the installed Android handoff separately.

## Verification and release

Regression tests reproduce spend-switch persistence and its real earning effect, independent visit rewards,
template changes, own-tenant reward creation, rollback, repeated Apply and activation ownership/expiry/resends.
Browser checks exercise template switching and unchecking, one advanced section, validation discovery and keyboard
access at 390/1440 in both themes. Run scoped PHP 8.5 tests and PostgreSQL, TypeScript, the full Vitest suite, lint,
changed-path Larastan, an independent review, then the separate-worktree source-patch release recipe and live checks.
