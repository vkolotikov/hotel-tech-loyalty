# Browser release checks

Operational status: `node e2e/operations.mjs`. Uses the local server at `E2E_BASE_URL` (default port 5173),
intercepts API reads, blocks external requests and mutations, and checks five languages, narrow layouts,
refresh, error recovery and destinations. Use port 5175 with the preview server to check a built artifact.

Use Node 22.12+ within the 22 release line, Node 24, or Node 26+ and `npm ci` (the release was tested with Node 24.15.0). Vitest 5 does not support Node 23 or 25. Install Chrome (the default) or run `npx playwright install chromium` and set `E2E_CHANNEL=chromium`.

Start `npm run dev`, then `npm run test:browser` from `frontend`. The runner installs deterministic API fixtures, blocks external requests and refuses non-local base URLs. It does not exercise real provider delivery or production customer data.

For a production artifact, build with Vite, start `npm run preview:fixture` (port 5175), then set `E2E_BASE=http://127.0.0.1:5175` for the browser command. `E2E_BUILD_DIR` selects a build directory other than `dist`. This host serves SPA routes at `/` and assets at `/spa/`, as Laravel does.

`E2E_GROUPS` selects comma-separated groups: overview, members, earn, rewards, events, requests, insights, card, campaigns, scan, settings, mobile. Every interaction/state script gets a new browser context and fixture. Failures return a nonzero exit status; reports and screenshots go to `test-results/browser` or `E2E_OUTPUT`.

Screenshots use the actual viewport. Full-page capture on the installed Chrome/Playwright combination transiently resizes the viewport to 1×1, switching responsive components and dismissing dialogs. Viewport capture avoids changing the state being tested. The dedicated mobile suite covers Home, More, members and requests at their current breakpoints; older desktop workflows are tested at desktop widths.

`E2E_EXECUTABLE` points the runner at a Chromium binary of another Playwright build (a container's preinstalled browser, e.g. `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`); it takes precedence over `E2E_CHANNEL`.

## Visual comparison (before and after a change that must not alter the design)

1. On the current `main` build: `E2E_OUTPUT=test-results/before npm run test:browser` (with the preview server as above).
2. Apply the change (for example a Tailwind or icon-library upgrade), rebuild, restart the preview, and run again with
   `E2E_OUTPUT=test-results/after`.
3. `node e2e/visual-compare.mjs test-results/before test-results/after test-results/visual-compare`

It matches every screenshot by its path and counts a pixel as changed when a channel differs by more than
`VISUAL_TOLERANCE` (default 8 of 255). A screenshot fails when more than `VISUAL_MAX_RATIO` of its pixels changed
(default 0.001), when its size changed, or when it exists on one side only. Each failing screenshot gets a `.diff.png`
(changed pixels in red) and the summary goes to `report.json`; the exit status is 1 when anything differs. Two runs of
the same build compare as identical apart from a check that failed in only one run (its `failure.png`), so read the
runner's own output first.

Browser fixture checks complement backend tests, PostgreSQL concurrency tests and provider/device acceptance. They do not replace those checks.
