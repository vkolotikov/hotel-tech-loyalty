# Personal offers and voucher attachments implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and one fresh whole-branch review.

**Goal:** Prepare a private offer for individually selected members, attach one PDF/JPEG/PNG/WebP voucher (up to 5 MiB), and explicitly send it by email and member portal.

**Architecture:** Extend the existing offer and canonical eligibility checks. Keep attachment bytes and immutable delivery snapshots in the database. Send email only through CampaignStart and SendEmailCampaignChunk, with the existing consent/suppression, sender identity and duplicate prevention. Keep portal messages only through NotificationService. Reuse the current staff editor, member selector and portal reward cards.

**Stack:** Laravel 13 / PHP 8.5, PostgreSQL and SQLite, React/TypeScript and current workspace primitives.

**Spec:** User request in this conversation; email plus member portal confirmed on 11 November 2026. Decisions below are implementation defaults within that request.

## Constraints and review focus

- Keep the existing public/level offers and installed native API shapes compatible; no public widget behavior changes.
- Selected-member offers must be absent and unclaimable for everybody else, including guessed codes, booking coupons and attachment URLs.
- Empty selected recipients must never become everyone. New member references use OwnRows and survive merge/deduplication.
- Saving edits never sends. Sending previews exact recipients and requires explicit confirmation; repeated keys never duplicate mail or portal messages.
- File replacement cannot change an email already queued. Private bytes survive deploys; validate actual MIME/size and never serve executable SVG/HTML.
- All staff copy uses five loyalty locales, member copy five portal locales; existing navy staff popup and portal tokens.
- No real customer sends during implementation or acceptance; use the isolated PostgreSQL/mail-capture rehearsal.

## Task 1 — Private audience and canonical eligibility

- [x] Add migration for `special_offers.audience` (`programme` default / `members`) and tenant-owned `special_offer_recipients` unique on offer/member.
- [x] Add audience persistence and response metadata to staff OfferController; validate own recipient IDs, nonempty members mode, and clear tier restriction in that mode. Preserve explicit partial updates.
- [x] Extend canonical `allowsMembership()` with selected-recipient checks; apply to member list/claim, coupons, desk bonuses and earning multipliers, retaining tier and membership rules. Public reads avoid new-table queries in legacy narrow test schemas.
- [x] Add merge recipient deduplication and member erasure handling; update narrow test schemas.
- [x] Test selected/unselected/cross-tenant/empty recipients, claim/code access and merge. Watch failures, implement, then run scoped regression tests.

## Task 2 — Durable private attachment

- [x] Add `special_offer_files` (one per tenant/offer) with original safe name, actual MIME, byte count/hash and base64 content; hide bytes from model serialization.
- [x] Implement upload/delete/download with manage-offer writes, staff reads and member eligibility checks; response flags/metadata only. Add AccessMap/routes.
- [x] Test PDF and raster acceptance, MIME/size rejection, cross-tenant/nonrecipient refusal, replacement and authenticated download.

## Task 3 — Explicit delivery and immutable email snapshot

- [x] Add `special_offer_sends`, unique tenant/idempotency key, campaign link and copied attachment metadata/content; save the confirmed target list and snapshot before queue handoff.
- [x] Add preview/send endpoints and OfferDelivery service. Preview returns revision, email reach/exclusions and portal reach; send refuses changed preview, deduplicates by key and only targets allowed active members.
- [x] Build an explicit-member email campaign from the offer, then use CampaignStart::startFullAdmin outside the snapshot transaction. Keep inbox messages once under the send-row transaction; respect notification opt-out. A failed queue attempt remains safely retryable.
- [x] Let SendEmailCampaignChunk attach the immutable offer-send snapshot. Recheck current offer audience before delivery so revocation cannot deliver private bytes to a removed recipient.
- [x] Test repeated clicks/retries, opt-outs/suppression, rollback/queue failure and original attachment after replacement.

## Task 4 — Staff workflow and member download

- [x] Extend offer form/types with programme vs selected-member audience and a searchable member picker; preserve keyboard focus while searching.
- [x] Add attachment tile/upload/remove after saving, and a Send popup with member selection, preview counts and an explicit send button. Keep the existing popup/draft guard.
- [x] Add authenticated attachment downloads to portal offer cards and new-offer inbox messages, with five-language copy. Native API fields are additive; do not edit native UI.
- [x] Render-check desktop/phone, both themes and long translations; test audience changes, file operations and sends against the real isolated API.

## Task 5 — Review, release and evidence

- [x] Run relevant backend, AccessMap/OwnIds/merge/coupon, frontend, TypeScript/lint and PHPStan checks; fresh-context whole-branch review and address important findings.
- [x] Use the source-patch deployment recipe, baseline `88fdf4adb`; required checks and fresh build on the artifact, then content verification on both production domains.
- [x] Record audit and 11 November handoff. Stop owned rehearsal helpers and remove only the verified deployment checkout.

## Rulings

- Email and member portal are both supported as confirmed; no production recipients are selected or contacted by the agent.
- Individual selection controls privacy; public offers can still be shared with individual people without silently changing their existing audience.
- A single attachment keeps the feature compact; PDF, PNG, JPEG and WebP cover the requested voucher designs.
- Metadata reads never fetch attachment bytes. The immutable outbox includes the rendered body, subject and attachment, while the job rechecks current recipient eligibility.
- Source email campaigns are read-only in ordinary campaign editors/start/reset flows. A clean duplicate drops the offer pointer; cancellation stays possible and retries report a stopped delivery accurately.
- Browser acceptance uses only the isolated seeded demo; PHPUnit PostgreSQL checks use the separate migrated `personal_offers_test` database. An exploratory run against the seeded demo mixed global fixture counts with browser data; it is not release evidence. The old SQLite-only no-referral-code merge case is documented in the workspace runbook.
- Native member app directories are absent from this checkout, so their TypeScript/Vitest checks cannot run here. Shared portal changes are additive types and translated copy.

Completion: source efb56e7bc deployed as main 0d3e82cf6; all artifact gates and 30 live checks pass. Owned helpers stopped and verified release checkout removed. Evidence is in the audit and 11 November handoff.
