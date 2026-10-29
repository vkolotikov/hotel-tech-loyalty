# Browser release checks

Use Node 22.12+ within the 22 release line, Node 24, or Node 26+ and `npm ci` (the release was tested with Node 24.15.0). Vitest 5 does not support Node 23 or 25. Install Chrome (the default) or run `npx playwright install chromium` and set `E2E_CHANNEL=chromium`.

Start `npm run dev`, then `npm run test:browser` from `frontend`. The runner installs deterministic API fixtures, blocks external requests and refuses non-local base URLs. It does not exercise real provider delivery or production customer data.

For a production artifact, build with Vite, start `npm run preview:fixture` (port 5175), then set `E2E_BASE=http://127.0.0.1:5175` for the browser command. `E2E_BUILD_DIR` selects a build directory other than `dist`. This host serves SPA routes at `/` and assets at `/spa/`, as Laravel does.

`E2E_GROUPS` selects comma-separated groups: overview, members, earn, rewards, events, requests, insights, card, campaigns, scan, settings, mobile. Every interaction/state script gets a new browser context and fixture. Failures return a nonzero exit status; reports and screenshots go to `test-results/browser` or `E2E_OUTPUT`.

Screenshots use the actual viewport. Full-page capture on the installed Chrome/Playwright combination transiently resizes the viewport to 1×1, switching responsive components and dismissing dialogs. Viewport capture avoids changing the state being tested. The dedicated mobile suite covers Home, More, members and requests at their current breakpoints; older desktop workflows are tested at desktop widths.

Browser fixture checks complement backend tests, PostgreSQL concurrency tests and provider/device acceptance. They do not replace those checks.
