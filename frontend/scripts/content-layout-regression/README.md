# Content delayed layout regression

Run from the repository root:

```powershell
node frontend/scripts/content-layout-regression/run.mjs
```

This uses an owned headless Chromium and temporary Vite host on `127.0.0.1:5197`, closed on completion. It loads the
actual Content provider, shell, editor provider, Plan, complete app stylesheet and self-hosted fonts. Only the wire API
is replaced. External network requests are blocked; no customer account, database, provider or messages are used.
The existing `content-draft-regression` runner and its original checks remain separate and unchanged.

The frozen clock is 16 November 2026 at 09:00 UTC. Bootstrap has a manager, completed setup, the full rail, an unnamed
UTC planning zone and all eight available platform types. The delayed plan has no posts and the sanitized live 14-slot
distribution: Monday LinkedIn/Instagram/TikTok/Facebook/YouTube; Wednesday LinkedIn/Instagram/Facebook; Friday the
same five as Monday; Sunday Instagram. Brand has five active channels with 09:00 usual times; goals have three per
platform, none published/planned and no streak. Pulse has no weather or place. These names and goal/time values are
local fixture assumptions, not customer data. Actual request paths and all geometry are recorded.

The host holds bootstrap separately, then holds plan/brand/goals/pulse until fonts have loaded and the initial Plan
has painted. An observer installed before releasing those four reads records every shift with its source rectangles.
The runner checks unchanged header/filter/calendar control positions, viewport-bounded rail/footer, Settings menu
hit testing outside the rail, all 14 slots and no document overflow/errors. All five locales run in both themes
at 390/1024/1440 x 900, DPR 1. Platform chips are reached with native Tab, horizontal wheel and phone touch swipes;
English 1024 also checks a 600px-tall scrolling navigation rail, collapsed rail menus and native title labels when the
slim navigation scrolls. Overflow measurement restores the existing CSS tips whenever the slim navigation fits.

Receipts and screenshots default to ignored `artifacts/`. Set `CONTENT_LAYOUT_EVIDENCE` to retain them elsewhere.
`CONTENT_LAYOUT_QUICK=1` runs only English/Dark/1024; `CONTENT_LAYOUT_LOCALE=fr` or `CONTENT_LAYOUT_WIDTH=390`
changes the locale or width for that quick run.
`?density=even` in the host instead uses two rotating platforms per day for exploratory comparison.

This is deterministic loading/layout evidence, not a production backend, paid-provider or live release check. The
release executor still measures the actual authenticated build after deployment.
