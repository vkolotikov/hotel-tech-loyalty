# HexaTech Staff — product, workflow and design review

3 November 2026. Review and proposals only; no app or production changes.

## Recommendation

Keep the existing loyalty engine and the recognisable navy-and-gold identity. Make Staff a calmer, faster desk tool: the right member, the right action, an unmistakable result. The highest-value work is a reliable request inbox, safer transaction forms, a compact member view and a few missing desk operations. A broad expansion into a full mobile CRM would dilute this goal.

The app already has a substantial foundation. QR/NFC/manual lookup, member search, tier filters, points, check-ins, card linking, benefit approval and reward handover exist. So do five languages, optional biometric locking, request notifications and a minimum-version gate. The server owns permissions, eligibility, points, credit and request transitions. These should be preserved.

The native app currently covers less of the loyalty system than the mobile web workspace. Several recommendations below reuse existing server capabilities; they do not require inventing a second loyalty engine.

## Scope and evidence

- Native source reviewed at `303f89c85`, including all five tabs, member detail, scan result, points/check-in/card-link forms, shared UI, session, notifications, query handling and API client.
- Backend compared with production `origin/main` at `d9117b475`. The relevant controllers and services match; the loyalty-path differences are an additional SMS connection controller and a small StaffAlerts change, unrelated to the findings here.
- Product/runbook review: Staff plan/README, current release handoff, loyalty workspace capabilities, permission rules and server request/points/visits services.
- Visual review includes the five committed store captures. These were generated from the web preview with sample data, so they are design evidence, not proof of native behaviour.
- Published Android `1.0.0 (3)` installed from Google Play on Pixel 8 / Android API 35; installer verified as `com.android.vending`. All five tabs, manual member lookup, member details and draft forms were inspected. Native observations and captures are recorded below.
- Existing Staff checks: **22 tests passed in 2 files; TypeScript passed**. These tests do not cover all screen interactions, accessibility, permission combinations or the issues below.
- Direct execution of the existing `pointsFrom()` function reproduced the parsing issue; the published Android form also displayed an entered `1.5` while its action said `Give 15 points`. The draft was cancelled. Contrast figures below are calculated from source colours.
- No production balances, requests, programme settings or store submissions were changed for this audit. Physical iPhone NFC, camera scanning, notification delivery, biometrics, screen readers and large-text layouts are not certified by this review.

Priority: **P1** = address in the next reliability release; **P2** = include in the first agreed design/function iteration; **P3** = validate demand before building. Source-confirmed means the behaviour follows from the implementation; it does not imply a production incident was observed.

## Functional findings to resolve

