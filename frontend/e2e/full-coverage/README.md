# Full-coverage screenshots (two SPA builds, one real backend)

Every route of the SPA (`routes.mjs`: the full admin with its hub and settings tabs, the appointments, content and
loyalty workspaces, the member portal, the signed-out pages), at 1440×900 and 390×844, in every admin style (Glass,
Classic, Clean light), each workspace in its light and dark theme and the portal in the device's light and dark mode,
against a local Laravel on a seeded PostgreSQL database. Built for the Tailwind 3 → 4 move: shoot the old build twice
to learn the noise floor, then the new one, and compare with `../visual-compare.mjs`. It works for any change that must
not alter the design. Local demo data only; nothing here holds a credential.

## 1. The database (once)

The repository's own `.env` (git-ignored) points Laravel at a local PostgreSQL database whose name contains `demo`,
with `APP_ENV=local`, and keeps the app away from every outside service: `SAAS_API_URL=`, `SAAS_PLATFORM_URL=`,
`SAAS_JWT_SECRET=` and `PLATFORM_ADMIN_EMAILS=` empty (the defaults point at the production SaaS), `MAIL_MAILER=log`,
`QUEUE_CONNECTION=sync`, `CACHE_DRIVER=array`, `MEDIA_DISK=public`, no AI keys. The array cache matters: the API's rate
limits count in the default cache, and a run makes far more than the 240 requests a minute per user that the admin
API allows, so with a lasting cache screens fail with 429 at random (`shoot.mjs` reports such a screen as an error).
Then:

    FC_SERVER_NOW=<a fixed instant> frontend/e2e/full-coverage/reset-db.sh build
                                                     # every migration, seed-demo.php, a template copy <db>_tpl

`seed-demo.php` turns the organisation the migrations create into "Grand Hotel" on an active Enterprise plan (no screen
behind a plan gate), runs the setup wizard's own service with sample data, `database/seeders/DatabaseSeeder` (its users
get the organisation afterwards: a staff user without one cannot sign in), and adds a few rows the seeders leave empty
(rooms and stays, inquiries, services with appointments, a chat, a loyalty event, a draft campaign, content posts).

## 2. Before every run

    frontend/e2e/full-coverage/reset-db.sh reset     # a fresh copy of the template, application cache cleared

A run signs in and changes the admin style, so each run starts from the same copy.

## 3. Serve

    FC_SERVER_NOW=<a fixed instant> frontend/e2e/full-coverage/api.sh 8090

starts what `php artisan serve` runs (PHP's built-in server and Laravel's router, from `public/`, eight workers), but
directly, so the environment reaches it: `fixed-now.php` is prepended to every request and freezes Laravel's clock at
`FC_SERVER_NOW` (use the instant `FC_CLOCK` names below, on the day the template was seeded). Without it, everything
the server works out from the time (an "updated 10:48" line, "next 24 h", appointments due so far, the audit log)
changes between runs. The database and the rest come from `.env`, as for `artisan serve`.
Each build (`npx vite build --outDir <dir> --emptyOutDir`, not `npm run build`, whose postbuild writes into
`public/spa`; its bundle visualizer still rewrites the committed `frontend/dist/stats.html`, so run
`git checkout frontend/dist/stats.html` after it) is served by

    node e2e/full-coverage/serve.mjs <build dir> 5180

