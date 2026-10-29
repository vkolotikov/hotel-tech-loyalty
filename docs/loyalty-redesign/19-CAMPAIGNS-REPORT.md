# Campaigns — implementation record

Scope: Email, Segments, Push and SMS under the existing `/loyalty/campaigns` routes. Existing delivery pipelines, consent, source and tenant boundaries, results, scheduling and full-admin drafts remain authoritative.

## Design source

Connected Figma file `d6IGmk3hOoMw0V5rONbI1A`, session `79d251fd-0b3c-4321-8183-ae5b649e7c05`: CM-01 `122:5967`, CM-02 `122:5968`, CM-03 `122:5969`, CM-04 `122:5970`. All four high-fidelity contexts and screenshots were inspected. CM-04 supplies compact references within the same application shell; responsive layouts adapt those references. Code Connect names `Button` and `InputField` from `primitives`, which is not an installed package or project module. Existing Overview controls, workspace Button/FormField, tokens and Poppins are the project equivalents.

## Implementation map

| Behavior | Existing source | Change |
| --- | --- | --- |
| Channel navigation and list | CampaignsPage, CampaignsTab, PushTab, SmsTab; existing GET lists | Overview shell, channel cards, searchable lists and status filters; tenant-scoped read filters only |
| Message editor | CampaignEditor, BlockList, CampaignBody | Two-step layout, compact blocks, saved server preview and device widths; keep all block types and validation |
| Audience and send | SegmentDialog, CampaignAudience, SendDialog, CampaignStart | Full-page audience review with actual exclusions; preserve count/revision checks and scheduling |
| Saved segments | SegmentsTab, SegmentRules | Search, selection and rules summary; reuse rule editor and live server count |
| Push and SMS | Existing editors, send dialogs, Twilio readiness | CM-04 surfaces, responsive forms, actual readiness, consent, length and cost notices |
| Retained workflows | Results, duplicate/delete/cancel/schedule/unschedule, elsewhere drafts | Preserve writers, confirmation and original URLs |

## Source-backed adaptations

The current email contract saves a segment ID, not private campaign rules. Customizing an audience creates an explicitly saved segment copy; the original segment remains unchanged. Test email goes only to the signed-in staff member. Sender verification, email preheader, per-tag fallback, push test/device routing and an estimated SMS price are not supplied by these contracts and must not be invented. Previews retain the actual server-rendered message and sample tags; saving a draft never sends it. Tests use local fixtures, never live recipients.

## Verification and deployment

The read-only lists now accept `q` (literal text, up to 200 characters) and `status`, before pagination. They return filtered `total` and unfiltered tenant/source `all_total`. Email metadata supplies the existing sender identity and signed-in test recipient. Four new API tests pass with 76 assertions, including tenant isolation, source boundaries, manager/plan gates, wildcards, case, pagination and identity. No migration or dependency change is required.

The browser fixture intercepts every API call. It verifies search/filter/reset, empty drafts, block add/move/remove, pending-save locking, internal-link discard confirmation, copied audiences, actual exclusions, changed-count refusal, send/results/cancel, schedule/unschedule, duplicate/delete, Push/SMS review, Twilio readiness, errors, denied reads, five languages and both themes. No real messages are sent. Dirty protection covers workspace links and page unload; browser history is the existing router behavior.

Visual comparison uses the four downloaded Figma screenshots beside rendered pages at 1440px; responsive checks cover 320, 390, 768 and 1024px. Desktop rail 232px, top bar 72px, channel card 274×118px, list columns 752/376px, editor/audience columns 664/464px. All three actual local Poppins font faces are checked loaded. Content height adapts to real campaign names, delivery results and translated text. Exact asset hashes and callsites are in `evidence/campaigns/assets.json`: 16 existing Overview SVGs reused unchanged and the original Campaigns program SVG imported unchanged. CM-04 compact examples are adapted to each channel's existing editor and required consent/category/setup controls.

The final isolated artifact passes **5,704 frontend tests in 394 files**, TypeScript and Loyalty ESLint. The shared FormField now labels filled textareas/selects from the visible field label, with a regression test. The fresh Vite production build and SPA postbuild both pass.

Scoped PHP 8.4.20 artifact runs pass **736 tests / 9,985 assertions**: LoyaltyWorkspace 595 / 5,878, AdminAccess 51 / 3,063 and Unit/Loyalty 90 / 1,044. Use `XDEBUG_MODE=off` and `-d max_execution_time=0` for this large scoped run; the original run reached the local 300-second CLI limit without a final summary and is not counted as passing.

The exact compiled bundle passes **38 browser checks**, with no runtime errors or horizontal overflow at the tested widths. Compiled desktop, mobile, light-theme and translated screenshots were inspected against Figma. Screenshots scroll the sandboxed email iframe into view before capture: Chrome may omit its contents in an off-screen full-page capture. The additional `*-preview.png` images show the actual visible mobile/desktop preview. The compiled evidence and structured results are saved beside the Figma references.

The previous deployed feature baseline is `ec236bfadfd393abc7abc1328e61b378ff9bcb86`; production starts at `c3a2646786f0f60f0c01232ef0e30369a0e3c4d0`. The isolated release uses E: with a real vendor copy and matching frontend dependencies. An explicit source allowlist excludes generated feature-branch artifacts and unrelated files.

## Production deployment

Production **59a6bda89ca5e47183135489550325c029f6c1b9** is live at `https://app.hexa-tech.uk/loyalty/campaigns`, verified **28 October 2026, 21:13 Europe/Riga**. Source patches `285123749` and `87fe96fa1` were applied to the isolated `origin/main` checkout with whole-source parity across 82 allowed paths before the fresh build. No feature-branch build artifacts were used.

Feature `feature/loyalty-campaigns-20261028`; deployed source and **next source-patch baseline**: **1b800e9bb2d4956120092a9f29c37d6a85d506dc**. Do not use the later post-deployment documentation/evidence commit as that baseline.

Live entry `index--e3eLj3s.js`, Loyalty `LoyaltyApp-DfQxl3v0.js` / `LoyaltyApp-CHeUwwzK.css`. Campaigns and earlier feature markers, responsive styles, three Poppins payloads, campaigns/segments/push/sms unauthenticated 401 JSON, the public landing kit and retired stylesheet 404 passed. Live verification is read-only; delivery behavior is covered by the scoped server tests and local browser fixtures. Evidence: `evidence/campaigns/live-verification.json`, `validation.json`, `php-verification.json` and `browser-verification.json`.