| Priority | Finding and consequence | Recommended result | Evidence |
|---|---|---|---|
| P1 | **Requests stops at page 1.** Benefits and rewards each request page 1; both APIs return 25 per page. There is no load-more path. With more than 25 open items of a type, older work cannot be reached in the native queue. The Done tab also loads benefits only, so fulfilled rewards disappear from native history. | A paginated, searchable inbox covering benefits and reward redemptions, with complete open/closed history. Default to oldest actionable work, with an explicit sort choice. Reuse `requests/inbox` where suitable; its combined open view includes referrals, so deliberately filter/extend it for the Staff desk scope. | `src/app/(tabs)/requests.tsx:29`; `RequestQueue.php:21`; `RedemptionController.php:27`; `RequestsInbox.php:19`. |
| P1 | **The queue count is incomplete and some failures look empty.** Home/tab badges count waiting benefit requests only, excluding reward handovers and approved benefits. The reward query has no rendered loading/error state. A failed reward load can therefore look like no work; “Nothing is waiting” can appear beneath real pending reward cards when the benefit list is empty. | Define one actionable count, gated by staff rights. Show each source's loading/failure explicitly, and say “All caught up” only after all required reads succeed. Show the last successful refresh when data is stale. | `BootstrapController.php:74`; `requests.tsx:30,51,78`; `(tabs)/_layout.tsx:40`. |
| P1 | **Numeric input can change meaning.** Running the actual parser gives `1.5 → 15`, `1,5 → 15`, and `-10 → 10`. Points require whole positive numbers; silently removing punctuation/signs is unsafe. Check-in also converts a non-empty invalid/negative amount into `null`, which can become an amountless check-in when that option is enabled. | Validate rather than reinterpret. Accept documented thousands separators, reject decimals/signs for points, and show errors beside the field. Treat blank purchase amount separately from an invalid amount. Format currency according to the server's currency rules. | `lib/desk.ts:56`; `app/check-in.tsx:36`; direct parser reproduction; server `Visits/DeskVisit.php:74`. |
| P1 | **Unknown transaction outcomes need safer recovery.** Points/check-in retain the attempt key only for `network`, clear it for server/unknown errors, and keep it only in component memory. Closing the sheet loses it. The generic error says “Nothing was changed” although an ambiguous response cannot establish that. | Preserve one attempt identity until its outcome is known; make retry/check-status explicit and protect an unanswered operation when leaving. Use “We couldn't confirm the result. Check activity before trying again.” for an uncertain result. Never queue blind offline balance changes. | `app/points.tsx:47`; `app/check-in.tsx:39`; `lib/i18n/en.ts:16`. This is a source-confirmed recovery gap; duplicate production transactions were **not** reproduced. |
| P1 | **Some controls ignore available permissions.** Check-in is offered from programme options without `can.award`; reward handover is offered without `can.redeem`. More shows every web destination, including manager/analytics areas. The backend still enforces access. | Derive actionable controls from server capabilities and current state. Read-only staff can inspect a request and see “Manager required” where appropriate, without reaching a doomed action. Keep all server checks. | `components/MemberActions.tsx:22`; `requests.tsx:136`; `(tabs)/more.tsx:83`; `VisitController.php:30`; `RedemptionController.php:63`. |
| P1 | **The biometric lock does not cover a fresh process start.** `locked` initially equals false and only changes after an observed background interval. A restored token on a cold launch does not trigger the gate. The code also lacks a background privacy cover. | When lock is enabled, authenticate on cold launch before displaying member data, then on the configured resume interval; cover app-switcher snapshots. Preserve an intentional sign-out path. Verify on physical iOS/Android with real biometric enrolment. | `app/_layout.tsx:84–96`; `lib/session.ts:39`. Source-confirmed missing path; no physical biometric bypass test was performed. |
| P1 | **Automatic sign-out does not centralise data cleanup.** `queryClient.clear()` is in the More-screen handler; the API's 401 callback calls `signOut()` directly. Scan context/result is a separate store with no reset. Responses are not tied to a session generation as in the member-app fix. | Centralise cancel/clear/reset for every sign-out, scope or reset cached data per session, protect against late responses and guard member/modal routes too. Test token expiry while a member sheet is open and account switching. | `lib/session.ts:57,75`; `(tabs)/more.tsx:56`; `lib/queries.ts:10,63`. This establishes missing safeguards, **not** an observed cross-account data disclosure. |
| P2 | **Tier progress uses the wrong unit for some programmes.** Bootstrap includes `progress_by`, but the UI always uses “{{needed}} points to {{tier}}”. | Display points, visits or formatted spend using server progress metadata; do not derive tier eligibility locally. Distinguish spendable balance from qualifying/lifetime tier progress, and current tier from the next achievable tier. | `lib/types.ts:46`; `lib/i18n/en.ts:144`; `app/member/[id].tsx:90`; `app/scanned.tsx:61`. |
| P2 | **Check-in and purchase are conflated.** The single Check in form always labels amount as optional even when check-in is off and a purchase amount is required. It explains internal “Ways to earn” configuration instead of the task. | Separate “Check in” and “Record purchase” when the venue enables both. Show only applicable fields and the real requirement. The result states actual points/stamp/credit returned by the server. | `app/check-in.tsx`; `lib/i18n/en.ts:180`; `Visits/DeskVisit.php:74–81`. |
| P2 | **Partial-read failures are easy to mistake for absence.** Home metrics/activity lack explicit failed states; member cards/history do not surface their query errors. Manual scan lookup can say no match after a failed search; the place/event picker omits failures. | Distinguish loading, empty, stale and failed states for each section. Keep verified data visible with a compact status; offer a relevant retry. Do not imply a member has no history or a venue has no events when a request failed. | `(tabs)/index.tsx`, `(tabs)/scan.tsx` TypeSheet/WherePicker; `app/member/[id].tsx`. |

An additional scan concern should be exercised during implementation: NFC listening does not include `!picking`, while the camera pauses during place/event selection. Pause every reader while changing context. The picker is also an unpaginated, non-scrolling list built from the first events response. Test a venue with many places/events; never silently limit operational choices.

## High-value additions, using the loyalty system already present