which answers `/spa/*` from the build, every other route with its `index.html`, and passes `/api/*`, `/storage/*` and
Laravel's public files to port 8090. Serve on 127.0.0.1, not localhost: the SPA then calls `/api` on its own origin.
Serve each build on the same port, one after the other: several screens print their own address (the booking
widget's embed code, webhook and review links), so two ports differ on every one of them.

## 4. Shoot

    FC_BASE=http://127.0.0.1:5180 FC_OUT=test-results/fc-before \
    FC_STAFF_EMAIL=<the demo super admin> FC_STAFF_PASSWORD=<its password> \
    FC_MEMBER_EMAIL=<a demo member> FC_MEMBER_PASSWORD=<its password> \
    FC_CLOCK=<a fixed instant, e.g. the seeding day at 12:00Z> \
    E2E_EXECUTABLE=<a Chromium binary, optional> node e2e/full-coverage/shoot.mjs

The users and their password are `database/seeders/DemoDataSeeder.php`'s (its super admin and its Diamond member).
`shoot.mjs` signs in through `POST /api/v1/auth/login`, stores the session as the SPA does (`loyalty-auth` with
`version: 1`, and `auth_token`), sets each admin style through `PUT /api/v1/admin/settings` as Settings → Branding does,
and resets it to Glass at the end. It looks up the ids the detail routes need through the admin API and lists in
`run.json` every route it skipped and why. Options are in the header of `shoot.mjs` (`FC_ONLY`, `FC_GROUPS`,
`FC_STYLES`, `FC_WIDTHS`, `FC_PAGES`, `FC_PARALLEL`, `FC_BROWSER`).

Determinism: the same database copy, a fixed `Date` (`FC_CLOCK`), animations disabled, network quiet, fonts loaded, no
spinner, the page and its main scroller at the top, and a screenshot kept only when the next one repeats it exactly
(a frame still being painted under load is not). Hashed assets are cached as in production, so every screen after the
first renders with its fonts from the start. Requests to other hosts never leave the machine (a frame another host
would fill gets an empty page). A screen that scrolls is captured again after each scroll by 90 % of the viewport (at
most `FC_PAGES`), never by resizing the viewport.

## 5. Compare

    node e2e/visual-compare.mjs test-results/fc-before test-results/fc-before-2 test-results/fc-noise   # noise floor
    node e2e/visual-compare.mjs test-results/fc-before test-results/fc-after test-results/fc-compare

Read every difference from the noise run first: a screen that differs between two runs of the same build (relative
times written by the server, a chart's own animation) differs for the same reason between the builds.

## 6. WebKit (the engine family Safari uses)

Playwright's own WebKit download is refused in the cloud container, but Ubuntu's archive has WebKitGTK and its
WebDriver: `apt-get install webkit2gtk-driver xvfb` (MiniBrowser comes with it, in
`/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/`). `shoot-webkit.mjs` shoots the same screens a Chromium run of
`shoot.mjs` took (its `run.json`), against the same backend:

    frontend/e2e/full-coverage/webkit-build.sh <build dir> <copy dir>      # once per build
    frontend/e2e/full-coverage/reset-db.sh reset
    Xvfb :77 -screen 0 2400x1600x24 -nolisten tcp &
    node e2e/full-coverage/serve.mjs <copy dir> 5180 &
    DISPLAY=:77 WK_BASE=http://127.0.0.1:5180 WK_OUT=test-results/wk-before WK_LIST=test-results/fc-before/run.json \
      FC_STAFF_EMAIL=… FC_STAFF_PASSWORD=… FC_MEMBER_EMAIL=… FC_MEMBER_PASSWORD=… node e2e/full-coverage/shoot-webkit.mjs

Compare two WebKit runs with `visual-compare.mjs` as above, never a WebKit run with a Chromium one. The phone width
is a 390-wide frame (MiniBrowser's window cannot be that narrow), cut out of the window's capture with Python 3 and
Pillow. A run of 748 screens takes about 17 minutes with four browsers. Seen in practice:

- A redirect that lands after the page settles (`/guests/:id` to the member's CRM tab) or a loading state can be
  caught either way. Check the final URL in `run.json` and shoot the screen again before reading anything into it.
- A one-off black square behind a filtered image (the register page's logo) is a drawing glitch. It does not repeat.

The Tailwind 4 release (1 Nov 2026) found one WebKit-only difference this way that Chromium did not show: date and
time fields lost their tabular figures (`index.css`, v3's form-control font longhands).
