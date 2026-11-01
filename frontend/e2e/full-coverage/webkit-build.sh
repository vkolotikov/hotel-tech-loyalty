#!/bin/bash
# A copy of one SPA build for the WebKit screenshots (README.md beside this file, "WebKit"):
#
#   frontend/e2e/full-coverage/webkit-build.sh <build dir> <copy dir> [clock]
#
# The copy hard-links every file of the build, except index.html, which loads webkit-inject.js first (the clock
# written in, default 2026-11-01T12:00:00Z: the instant FC_CLOCK names for shoot.mjs). It also adds two empty pages
# on the origin: fc-blank.html (for writing localStorage before each screen) and fc-frame.html (a frame for the phone
# width, which MiniBrowser's window cannot reach). Serve the copy with serve.mjs as you would the build.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: $0 <build dir> <copy dir> [clock]" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(cd "$1" && pwd)"; COPY="$2"; CLOCK="${3:-2026-11-01T12:00:00Z}"
[ -f "$BUILD/index.html" ] || { echo "webkit-build.sh: no index.html in $BUILD" >&2; exit 2; }
rm -rf "$COPY"
cp -al "$BUILD" "$COPY"
rm "$COPY/index.html"
sed 's#<head>#<head><script src="/spa/fc-wk.js"></script>#' "$BUILD/index.html" > "$COPY/index.html"
grep -q 'fc-wk.js' "$COPY/index.html" || { echo "webkit-build.sh: no <head> in index.html" >&2; exit 2; }
sed "s#__FC_CLOCK__#$CLOCK#" "$HERE/webkit-inject.js" > "$COPY/fc-wk.js"
echo '<!doctype html><title>blank</title>' > "$COPY/fc-blank.html"
printf '<!doctype html><title>frame</title><style>html,body{margin:0;background:#fff}iframe{border:0;display:block}</style><iframe id="f"></iframe>\n' > "$COPY/fc-frame.html"
echo "WebKit copy of $BUILD in $COPY (clock $CLOCK)"