| Proposal | Why it earns space in Staff | Existing support / implementation boundary | Priority |
|---|---|---|---|
| **Lost-card and replacement flow** | A guest losing a card is a normal desk problem. Staff can link a new NFC card now, but cannot disable the old one in native UI. | Existing `members/{id}/cards/{card}/off` writer and card list. Show label/last digits, active status, linked date; confirm disabling and retain history. Keep full UID in details rather than as the primary label. | P2, first iteration |
| **Member enrolment and basic correction** | “No member found” should lead to a useful next step. Staff currently have no native add/edit action. | Existing member create/edit services and duplicate/member-limit rules. Keep minimal fields; offer a member self-registration QR/link where supported. Consent choices must be explicit. Reuse server validation. | P2 |
| **Complete request detail and safe handover** | A name and truncated code on a large card are insufficient context at a busy desk. | Existing member number, code, timestamps and request state. Add a detail sheet, full code, member link, status history where available, and a concise confirm-handover step. Cancellation/refund uses existing redemption cancel writer and previews the actual consequence. | P2, first iteration |
| **Stamps and credit on the member page** | The engine awards these, but native Staff mainly shows credit balance and check-in result. Staff cannot inspect stamp progress or spend credit here. | Existing stamps and credit-read/spend APIs. Show only enabled programme features; spending permission comes from the server. Keep credit adjustments manager-only. | P2 when enabled by the venue |
| **Correct a transaction / renew membership** | Mistakes and expired memberships otherwise force a browser detour. | Existing manager-only history reversal and validity endpoints. Preview the consequence, require a reason for reversal, retain the original ledger and audit. A compensating points entry is not a substitute for the proper reversal. | P2 |
| **Request notification opens the exact item** | Staff should not hunt through the queue after tapping an alert. | Push data already has `kind`, `id`, `organization_id`; the native handler opens only the Requests tab. Existing inbox supports selected item reads. Validate organization/current access and handle an item completed by a colleague. | P2 |
| **Foreground refresh and a clear offline state** | Counts/permissions can change while another staff member works. A 30-second stale time alone is not polling; boot may remain cached for five minutes. | Reuse existing reads; add focus/resume refresh and a consistent connection/last-updated indicator. No offline points, reward handover or door-entry approval without a deliberate separately designed policy. | P2 |
| **Tablet desk layout** | Staff explicitly supports iPad, but content is currently capped at 640 in a single column. | Retain phone flows; on sufficiently wide screens use member/queue list plus detail, with readable content widths and full keyboard support. | P2 after phone prototype |
| **Claim a request, internal note, overdue rules** | Useful where several people share the same queue; prevents duplicated physical service even when the server rejects the second status change. | This is a **new workflow/backend feature**, not something the current request model already promises. Validate shift volume and handover needs first. Keep internal notes separate from member-visible decline reasons. | P3 |

Programme setup, campaigns, bulk imports/merge, advanced reporting and wallet credentials should remain in the web workspace initially. Provide clear, permission-aware “Open workspace” entry points and preserve the target route through login. Do not pass bearer credentials in a URL. A native-to-web sign-in bridge would be a separately designed authentication feature.

## Design direction: quieter luxury, faster service

The current design is coherent, but uses the visual weight of a membership presentation app for nearly every operational control. Gold gradients/glow, coloured action tiles, large rounded containers, a large greeting and repeated icon boxes reduce scan speed. The member card can remain expressive; the surrounding workspace should be simpler.

1. **Keep navy, warm white and restrained brass.** Use one main navy canvas and two surface levels. Gold marks the primary action or selection. Reserve green/amber/red for status, always with an icon and words. Remove decorative purple/pink/blue action colouring unless it communicates a stable category.
2. **Reduce ornament before reducing usability.** Remove button glow, soften gradients and use fewer nested borders. Use spacing and dividers to group information. Suggested Figma starting radii: 14–18 for ordinary panels, 12–14 for inputs; keep a distinctive larger member card. These are proposals, not measured final tokens.
3. **Use typography to distinguish brand from work.** Retain Cormorant for a restrained title or member identity; use Inter for navigation, forms, figures and status. Reduce italic greeting/all-caps repetition. A short label should still be readable at the phone's normal size.
4. **One dominant action per context.** The five-tab structure is understandable and worth retaining: Home/Today, Members, Scan, Requests, More. Keep Scan central but reduce the heavy glow/raised prominence. Do not replace labels with icons alone.
5. **Progressive detail.** Identity, membership state and the next useful action come first. Full ledger, personal details, card IDs and administrative controls live below or in sheets. Compact does not mean hiding status or reducing touch targets.

### Screen proposals

