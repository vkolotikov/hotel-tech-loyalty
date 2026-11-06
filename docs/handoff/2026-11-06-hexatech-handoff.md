# HexaTech handoff — 6 November 2026

Read CLAUDE.md and `2026-11-02-hexatech-handoff.md` for the current application, native apps, environment and outstanding operational work. This session changes the Loyalty workspace Insights filters only.

## Insights filters

Owner: improve `https://loyalty.hotel-tech.ai/loyalty/insights`: controls should act as dropdowns, be easier to use, hideable, and offer more filters.

Feature branch: `feature/insights-filters-current-20261106`, started from current production source `2cc80c492dbc37f482349039d8547fc559633ba4`. The originally open October branch was stale and was not used as a deployment baseline.

- Replaced four dialog-opening imitation dropdowns with native selects and inline custom date fields. Completed-day presets: 7, 28, 90 and 365 days, last calendar month, custom dates.
- Added current member status, email marketing consent and no membership level. Server options are returned by the existing report endpoint. `InsightsAudience` supplies one member population for every metric and both direct and guest-linked booking revenue; legacy money endpoints retain their defaults.
- Apply stages edits; Discard changes leaves the report unchanged; Reset restores the default 28 completed venue days. URL filters support reload and browser Back. The collapsible panel remembers visibility locally and always shows applied scope.
- Every new sentence is translated in all five Insight bundles. No migration, new endpoint, dependency or member write.

Verification and deployment results are recorded below when finished. Signed-in live UI inspection is unavailable: browser access host was unavailable, DevTools profile was already running, and native Computer Use stopped because it could not reliably identify the browser URL. Local fixture browser checks are independent of the signed-in user browser; API reads are intercepted and external traffic blocked.

Preserve the user's untracked PDF, video, image, ZIP and Alexa assets. The session's local Vite preview uses port 5810. Existing unrelated processes and port 55439 are not ours.
