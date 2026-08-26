# SPA shell leak on sites.hexa-tech.uk — status

Commit: `d70469df4` on `main` (local only; `origin/main` still `c577e7767`).

## 1. Verdict

**SAFE-TO-DEPLOY** — the admin shell leak is closed and build-durable. Three
lower-severity items remain open; none of them reopens this hole.

## 2. What changed, file by file

- **`public/spa/index.html` → `resources/spa-shell/index.html`** (`git mv`,
  byte-identical). The shell is no longer inside the docroot, so no web server
  can hand it out before PHP boots. This is the actual fix; everything else
  protects it.
- **`routes/web.php`** — the `/` route (line 598) and the `/{any}` catch-all
  (line 636) now read `resource_path('spa-shell/index.html')` instead of
  `public_path('spa/index.html')`. `abort_if(LandingHostGuard::…, 404)` and the
  `no-cache, must-revalidate` header are unchanged; only the path moved.
- **`frontend/scripts/postbuild.mjs`** (new) — replaces the inline `node -e`
  postbuild. Wipes `public/spa` (preserving `.htaccess`), copies `dist/` in
  **excluding `index.html`**, writes the shell to `resources/spa-shell/`, aborts
  before touching `public/spa` if `dist/index.html` is missing, and **exits 1 if
  `public/spa/index.html` exists when it finishes**.
- **`frontend/package.json`** — `"postbuild": "node scripts/postbuild.mjs"`.
- **`.htaccess` under `/spa/`** (source `frontend/public/.htaccess`, plus the
  committed copies in `frontend/dist/` and `public/spa/`) — the SPA-deep-link
  rewrite-to-index.html rule is gone (nothing links into `/spa/` any more, and
  that rule could only resurrect the shell); it now denies `*.html` in that
  directory. **Local Apache only — nginx on Laravel Cloud never reads it.**
- **`tests/Feature/Landing/AdminShellIsNotStaticallyServableTest.php`** (new,
  7 tests) — fails if the shell returns to `public/spa/index.html`, if *any*
  file under `public/` is the admin shell under another name (content scan for
  `<div id="root">` + `/spa/assets/`), if the shell the routes read is missing
  or resolves inside the docroot, if it drifts from `frontend/dist/index.html`,
  or if `postbuild` stops delegating to the guarded script. Plus two
  behavioural pins (admin host serves the shell; landing host 404s).
- **Docblock corrections** in `LandingHostGuard.php`, `LandingHostIsolationTest.php`,
  `LandingPageSecurity.php` — all three previously claimed this was
  uncoverable / needed a web-server rule.

Baseline: `php artisan test tests/Feature/Landing/ tests/Unit/Landing/ tests/Unit/Support/`
→ **415 passed, 1251 assertions** (was 408/1223; +7 = the new class).
Independently reproduced by two verifiers.

## 3. Is the fix build-durable? (the question that matters)

**Yes.** Both paths a Laravel Cloud deploy can take end with no shell in the
docroot:

- **If the frontend is rebuilt** — `npm run build` = `tsc -b && vite build &&
  npm run postbuild`, and `postbuild.mjs` excludes `index.html` from the copy
  and then *asserts* its absence, exiting 1. A failed build aborts the deploy,
  so a regression cannot ship silently — the build goes red instead.
- **If the frontend is not rebuilt** — `public/spa` is committed and no longer
  contains `index.html`, so the deployed tree has no shell either way. (Root
  `package.json`'s `"build": "vite build"` is the Laravel/laravel-vite-plugin
  build and never touches `frontend/`.)

Proven by execution, not by reading:

- A real `npm install && npm run build` (node v24.15.0) was run. Exit 0;
  `public/spa/index.html` absent; `resources/spa-shell/index.html` rewritten at
  build time (mtime matches the build instant) and sha256-identical to
  `frontend/dist/index.html`; 203 files in `public/spa/assets/`;
  `public/spa/.htaccess` byte-intact. `git status` was **clean** immediately
  after the full build — the committed output reproduces bit-for-bit.
- The guard is not decorative: a variant with `EXCLUDED_FROM_DOCROOT` emptied
  fails with exit 1 and the refusal message.