| Screen | Current friction | Proposed hierarchy |
|---|---|---|
| Home → **Today** | Large greeting and Scan card repeat bottom navigation; 30-day figures compete with shift work. | Compact venue/staff header → Scan / Find member → actionable queue summary → recent desk activity. Put longer-term metrics in Insights, or a collapsed manager-only summary. New today/shift metrics require server-defined reads; never relabel the 30-day response. |
| **Members** | Good search and tier filtering, but list states are hard to distinguish and no enrolment path. | Persistent search with clear action → tier/status filters → compact identity rows with membership state and points → Add member where authorised. Show a useful no-match state, not only an icon and sentence. |
| **Scan** | Camera/NFC/manual routes exist, but context is small and results can require scrolling to continue. | Clear “Desk / Spa / Event name” context → scanner → explicit QR/NFC/manual alternatives. Full-width result status and compact member summary; keep “Scan next” reachable in the result footer. Separate quick door result from a full member profile. |
| **Member** | Large fixed-ratio card and tier progress precede actions; benefits, cards, ledger and details form a long stack. | Compact identity, state/expiry and balances → 2–3 role-appropriate actions → Benefits / Activity / Details sections. Preserve a full-card view on demand. Show stamps/credit only when enabled. |
| **Requests** | Multiple large glowing handover buttons; one-line identity/code; Approved label already truncates in a store capture. | Search + Open/Completed views with count → compact rows, type/status/age → detail sheet with full identity and code → one clear action. Keep decline secondary. Show who completed an item only if supported by audited data. |
| **Points / purchase** | Large number, five fixed presets and several chips; ambiguous validation and outcome. | Member summary → explicit amount/unit → a few venue-appropriate presets → reason → before/after summary → labelled confirmation. Preview only values we can calculate legitimately; server supplies loyalty consequences. |
| **More** | A mixed list of web management pages plus preferences; all links shown to all staff. | Account & security, App preferences, Workspace tools, Help. Display version **and build**, support/report problem, notification status and lock. Group management links by permissions. |
| **Sign-in** | The Staff sign-in eyebrow says “HexaTech Loyalty”, which can confuse it with the member app. Large brand area, explanatory copy and all language choices compete with the form. | Clear HexaTech Staff identity → email/password → Sign in → recovery. One language selector. Password visibility toggle, correct autofill/focus, and a clear staff-account-only error. No onboarding carousel. |

### Copy: short, but still precise

| Current | Suggested direction |
|---|---|
| Scan a member | Scan member |
| Card, QR code or a typed number | QR · NFC · Member number, shown only where it helps choose a method |
| Find a member / By name, number or phone | Search members; search hint in the field |
| Type instead | Search or enter number |
| Records today's visit. Ways to earn decide what it gives. | Check in, with a short consequence only where needed |
| Amount spent (optional) | Purchase amount, required only in the purchase flow |
| Hand over | Mark as given, after the item/member confirmation |
| Something went wrong. Nothing was changed; please try again. | Couldn't confirm the result, with a safe recovery action |
| Nothing is waiting. | All caught up, only after all queue sources load successfully |

Delete descriptions that repeat a title or icon. Keep explanations for money/points consequences, refusal reasons, permission limits and irreversible actions. Translate the final short copy in all five languages and test with real long names.

## Accessibility and real-device quality

