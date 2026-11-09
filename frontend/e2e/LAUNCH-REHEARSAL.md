# Loyalty launch rehearsal

This runs the real staff/member HTTP APIs against a disposable, fully migrated PostgreSQL database. It does not stub business responses. Mail is captured in the private application log, campaign jobs run through the database queue, browser traffic is restricted to loopback, and Laravel HTTP provider calls are refused. Do not use these entry points on production.

## Windows setup

Use PHP 8.5 from `CLAUDE.md`, Node and the frontend's installed Playwright. Create a **new, task-owned** PostgreSQL cluster listening only on `127.0.0.1:55459`, with role `loyalty_launch_owner` and database `loyalty_launch_demo`. Never point this rehearsal at an existing customer database. Do not delete another task's cluster or reuse a seeded database for initial setup.

In each shell, from the repository root:

```powershell
. ./frontend/e2e/launch-env.ps1 -LaunchStorageRoot C:/wamp64/tmp/<unique rehearsal directory>
$env:PHP='C:/wamp64/bin/php/php8.5.12-nts/php.exe'
$env:OPENSSL_CONF='C:/wamp64/bin/php/php8.5.12-nts/extras/ssl/openssl.cnf'
```

The helper changes only the current process environment, keeps storage and generated credentials outside Git, and prevents configured workstation providers from being inherited. Keep the same absolute storage directory in every shell. The standard local `.env` supplies the application key; do not print or commit it.

For the new empty database only:

```powershell
& $env:PHP frontend/e2e/launch-artisan.php migrate --force
& $env:PHP frontend/e2e/launch-seed.php
```

The seed refuses an existing staff population or fixture file. It uses the real organisation onboarding service, creates manager/desk/reader accounts with random passwords, and writes the private fixture outside the repository. Do not print that file.

Start the guarded backend in its own shell, after applying the environment helper:

```powershell
Set-Location public
& $env:PHP -S 127.0.0.1:8019 ../frontend/e2e/launch-router.php
```

Serve a current production SPA build with the real API proxy in another shell. In a feature checkout use a unique build directory outside the repository (restore only the generated `frontend/dist/stats.html` afterwards). Release artifacts use the source-patch recipe's fresh build instead.

```powershell
Set-Location frontend
node node_modules/vite/bin/vite.js build --outDir C:/wamp64/tmp/<unique build directory>
node e2e/full-coverage/serve.mjs C:/wamp64/tmp/<unique build directory> 5819 http://127.0.0.1:8019
```

Run from the root in a shell with the same helper applied:

```powershell
node frontend/e2e/launch-journey.mjs
```

The journey creates a new test member on each run. Results and desktop/mobile screenshots go to `LAUNCH_OUTPUT`; logs, fixture passwords, reset codes and queue payloads stay outside Git. A bounded worker drains only this isolated demo's jobs. The controlled clock advances to test completed-day Insights and scheduled sends without editing ledger dates. It never changes the machine clock.

For the avatar check, the task-owned checkout's `public/storage` must link to this rehearsal's
`$env:LARAVEL_STORAGE_PATH/app/public`. Verify both absolute paths before creating the link; never replace a link or
directory owned by another checkout. The check uploads a constant tiny PNG through the real member endpoint and
reads both the saved profile and actual image through HTTP. Local storage acceptance does not establish Cloud recovery.

The checks cover registration, welcome points, tier upgrade, idempotent awards, reward claim/fulfilment, benefit request/approval/completion, permissions, manual card lookup, reversal, deactivation/reactivation, Insights reconciliation, unavailable integrations, email consent, immediate/scheduled campaigns, a harmless queue probe, password recovery/session revocation and responsive rendering. It does **not** prove real SMTP/SMS/push delivery, wallet issuer approval or physical card/device acceptance.

Stop only this task's HTTP/proxy processes and its verified PostgreSQL cluster after finishing. Preserve the private evidence if needed; never add it to Git.
