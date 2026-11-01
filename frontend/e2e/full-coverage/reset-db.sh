#!/bin/bash
# The full-coverage demo database (README.md beside this file).
#
#   frontend/e2e/full-coverage/reset-db.sh build    drop and rebuild the database from every migration, seed it
#                                                   (seed-demo.php) and keep a copy as <database>_tpl
#   frontend/e2e/full-coverage/reset-db.sh reset    replace the database with a fresh copy of <database>_tpl and
#                                                   clear the application cache (run before every screenshot run)
#
# Reads DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD and DB_DATABASE from the repository's .env (never printed). The
# role needs the right to create databases. Refuses a database whose name does not contain "demo", so it never
# drops a real one. Stop nothing: an open connection (artisan serve between requests holds none) is ended.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
PHP="${PHP:-php8.5}"

read_env() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
export PGHOST="$(read_env DB_HOST)" PGPORT="$(read_env DB_PORT)" PGUSER="$(read_env DB_USERNAME)" PGPASSWORD="$(read_env DB_PASSWORD)"
DB="$(read_env DB_DATABASE)"
case "$DB" in *demo*) ;; *) echo "reset-db.sh: refusing database '$DB' (the name must contain \"demo\")." >&2; exit 2 ;; esac
[ "$(read_env APP_ENV)" = local ] || { echo "reset-db.sh: APP_ENV must be local." >&2; exit 2; }
TPL="${DB}_tpl"
psql_admin() { psql -d postgres -v ON_ERROR_STOP=1 -qAtc "$1"; }

case "${1:-}" in
  build)
    psql_admin "drop database if exists \"$DB\" with (force)"
    psql_admin "create database \"$DB\""
    "$PHP" artisan migrate --force --no-interaction > /dev/null
    "$PHP" frontend/e2e/full-coverage/seed-demo.php
    psql_admin "drop database if exists \"$TPL\" with (force)"
    psql_admin "create database \"$TPL\" template \"$DB\""
    "$PHP" artisan cache:clear > /dev/null
    echo "built $DB and its template $TPL"
    ;;
  reset)
    psql_admin "select 1 from pg_database where datname = '$TPL'" | grep -q 1 || { echo "reset-db.sh: no $TPL; run build first." >&2; exit 2; }
    psql_admin "drop database if exists \"$DB\" with (force)"
    psql_admin "create database \"$DB\" template \"$TPL\""
    "$PHP" artisan cache:clear > /dev/null
    echo "reset $DB from $TPL"
    ;;
  *) echo "usage: $0 build|reset" >&2; exit 2 ;;
esac
