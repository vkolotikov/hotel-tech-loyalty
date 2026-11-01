#!/bin/bash
# The Laravel server for the full-coverage screenshots (README.md beside this file):
#
#   FC_SERVER_NOW=<the instant FC_CLOCK names> frontend/e2e/full-coverage/api.sh [port]
#
# What `php artisan serve` runs (PHP's built-in server with Laravel's router, from public/), started directly so the
# environment reaches the workers: PHP_CLI_SERVER_WORKERS (default 8) and FC_SERVER_NOW, which fixed-now.php turns
# into Laravel's clock. The database and the rest come from the repository's .env, as for artisan serve. Port 8090 by
# default, on 127.0.0.1 only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
cd "$ROOT/public"
exec "${PHP:-php8.5}" -d auto_prepend_file="$ROOT/frontend/e2e/full-coverage/fixed-now.php" \
  -S "127.0.0.1:${1:-8090}" "$ROOT/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"