- The hole it guards is real: with `index.html` copied back, `Host:
  sites.hexa-tech.uk` → `/spa/index.html` returns **200 with the byte-identical
  admin shell**. Remove it → 404 on both hosts.
- The test is non-vacuous: with the file restored, 2 of 7 tests fail (exact
  path + docroot content scan, which catches the shell under any filename).

Residual durability risk, stated plainly: the assertion checks the **filename
`index.html` only**, not "no HTML in the docroot". A future build artifact that
is HTML under a different name sails straight in — and one already does (see
below). If you want this airtight, widen the assertion to `*.html`.

## 4. Still open or unproven

1. **`public/spa/stats.html` is still published on the landing host.**
   Confirmed live in production: `https://sites.hexa-tech.uk/spa/stats.html`
   → 200, ~1.36 MB, `text/html`. It is the rollup-plugin-visualizer report
   (`frontend/vite.config.ts:10`), it is **tracked in git** (both
   `public/spa/stats.html` and `frontend/dist/stats.html`), and `postbuild.mjs`
   re-copies it into the docroot on **every** build. It contains the admin
   bundle's full module graph and internal `src/...` source paths.
   The commit's report claims it is "only emitted by `build:prod`" — that is
   **wrong**: `vite build` defaults to mode `production`, so plain `npm run
   build` emits it (verified: `frontend/dist/stats.html` was rewritten by the
   real build at 11:30). Severity: information disclosure only — not a shell,
   cannot mint a token. Fix: add `stats.html` to `EXCLUDED_FROM_DOCROOT`, delete
   the tracked copies, or gate the visualizer behind an explicit flag.
   The new `public/spa/.htaccess` says it denies HTML in that directory "so a
   build that mistakenly drops one back in still does not get served here" —
   that sentence is **false where it matters**, and the same file's own header
   admits nginx never reads it. An HTML file in that directory is live on a
   customer's marketing domain right now.

2. **`public/app/index.html` and `public/staff/index.html` — same class of bug,
   unfixed.** Expo web shells for the member and staff apps, real files in the
   docroot, both 200 on `sites.hexa-tech.uk` today. Deliberately out of scope
   and recorded in `LandingHostGuard`'s docblock. If either stores a credential
   in `localStorage`, it carries the risk this commit just removed from the
   admin shell. Needs a decision on whether those web builds are still live.

3. **The catch-all's exclusion regex is case-sensitive.** `/SPA/index.html` and
   `/Spa/Index.Html` return 200 with the admin shell on the admin host (Laravel
   serving it, not a static file — and they correctly 404 on the landing host,
   so this is *not* a leak). But by the same mechanism `/API/v1/...` and
   `/STORAGE/...` slip past `^(?!api/|storage/|spa/|…)` and get answered with
   the SPA shell instead of their intended handler. Pre-existing, unrelated to
   this commit, worth a follow-up.

Minor / cosmetic:

- `postbuild.mjs` copies first and asserts last, so when the guard fires it has
  already written `public/spa/index.html` and leaves it on disk. The build fails
  so nothing deploys, but a developer is locally sitting on the leak file until
  the next successful build. Delete it in the failure path.
- `postbuild` runs **twice** per build: `"build"` ends with `npm run postbuild`
  *and* npm auto-fires the `postbuild` lifecycle hook. Idempotent, pre-existing,
  just wasted work.
- `docs/superpowers/plans/2026-08-21-landing-page-builder-phase-1.md:1469` still
  quotes `public_path('spa/index.html')`. Historical plan doc, misleads nothing
  executable.

Unproven:

- **`public/spa/.htaccess` was never exercised against a running Apache** — WAMP
  was not up. Syntax-reviewed only. It is dev-only belt-and-braces (nginx
  ignores it in production) and nothing depends on it; if it ever 500s the
  directory, deleting the `<IfModule>` block is safe.
- **Laravel Cloud's actual build command is not in this repo**, so "it runs
  `npm run build` in `frontend/`" is inference. It does not change the verdict:
  both branches above are safe, and the committed tree alone is already clean.

Process caveat: another agent was writing to this working tree during
verification and briefly restored `public/spa/index.html`, producing one false
"leak still open" reading. That was re-run in an isolated `git worktree` at
`d70469df4` and cleared. Don't run two sessions in this tree at once.
