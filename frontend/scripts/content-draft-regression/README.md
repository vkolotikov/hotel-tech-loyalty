# Content draft browser regressions

Run from the repository root with `node frontend/scripts/content-draft-regression/run.mjs`.
Uses the existing Vite/Playwright packages, a headless isolated Chromium page, real React components,
and a deterministic delayed in-memory API. Every external host is blocked. No provider/backend requests occur.
The fixture listens on local port 5187 and closes its browser/server in `finally`.

Assertions cover submitted-snapshot Create/Save, an intentional undo while saving, brand and editor ownership,
retained Brand forms, brand-safe placeholders, workspace leave/reopen during Create, duplicate/delete races,
phone/overlay focus with nested dialogs and responsive resizing, and all five document languages.
Screenshots cover both themes at 390 and 1440; this host is behavioral evidence, not the complete application frame.

Generated receipts/screenshots go into ignored `artifacts/`. Set `CONTENT_DRAFT_EVIDENCE` to use another folder.
For baseline comparison, `CONTENT_DRAFT_SOURCE` may name another frontend checkout and
`CONTENT_DRAFT_BASELINE=1` limits execution to the seven original desired assertions (failures still exit nonzero).
The baseline must contain the actual production components; the test never substitutes broken assertions.

Review lifecycle cases can run alone with `CONTENT_DRAFT_REVIEW_ONLY=1`. They reproduce a discarded delayed Create
across a workspace remount and an unchanged pending Create retained across a workspace remount. Both also run in
the default suite. `CONTENT_DRAFT_EVIDENCE` selects the ignored/external receipt directory.

The complete launch suite enables `CONTENT_FIX_CHECKS=1`, `CONTENT_LAUNCH_CHECKS=1`,
`CONTENT_COLLABORATION_CHECKS=1`, `CONTENT_CAMPAIGN_CHECKS=1` and `CONTENT_FINAL_CHECKS=1` before the same command.
It preserves the earlier 84 cases and adds 26 final-review checks (110 total): same-opening Duplicate typing,
clean/full-route navigation, viewed revisions and actionable stale-action refusals, clean account-clock refresh
across brands, dirty clock retention, and focus. Final cases use production menu/actions/settings components.
