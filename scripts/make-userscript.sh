#!/usr/bin/env bash
# Packs the in-app scripts into one Safari userscript (dist/pb-touch.user.js),
# for people who can't sideload the app. Install it with the free "Userscripts"
# Safari extension (or any userscript manager that supports @inject-into page).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(/usr/bin/env python3 -c "import plistlib,sys;print(plistlib.load(open(sys.argv[1],'rb'))['CFBundleShortVersionString'])" "$ROOT/Info.plist")"
OUT="$ROOT/dist/pb-touch.user.js"
RAW="https://raw.githubusercontent.com/bradleyowenyoung-prog/PB-Touch/main/dist/pb-touch.user.js"
mkdir -p "$ROOT/dist"
{
  cat <<EOF
// ==UserScript==
// @name         PB Touch controls
// @namespace    https://github.com/bradleyowenyoung-prog/PB-Touch
// @version      $VERSION
// @description  Bigger arena and custom touch controls (radial moves, dodge, team strip, editable layout) for PB Ranked in Safari.
// @match        https://ranked.pokemonbattlegrounds.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @updateURL    $RAW
// @downloadURL  $RAW
// ==/UserScript==
// Unofficial fan project, not affiliated with PB Ranked. Built from github.com/bradleyowenyoung-prog/PB-Touch.

EOF
  for f in probe vpad layout; do
    echo "// ---- $f.js ----"
    cat "$ROOT/Resources/$f.js"
    echo
  done
  cat <<'EOF'
// ---- lock page zoom so drags and taps never zoom ----
document.addEventListener('DOMContentLoaded', function () {
  var c = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  var m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute('content', c);
});
EOF
} > "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes, v$VERSION)"
