#!/bin/bash
# Runs the PHP suites on SQLite (phpunit.xml's defaults), one test directory or top-level test file at a time
# (never a bare `artisan test`, which segfaults on the Windows workstation), and prints one line per run:
#
#   <path> | exit <code> | <the "Tests:" summary line>
#       FAILED <test name>            (up to 8 per run)
#
# then a total, and exits non-zero if any run failed. Used by CI (.github/workflows/ci.yml) and on Linux.
#
# Usage:
#   scripts/test-php.sh [test path ...]
#
#   test path   optional: run only these directories/files (default: every directory under tests/Feature and
#               tests/Unit except tests/Feature/Concerns, then every top-level tests/Feature/*.php and tests/Unit/*.php).
#
# Environment:
#   PHP     the PHP binary (default php8.4; CLAUDE.md names the pinned one on the Windows workstation)
#   SHARD   optional "<index>/<count>", e.g. 1/2: run only every <count>-th path starting at <index> (CI splits the
#           suite this way; together the shards run every path exactly once)

set -u

PHP="${PHP:-php8.4}"
export COLUMNS=220   # full test names in the FAILED lines
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

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

if [ -n "${SHARD:-}" ]; then
  index="${SHARD%/*}"; count="${SHARD#*/}"
  case "$index$count" in *[!0-9]*|'') echo "test-php.sh: SHARD must look like 1/2" >&2; exit 2 ;; esac
  picked=()
  for i in "${!TARGETS[@]}"; do
    [ $(( i % count )) -eq $(( index - 1 )) ] && picked+=("${TARGETS[$i]}")
  done
  TARGETS=("${picked[@]}")
fi

overall=0; passed=0; failed=0; skipped=0; scopes=0
for t in "${TARGETS[@]}"; do
  res="$(timeout 2400 "$PHP" -d max_execution_time=0 artisan test "$t" --colors=never 2>&1)"
  code=$?
  [ $code -ne 0 ] && overall=1
  summary="$(printf '%s\n' "$res" | grep -E "Tests:" | tail -1 | sed 's/^ *//')"
  echo "$t | exit $code | ${summary:-NO SUMMARY}"
  printf '%s\n' "$res" | grep -E "FAILED " | head -8 | sed 's/^ */    /'
  scopes=$((scopes + 1))
  n=$(printf '%s' "$summary" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+'); passed=$((passed + ${n:-0}))
  n=$(printf '%s' "$summary" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+'); failed=$((failed + ${n:-0}))
  n=$(printf '%s' "$summary" | grep -oE '[0-9]+ skipped' | grep -oE '[0-9]+'); skipped=$((skipped + ${n:-0}))
done
echo "TOTAL | $scopes scopes | $passed passed, $skipped skipped, $failed failed"
exit $overall
