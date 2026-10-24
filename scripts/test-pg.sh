#!/bin/bash
# Runs the PHP test suites on PostgreSQL, one test directory or top-level test file at a time
# (the same list and order as the SQLite runner), and prints one line per run:
#
#   <path> | exit <code> | <the "Tests:" summary line>
#       FAILED <test name>            (up to 8 per run)
#
# Usage:
#   scripts/test-pg.sh [database] [test path ...]
#
#   database    a PostgreSQL database built from every migration (default: hexa_test). Its name must
#               contain "test": the script refuses any other name, so it never runs against a real one.
#   test path   optional: run only these directories/files (default: every directory under
#               tests/Feature and tests/Unit, then every top-level tests/Feature/*.php and tests/Unit/*.php).
#
# Connection: the caller sets DB_HOST, DB_PORT, DB_USERNAME and DB_PASSWORD in the environment (export them,
# or `set -a; . <file holding them>; set +a`). The script sets DB_CONNECTION=pgsql and DB_DATABASE=<database>
# itself and never prints any of these values. phpunit.xml's <env> entries are not forced, so these take
# precedence over its sqlite defaults.
#
# Building the database (once, or after a run leaves it dirty; tests use DatabaseTransactions and normally
# leave it as they found it):
#   createdb -O <database owner> hexa_test
#   DB_CONNECTION=pgsql DB_DATABASE=hexa_test php8.4 artisan migrate --force    (with DB_HOST etc. exported)
#
# PostgreSQL's server log shows the first failing statement behind any "current transaction is aborted".

set -u

DB_NAME="${1:-hexa_test}"
[ $# -gt 0 ] && shift

case "$DB_NAME" in
  *test*) ;;
  *) echo "test-pg.sh: refusing to run against database '$DB_NAME' (the name must contain \"test\")." >&2; exit 2 ;;
esac

for v in DB_HOST DB_USERNAME; do
  if [ -z "${!v:-}" ]; then
    echo "test-pg.sh: $v is not set; export DB_HOST, DB_PORT, DB_USERNAME and DB_PASSWORD first." >&2
    exit 2
  fi
done

PHP="${PHP:-php8.4}"
export COLUMNS=220   # full test names in the FAILED lines
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

export DB_CONNECTION=pgsql
export DB_DATABASE="$DB_NAME"
# A test that fails part-way on PostgreSQL can leave a transaction open; a later statement waiting on its locks
# would wait for ever. libpq reads PGOPTIONS, so every connection of the run gives up on a lock after a minute and
# the test that waited fails instead of hanging the run. A caller's own PGOPTIONS is kept.
export PGOPTIONS="${PGOPTIONS:--c lock_timeout=60s}"

if [ $# -gt 0 ]; then
  TARGETS=("$@")
else
  TARGETS=()
  for d in tests/Feature/*/ tests/Unit/*/; do
    d="${d%/}"
    [ "$d" = "tests/Feature/Concerns" ] && continue
    TARGETS+=("$d")
  done
  for f in tests/Feature/*.php tests/Unit/*.php; do
    TARGETS+=("$f")
  done
fi

overall=0
for t in "${TARGETS[@]}"; do
  res="$(timeout 2400 "$PHP" artisan test "$t" 2>&1)"
  code=$?
  [ $code -ne 0 ] && overall=1
  summary="$(printf '%s\n' "$res" | grep -E "Tests:" | tail -1 | sed 's/^ *//')"
  echo "$t | exit $code | ${summary:-NO SUMMARY}"
  printf '%s\n' "$res" | grep -E "FAILED " | head -8 | sed 's/^ */    /'
done
echo DONE
exit $overall
