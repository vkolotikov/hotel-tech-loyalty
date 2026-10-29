# Additional bounded audit — 2026-10-29

Published appendix to the [consolidated launch audit](../2026-10-29-public-launch-audit.md). Original logs, harnesses and screenshots are in `E:/Hexa-Tech-audit-20261029/booking/`; references below to adjacent files refer to that private directory.

No product edits or real API requests. This adds ten business-feature test scopes and investigates three ESLint hooks findings.

## A1 — Confirmed UI crash: dismissing the industry-mismatch banner

- **References:** `frontend/src/components/IndustryMismatchBanner.tsx:126` returns early when hidden/dismissed; the later `useEffect` at line 175 runs only while visible. The dismiss handler at lines 203–205 changes that render path.
- **Reproduction:** private Playwright browser mounts the actual Vite-served component, actual React 19/router/auth store and a hotel user; the hostname detector is mocked to report the beauty host. Banner renders normally. Clicking **Dismiss for this session** throws `Rendered fewer hooks than expected. This may be caused by an accidental early return statement.` The isolated mounted root becomes empty. No API request is made.
- **Impact/severity:** P2 confirmed functional crash in the supported cross-industry-domain flow. In the app, a surrounding error boundary may display its fallback instead of an empty root; this probe does not claim every user/app route crashes. Navigating into/out of the industry settings tab also changes the same conditional branch and needs regression coverage.
- **Recommendation:** keep every hook unconditional and before render guards, with visibility checks inside effect bodies. Test show→dismiss, auth hydration, mismatch changes, and entering/leaving Settings → Industry.
- **Confidence:** high, actual React browser exception reproduced.

## A2 — Confirmed React lifecycle invariant warning in Engagement chat drawer

- **References:** `frontend/src/components/EngagementDrawer.tsx:458` returns Loading when `conv` is absent, before `useState` calls at 463–465 and `useEffect` at 470.
- **Reproduction:** mount actual EngagementDrawer with a conversation ID; intercepted fixture APIs delay the conversation response, exercising undefined→loaded data. React logs `Internal React error: Expected static flag was missing. Please notify the React team.` Switching to a second uncached conversation also exercises loaded→loading→loaded.
- **Observed result:** the transcript still renders, including after switching. There is **no uncaught page exception or confirmed blank UI** in this probe. Treat this as a real invariant violation and regression risk, not a demonstrated fatal chat crash.
- **Recommendation:** move hooks before the loading return with guarded effect reads, or split the loaded conversation into a separate component whose hooks always run. Test delayed first load, conversation switching, query reset/error, translation controls and drawer close/reopen.
- **Confidence:** high for logged lifecycle violation; fatal impact not established.

## A3 — WalletConfig lint finding does not establish a runtime hook-order defect

`frontend/src/pages/WalletConfig.tsx:80` defines `uploadMutation` which calls `useMutation`. It is called unconditionally, in a fixed order, three times at lines 93–95. The current helper name is not recognized as a custom hook, explaining the lint violation. No conditional-order break was identified and no real upload was performed. Rename/extract as a proper custom hook for maintainability/static enforcement; do not report it as a reproduced page failure.

## A4 — P2: Engagement's Open CRM card link uses a nonexistent route

`frontend/src/components/EngagementDrawer.tsx:437` renders `href={`/guest/${v.guest.id}`}` for a linked CRM guest. The registered detail route is plural, `/guests/:id`, at `frontend/src/App.tsx:375`; there is no matching singular route or singular-to-plural redirect in App.tsx or routes/web.php. The SPA wildcard at App.tsx:432 redirects to `/`.

**Scenario/impact:** in Engagement → visitor Profile, a guest-linked visitor shows **Open CRM card**; selecting it navigates to `/guest/123` and ultimately the default page rather than guest 123's card. This breaks the intended engagement-to-CRM handoff. **Confidence:** high, source-confirmed routing mismatch; a click against production was not performed. **Recommendation:** use the registered plural path, preferably a shared route builder/SPA Link, and add a browser navigation check asserting the linked guest ID reaches GuestDetail.

## Browser evidence and boundaries

`hooks-repro.cjs`, `hooks-results.json`, `hooks-industry.png`, `hooks-engagement.png` are in this directory. The harness uses Vite on 127.0.0.1:5173, real application component modules and providers, in an independent browser. It intercepts every API request with fixtures, blocks nonlocal requests, and mocks only the industry's hostname detection. It does not submit changes to the real app.

Local Vite hot-reload WebSocket/local-network warnings are included in console output; these are harness/development transport noise and are not counted as application findings. Initial harness attempts had a missing CJS default export/router-provider module-version mismatch; those harness errors were corrected. Only the final successful probe's lifecycle findings are attributed to the app.

## Additional backend verification

Every directory ran separately and sequentially using PHP 8.4.20, Xdebug off, explicit OpenSSL config and array mail/synchronous queue environment. No bare `artisan test` and no live provider exercise.

| Feature test directory | Passed | Assertions |
| --- | ---: | ---: |
| Engagement | 113 | 214 |
| Crm | 268 | 771 |
| CrmTasks | 18 | 157 |
| Analytics | 7 | 16 |
| Planner | 56 | 256 |
| Reviews | 10 | 39 |
| Notifications | 73 | 182 |
| LeadForm | 33 | 103 |
| Widget | 75 | 403 |
| Chatbot | 48 | 99 |
| **Total** | **701** | **2240** |

All exited 0; no skips/failures. Logs are `additional-<scope>.log` with `additional-results.json`. This adds executable regression coverage of these features, not a new exhaustive line-by-line review or production integration validation.
