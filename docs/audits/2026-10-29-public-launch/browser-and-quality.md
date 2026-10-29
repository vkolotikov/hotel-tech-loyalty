# Browser and quality verification

29 October 2026. Local Vite at `127.0.0.1:5173`, installed Chrome through Playwright, real application modules and intercepted deterministic API fixtures. Fictional members and credentials only. No live customer mutation, booking, campaign, payment or message. The existing Vite process was left running.

## Completed interaction suites

The selected final runs contain **718 passing named checks**, with no unexpected page errors in those runs. Counts include responsive/visual-state assertions as well as button interactions; they are not a count of unique buttons or full provider journeys. Full names and per-run errors are in `verification.json`.

| Area | Checks |
|---|---:|
| Members/program | 50 |
| Ways to earn — interactions/states | 42 + 24 |
| Rewards/benefits — interactions/states | 21 + 49 |
| Events — interactions/states | 26 + 57 |
| Requests — interactions/desktop states | 30 + 39 |
| Insights | 59 |
| Card & app | 79 |
| Campaigns | 39 |
| Scan — states/decoder integration | 34 + 17 |
| Dedicated mobile web — Home/Members/Requests | 73 |
| Settings/guided setup | 79 |
| **Total** | **718** |

Covered controls include navigation/deep links, member search/filter/pagination, profile actions, points forms, benefit review, programme configuration, reward edits, stock validation, event draft/publish/cancel/check-in, request approval/fulfilment, report filters/export/chart/table, campaign audience/editor/scheduling, appearance drafts, settings permission/retry states, scanner review, responsive layouts and supported translations. Routes and failure/empty/read-only states were exercised against fixtures.

Screenshots were generated at desktop and narrow widths, including 320/390/768/1024/1280/1440 where supported by the scripts. Root visually inspected current mobile Home and approval review and the desktop Insights render; the prior mobile handoff retains the Figma comparison evidence. This audit did not perform a fresh exhaustive Figma comparison of every screen, nor manually click every legacy-admin control.

## Initial harness failures and their resolution

No product code or repository test was modified to make these pass. Adjustments were confined to private audit harnesses.

- The older Overview script reported 13/20 passing. Several expectations predate the dedicated mobile layout, the redesigned Requests selector, or the shared Overview shell. Those assertions are now stale. Desktop focus assertions also ran before the dialog unmounted. A fresh actual-browser check waited for dismissal and verified all five openers regained focus: Program details, Preview, Issues, Definitions and Requests. The activity filter also cleared and recovered successfully. These were not counted as confirmed product defects.
- The first combined runner incorrectly reused fixtures already mutated by the interactions phase for Events/Requests state tests. Separate fresh fixtures resolved the missing Cancel sign-up and restricted-redemption discrepancies. Events then passed 57 state checks.
- The old Requests responsive script waits for `.l-rq-page` below 768px, where the current design intentionally mounts its dedicated mobile view. Its private desktop-state rerun covered 1440/1280/1024/768 and passed 39 checks. Dedicated mobile tests separately covered phone views and review sheets. This is not a claim that the unchanged old script is green.
- The Members filter script advanced after a URL/response change before the restored list had rendered. A final rerun waited for the ten-row cleared list and then the two-row level result; all 50 checks passed. A separate fresh test verified clearing search and choosing Gold with both immediate and delayed interaction. The early timing-sensitive run is retained in private artifacts; no persistent member-filter defect was established.

Recommendation: refresh these legacy browser scripts, isolate each scenario's fixture state, wait for user-visible completion, and run the maintained scripts in a repeatable release gate. A historical screenshot/check count is not an adequate regression gate by itself.

## A05 — cross-tab identity/session defect

Sources: `frontend/src/stores/authStore.ts:108–149`; `frontend/src/lib/api.ts:34–35`.

`setAuth` and `logout` correctly clear the current tab's React Query cache, but no auth storage-event/BroadcastChannel synchronization was found. Requests read the latest shared `localStorage.auth_token`, while React components read the tab's existing Zustand identity and cached data.

Private probe `E:/Hexa-Tech-audit-20261029/cross-tab.cjs` opens two same-origin tabs using actual app modules and synthetic fixture identities. Tab A shows a member profile. Tab B invokes the actual store's logout and then signs in as another fixture account.

Observed evidence in `cross-tab.json`:

```json
{
  "afterLogout": {
    "storageSignedOut": true,
    "inMemoryStillSignedIn": true,
    "memberStillVisible": true,
    "url": "/loyalty/members/1"
  },
  "afterAccountChange": {
    "storeUser": 1,
    "persistedUser": 999,
    "memberStillVisible": true
  }
}
```

This matters on shared front-desk computers: old member data remains visible after logout, and an old screen can issue a request using the next account's token. Server tenant scoping may reject an old member ID; the probe does not demonstrate a server authorization bypass. Fix by synchronizing session version/identity changes, cancelling pending queries, clearing sensitive caches/local component drafts and redirecting/rebinding every tab. Test logout, expiry and account switching with open profiles and mutation dialogs.

## Other actual browser findings

`additional-ui.md` records the real industry-banner hook exception and the chat loading lifecycle invariant warning. They were reproduced using actual components with intercepted APIs. The warning did not prevent the chat transcript from rendering in the test; it must not be described as a confirmed fatal chat outage. WalletConfig's custom-hook naming lint issue was not a demonstrated runtime failure.

## Static checks, build and dependencies

- TypeScript passed. Complete Vitest: 394 files / 5,730 tests passed.
- Whole-app ESLint: 1,270 errors and 38 warnings across 148 files. Largest rule category: 1,140 `no-explicit-any` reports. Six hook-rule reports were investigated; the result is more specific than treating every lint message as a crash.
- Vite production bundle passed in `E:/Hexa-Tech-audit-20261029/production-build/`. Its visualizer still wrote the tracked `frontend/dist/stats.html`; that audit-generated side effect was restored immediately. No source or distributed artifact remains changed.
- npm production audit: five affected packages, four high and one moderate. Composer production audit: twelve affected packages, 42 advisory records including duplicate records; this is not 42 distinct confirmed application vulnerabilities. Exact package names/versions are in `verification.json`; full audit outputs remain private.
- Main and Loyalty chunks produced a size warning. A performance recommendation follows from size and import structure; actual device latency/throughput was not measured.

## Evidence locations

Private `E:/Hexa-Tech-audit-20261029/`: `browser-audit.cjs`, `browser-followup.cjs`, `overview-followup.cjs`, `members-filter.cjs`, `mobile-browser.cjs`, `settings-browser.cjs`, `cross-tab.cjs`, `browser/`, frontend/build/lint logs and dependency JSON. Additional component harness and screenshots are under `booking/hooks-*`.

All these browser results are frontend interaction/contract evidence with local fixtures. Backend/controller suites are separate evidence. Neither category independently establishes live provider delivery, PostgreSQL locking, production configuration or real device compatibility.