- **Contrast:** `text3` (`#6c7282`) measures about **4.14:1** on the main background, **3.83:1** on `surface`, and **3.54:1** on `surface2`. It is used for normal-size hints/placeholders and some information. Raise contrast for meaningful text; do not treat a grey hint as disabled text. Tier colours also need a real contrast check, not merely a valid hex string.
- **Targets:** several close/back controls are 40×40; segmented controls are 40 high; chips have small padding without a shared minimum/hit area. Use at least 44×44 pt on iOS and 48×48 dp on Android as design targets. Main buttons already have a good 54 minimum height. [Apple design guidance](https://developer.apple.com/design/tips/), [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps).
- **Large text:** do not claim text scaling is absent—React Native Text may scale by default. The risk is fixed-ratio member cards, one-line truncation, fixed rows and absolute scanner panels. Exercise the largest supported text sizes, landscape and small phones; allow content height to grow. [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility).
- **Screen readers:** shared buttons have some good labels/roles, but Field does not explicitly connect its visible label to its input, and preference switches lack explicit labels. Check TalkBack/VoiceOver names, selected states, focus inside sheets, focus return and success announcements. Preserve full member identifiers accessibly even when visual rows truncate.
- **Motion:** scanner pulse, shimmer and press animation do not consult reduced-motion preferences. Provide a static alternative. Haptics should complement a visible state, never be the only result.
- **Keyboard:** custom manual-search and decline modals do not use the shared keyboard-avoiding Sheet. Test long reasons, small screens, iOS keyboard and Android resize behaviour. Keep confirmation/cancel reachable without losing entered text.
- **Security UX:** make lock behaviour truthful; prevent background previews of member details. A support report should contain build/platform/error reference, not passwords, tokens, full member lists or raw scanned codes.

These are design and engineering acceptance targets, not a completed accessibility compliance certification.

## Figma brief for the next step

Start with one coherent direction: **navy, quiet brass, compact operational layouts**, with a small optional light/day-mode comparison for bright desks. A light theme is a proposal to approve, not an existing feature or a silent change to the owner's dark-native choice.

Create a component page for colour/text/spacing, navigation, rows, buttons, status badges, fields, sheets and feedback states. Then design these connected flows, first at a compact phone size and a modern iPhone/Android size:

1. Today → Scan → allowed/denied/expired result → Scan next.
2. Members → search/no match → member → points/purchase → confirmation/result.
3. Requests → search/filter → request detail → approve/decline/give → completed item.
4. Member → Cards → disable lost card → link replacement.
5. Member → Activity → manager reversal preview; membership renewal preview.
6. More → permission-aware workspace/security/preferences; sign-in/locked/expired-session states.

Show loading, empty, failed, offline/stale, permission-denied, already-completed and uncertain-operation states alongside the normal screens. Include long Russian/German text and 200% text-scale examples; 200% is a prototype stress case, not a claim that it covers every OS accessibility size. Add one tablet list/detail frame after the phone flows work.

Prototype goals to verify with staff (targets, not current measured performance):

- Staff can identify a member and the primary permitted action without scrolling on a normal phone at default text size.
- A scan result always makes its venue/place/event context and outcome clear; Scan next is reachable without hunting.
- A request anywhere in a 60-item fixture can be found by name/number/code, opened from an alert and acted on correctly.
- Staff can distinguish “approved” from “given”, and a failed read from an empty queue.
- No truncated identifier is the only basis for a handover; no numerical entry is silently changed in meaning.
- Touch targets, contrast, large text, keyboard focus and five-language layouts survive the same flows.

After design approval, implement in this order: (1) correctness/session/recovery fixes; (2) request inbox and compact screen system; (3) lost-card/member desk features; (4) optional tablet/day mode and collaborative queue features. Each release preserves server writers and installed-app API compatibility.

## Native walkthrough observations

The isolated review organisation was used throughout. Authentication and the member/queue reads succeeded. Points stayed at **210**; all opened transaction/decline forms were cancelled. No reward was handed over and no benefit request was changed.

| Capture | Observation |
|---|---|
| [Home](review-20261103/01-home.png) | Scan, find member, requests, 30-day metrics and activity load. The first screen repeats navigation in large panels. |
| [Requests](review-20261103/02-requests.png) | **Two pending rewards and one pending benefit are visible, but Waiting and the tab badge show 1.** Both reward codes truncate after the name; there is no request detail action to reveal them. |
| [Decline draft](review-20261103/03-decline-form.png) | Correctly warns that the member sees the reason. Preserve this useful guidance; the draft was cancelled. |
| [Members](review-20261103/04-members.png) | Member and tier filters load. Minor copy issue: “1 members”. |
| [Member](review-20261103/05-member.png) | Balance, tier progress, actions, benefit and card state load. History starts below the first viewport. |
| [Points validation](review-20261103/06-points-validation.png) | `1.5` is interpreted as 15 points in the action label. No amount was submitted. The ordinary form also offers an enabled “Give 0 points” before validation; inline validation and a meaningful action state would be clearer. |
| [Check-in](review-20261103/07-check-in.png) | Form uses the internal phrase “Ways to earn decide what it gives” and places purchase amount inside Check in. No visit recorded. |
| [More](review-20261103/08-more.png), [Preferences](review-20261103/09-preferences.png) | Workspace links precede preferences. Version is shown without build. Alerts are unavailable on this emulator as intended by the device check; physical delivery was not tested. |
| [Scan](review-20261103/10-scan.png), [Manual lookup](review-20261103/11-manual-lookup.png) | The scanner exposes camera permission and the unavailable-NFC fallback. Manual name lookup finds the demo member without camera access. Camera permission remained ungranted; hardware scanning was not exercised. |

Emulator captures show a coloured cursor halo and visible gradient bands. Do not treat the halo as app UI or assume those bands reproduce on physical devices; compare colour rendering on an actual iPhone and Android before approving gradient treatments. No full iOS/hardware acceptance or large-queue load test is claimed.
