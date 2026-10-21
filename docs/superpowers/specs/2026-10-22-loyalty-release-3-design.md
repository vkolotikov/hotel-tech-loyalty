# HexaTech Loyalty, release 3 — durable files, the member inbox, safer campaigns, push messages (design)

Status: owner's answers of 2026-10-22. Builds on release 2 (live as `main` 7549f28, built from branch 22b99d0).
Runbook: `docs/loyalty-workspace.md`. Release 2 design: `2026-10-21-loyalty-release-2-design.md`.

## 1. Owner decisions

| # | Question | Answer |
|---|---|---|
| R3-1 | Durable files | Wallet certificates and member-import files move off the server's local disk (Laravel Cloud does not keep it between deploys, nor share it between replicas) into the database, encrypted where they are secrets. One migration is fine. The certificates are uploaded once more after the deploy. |
| R3-2 | Member inbox | Fix it: members see in the app's and the portal's inbox what was sent to them. |
| R3-3 | Safer campaigns and tags | A retried batch never emails a member twice; `{{first_name}}`-style tags are filled per member, in the full admin's campaigns too. |
| R3-4 | Push messages | Send a push notification to a segment from the workspace, respecting every opt-out, with the same confirmation and once-only rules as email. |
| R3-5 | Green test suite | The tests that fail on every run are made right — the code where the code is wrong, the test where the test is — so a red test always means something new. |
| R3-6 | One logo writer | The full admin's logo upload goes through `AppLook::setLogo` (it deletes only its own old file). |

The full admin otherwise stays as it is. Logic both sides need lives in one shared service the full admin's
controller calls; a test pins the full admin's answer on the old code first.

## 2. Durable files (R3-1)

- `wallet_configs` gains encrypted columns for the three files' contents (the `.p12`, the WWDR certificate, the
  Google service-account JSON). `WalletSettings` writes them; `AppleWalletService` and `GoogleWalletService` read them;
  readiness reads them. A file still on the local disk from before is taken into the database the first time it is
  read, then left alone. The answers the full admin and the workspace give stay the same (flags only, never content).
- `member_import_batches` keeps the uploaded CSV's text in the database between the preview and the last chunk, and
  clears it when the batch ends; the full admin's import and the workspace's both read it from there.
- The migrations add nullable columns only (safe with `migrate --force` on a live database).

## 3. The member inbox (R3-2)

`NotificationService::send()` writes `push_notifications` rows with `is_sent = false` and nothing ever sets it, while
the app's inbox (`GET /v1/member/notifications`) and the portal's unread count read `is_sent = true` — so the inbox is
always empty. It also writes nothing for a member without the phone app. Fix: a notification the member did not opt
out of (by category) is kept for their inbox whatever happens to the push, and marked sent; the push itself still
needs the member's push switch and a device. The member endpoints keep their shapes. Rows written before the fix are
shown as already read, so no member suddenly has a pile of unread old notifications.

## 4. Safer campaigns and tags (R3-3)

- One row per campaign and member records the email (`email_campaign_deliveries`, unique on campaign and member,
  written before the send): a retried chunk passes over members already emailed. The shared `SendEmailCampaignChunk`
  does this for both sides; its counts stay right.
- Tags in the subject and the body are filled per member, HTML-escaped in the body: the tags `EmailTemplate` already
  names (`{{first_name}}`, `{{member_name}}`, `{{tier_name}}`, `{{points_balance}}`, `{{member_number}}`,
  `{{hotel_name}}`, …) and `{{member.name}}`, which the full admin's builder puts in its starter template. An unknown
  tag stays as written and the workspace's editor says so before sending. The workspace's editor offers the tags; the
  preview and the test email fill them with a sample.
- New member column → `MemberMergeService::MEMBER_COLUMNS`.

## 5. Push messages (R3-4)

A third tab under Campaigns, **Push messages**, for managers, with the plan's `push_notifications` feature
(`features.push` in the bootstrap): a message is a title, a body, a category (offers, points, tier, stays — the
member's own opt-out categories) and a segment. The confirmation names how many members it reaches (push switched
on, a device, the category not opted out) and how many it does not and why; Send starts it once (one conditional
update) and a queued job sends in chunks, recording each member once (no second push on a retry), each push also
landing in the member's inbox (§3). Draft, sending, sent, cancelled; Cancel while sending; Duplicate. Rows are the
existing `notification_campaigns` (so `push_notifications.campaign_id` links them); a column for the segment if one is
needed. API under `/v1/admin/loyalty/push…` (`admin/loyalty/push`: read staff, change manager; every method checks a
manager itself).

## 6. Green tests (R3-5) and one logo writer (R3-6)

- PHP: `HolidayCountryTest`, `PortalBootstrapTest` (three), `AppointmentClockTest` fail where PHP's time-zone list has
  no legacy aliases (`US/Eastern`, …). Production must not depend on that list either: legacy names are mapped to
  their canonical zones in code where zones are read, and the tests pass on any PHP. Valid zones behave as before.
- Frontend: `plannerMeta.test.ts` (three) and `ServiceBookings.venueTime.test.tsx` (one): find whether the code or the
  test is wrong and fix that side; the full admin's behaviour changes only if the code is wrong.
- `SettingsController::uploadLogo` calls `AppLook::setLogo`; its answer stays `{message, url}`.

## 7. Rollout

One deploy by the source-patch recipe after the owner's "yes, deploy"; this one runs migrations (nullable columns, one
new table) — each is tried on a PostgreSQL copy first. After the deploy: upload the wallet certificates again.
