# Staff product/design audit — 3 November 2026

Owner requested a deep review of the loyalty system and mobile app, starting with Staff, with a clean, modern,
luxury direction and concise copy. Figma ideas/confirmation are the **next step**. This task did not authorize
implementing or shipping a redesign. The existing release work remains as recorded in
`2026-11-03-native-apps-release.md`; no store or production changes were made for this audit.

## Deliverable and branch

- `docs/loyalty-staff-app/03-PRODUCT-REVIEW-20261103.md`: evidence, prioritised functional findings, existing
  backend/native coverage, proposed additions, screen-by-screen design direction, accessibility and Figma brief.
- `docs/loyalty-staff-app/review-20261103/`: captures from the published Android build with isolated demo data.
- Worktree `C:\wamp64\www\hexatech-apps`, new branch `feature/staff-product-review-20261103`, based on native
  release checkpoint `303f89c85`. The release branch remains at its prior commit. The independent staff release
  worktree/history was not changed; no merging of native branches and no push to main.
- Relevant backend code was compared against fetched `origin/main` `d9117b475`. No PHP/source changes.

## Evidence and highest priorities

- Installed Staff **1.0.0 (3)** through Google Play in the existing Pixel 8 / API 35 emulator; package
  `uk.hexatech.loyalty.staff`, installer `com.android.vending` verified. Signed in with the already-authorised
  isolated review staff account. No credentials printed, copied to clipboard, committed or captured in images.
- Home, Members, Requests, More, Scan/manual lookup and member/forms inspected. Native request UI shows two
  pending rewards plus one pending benefit while the badge/Waiting count is 1. Full reward codes truncate and
  have no detail view. Forms opened only for inspection and cancelled. Demo member remains at 210 points.
- Existing Staff unit/store tests: **22 passed in 2 files**; TypeScript passed. No full frontend/PHP suite needed
  for documentation-only changes. Passing checks do not cover the findings.
- `pointsFrom()` directly reproduced `1.5 -> 15`, `1,5 -> 15`, `-10 -> 10`. Native draft reproduced 1.5 with
  “Give 15 points”; no write submitted.
- Source-confirmed queue pagination stops at 25 per type, reward read errors are not surfaced, badge omits
  reward/approved work, check-in/handover controls miss capability gating, progress always says points,
  check-in conflates purchases and visits, and partial reads lack proper error states.
- Session/recovery safeguards need a focused engineering pass: cold-start lock path absent, cache cleanup only
  in manual More sign-out, scan state not reset, late responses not generation-guarded, uncertain transaction
  attempt keys only in component memory and cleared on non-network failures. These are source findings, not
  claims of observed cross-account disclosure, biometric exploit or duplicate production transactions.

## Design recommendation

Preserve the five destinations and gold/navy identity. Simplify surfaces, gradients, glow and coloured action
tiles; compact Today/member/request layouts; reserve serif for identity/title and Inter for tasks. Prioritise
request detail/search/history, safe handover, lost-card replacement, basic member enrolment/editing, and
permission-controlled reversal/renewal. Stamps/credit screens use existing server features when enabled.
Keep campaigns, setup, imports/merge, advanced reports and credential setup in the web workspace initially.

Next Figma pass should start with Today, scan result, member detail and Requests, then connected transaction,
card replacement and error/empty/offline/permission states. The full review includes flow and acceptance details.
No Figma file has been created in this audit. The member app/full admin visual audit remains a later scope.

## Testing limits and computer continuity

No physical iOS/NFC/camera/push/biometric verification or screen-reader/large-font certification performed.
Emulator camera permission was left ungranted; manual lookup is available. Its notification-unavailable state
is expected. Screenshots have a cursor halo and gradient bands; do not diagnose physical-device colour rendering
from those alone.

CUA native emulator window `1051292` still works; AX shows only emulator controls and can lag/fail geometry.
Use fresh screenshots and matching region IDs. Do not use emulator paste/typeText: the prior clipboard issue
remains a tool limitation. Direct key events work; use on-screen @ for emails. Private demo credentials and their
authorization are described in the release handoff and remain outside git. Do not inspect the owner password
Notepad window. No need to rotate keys/passwords or repeat prior approvals.
