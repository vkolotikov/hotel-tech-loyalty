#!/usr/bin/env bash
# Loyalty backend deploy hook.
#
# Configure your hosting platform (Laravel Cloud / Forge / Vapor /
# DigitalOcean App Platform / cPanel SSH cron / whatever) to run
# THIS script as part of every deploy. Idempotent — safe to re-run.
#
# Manual unstick: SSH into prod, `cd` to the loyalty backend, and
# `bash deploy.sh`.
#
# Why this is required: Laravel caches its compiled route + config
# files in bootstrap/cache/. When a deploy ships new routes (e.g.
# we add a new API endpoint) but the build container persists the
# bootstrap/cache layer between builds, the OLD route cache wins and
# the new endpoint 404s. `optimize:clear` is the antidote.

set -euo pipefail

cd "$(dirname "$0")"

# Install PHP dependencies when composer is available on the deploy host.
# Guarded so platforms that install deps in a separate build step (and may
# not expose composer on PATH here) don't fail the whole deploy.
if command -v composer >/dev/null 2>&1; then
  echo "→ Installing PHP dependencies…"
  composer install --no-dev --optimize-autoloader --no-interaction
else
  echo "→ composer not on PATH — assuming the platform installs dependencies separately."
fi

echo "→ Clearing stale framework caches…"
php artisan optimize:clear

echo "→ Running pending migrations…"
php artisan migrate --force

echo "→ Re-caching config + routes for production…"
php artisan config:cache
php artisan route:cache
php artisan event:cache

echo "→ Bouncing queue workers (no-op if no queue)…"
php artisan queue:restart 2>/dev/null || true

echo "✓ Deploy commands complete."
