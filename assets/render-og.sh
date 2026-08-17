#!/usr/bin/env bash
#
# render-og.sh — render assets/og-card.html to assets/og-social-preview.png (1280x640),
# the repo's social-preview (OG) card, and check the things that otherwise break silently.
#
#   ./assets/render-og.sh          # from the repo root
#
# Three failures this guards, all of which have actually happened or would go unnoticed:
#
#   1. A missing JetBrains Mono falls back to another monospace, quietly changing every
#      line length and overflowing the proof cards. Asserted, not hoped for.
#      Install from https://www.jetbrains.com/lp/mono/ (OFL-1.1).
#   2. Headless Chrome happily writes a differently-sized PNG if the window flags drift.
#      The output must be exactly 1280x640.
#   3. Text drifting out of the centered 1000x500 safe area that unfurl surfaces crop
#      toward. The card's own CSS height is NOT a clip, so containment can only be
#      checked on rendered pixels — which is what the optional PIL step below does.
#
# UPLOADING IS A SEPARATE, MANUAL STEP, AND IT IS THE ONE THAT GETS FORGOTTEN.
# GitHub exposes no REST or GraphQL API for the social preview, so:
#      repo -> Settings -> General -> Social preview -> Upload an image
# Then verify from OUTSIDE GitHub, because the settings dialog will happily show you a
# preview of an upload that never took effect:
#
#   curl -sL https://github.com/backthread/add-reasoning-to-prs | grep -o 'og:image[^>]*'
#
# A custom card gives you a repository-images.githubusercontent.com URL. If you still see
# opengraph.githubassets.com, that is GitHub's AUTO-GENERATED fallback and this card is
# not live. (That is exactly how it sat un-uploaded for a month: the PNG was committed,
# nothing ever checked the live tag.)

set -euo pipefail

cd "$(dirname "$0")/.."

CARD="assets/og-card.html"
OUT="assets/og-social-preview.png"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

[ -f "$CARD" ] || { echo "error: $CARD not found (run from the repo root)" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "error: Chrome not found at '$CHROME'. Set CHROME=/path/to/chrome" >&2; exit 1; }

# --- 1. the font must really be installed -------------------------------------------
# Two independent probes; either finding it is enough. Note `grep -q` would SIGPIPE
# fc-list and, under `set -o pipefail`, fail this check on a machine that HAS the font —
# so count matches instead of short-circuiting.
FOUND=0
CHECKED=0
if command -v fc-list >/dev/null 2>&1; then
  CHECKED=1
  FC_HITS="$(fc-list 2>/dev/null | grep -ci "jetbrains mono" || true)"
  [ "${FC_HITS:-0}" -gt 0 ] && FOUND=1
fi
if [ "$FOUND" -eq 0 ] && [ "$(uname)" = "Darwin" ]; then
  CHECKED=1
  DIR_HITS="$(ls ~/Library/Fonts /Library/Fonts 2>/dev/null | grep -ci "JetBrainsMono" || true)"
  [ "${DIR_HITS:-0}" -gt 0 ] && FOUND=1
fi
if [ "$FOUND" -eq 0 ]; then
  if [ "$CHECKED" -eq 1 ]; then
    echo "error: JetBrains Mono is not installed — the render would silently fall back." >&2
    echo "       get it from https://www.jetbrains.com/lp/mono/ (OFL-1.1)" >&2
    exit 1
  fi
  echo "warn: cannot verify JetBrains Mono is installed; check the output by eye" >&2
fi

# --- 2. render ----------------------------------------------------------------------
"$CHROME" \
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1280,640 --screenshot="$OUT" \
  "file://$PWD/$CARD" >/dev/null 2>&1

[ -s "$OUT" ] || { echo "error: $OUT was not written" >&2; exit 1; }

# --- 3. exact canvas size (GitHub's recommended social-preview size) ----------------
DIMS=""
if command -v sips >/dev/null 2>&1; then
  DIMS="$(sips -g pixelWidth "$OUT" | awk '/pixelWidth/{w=$2} END{print w}')x$(sips -g pixelHeight "$OUT" | awk '/pixelHeight/{h=$2} END{print h}')"
elif command -v file >/dev/null 2>&1; then
  DIMS="$(file "$OUT" | grep -oE '[0-9]+ x [0-9]+' | head -1 | tr -d ' ')"
fi
if [ -n "$DIMS" ] && [ "$DIMS" != "1280x640" ]; then
  echo "error: $OUT is ${DIMS}, expected 1280x640" >&2
  exit 1
fi

# --- 4. safe-area containment, measured on pixels -----------------------------------
# Optional: needs python3 + Pillow. Skipped loudly rather than silently.
if python3 -c "import PIL" >/dev/null 2>&1; then
  python3 - "$OUT" <<'PY' || exit 1
import sys
from PIL import Image

PNG = sys.argv[1]
SAFE = (140, 70, 1140, 570)          # centered 1000x500 box
LUM_THRESHOLD = 25                    # above the decorative radial glow (~+8 lum)

im = Image.open(PNG).convert("RGB")
px = im.load()
W, H = im.size
lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
bg = lum(px[5, H // 2])

# skip the top 10px: the full-bleed accent bar is decorative and exempt by design
minx, miny, maxx, maxy = W, H, -1, -1
for y in range(10, H):
    for x in range(W):
        if abs(lum(px[x, y]) - bg) > LUM_THRESHOLD:
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y

if maxx < 0:
    print("error: no ink found in %s — did the render come out blank?" % PNG, file=sys.stderr)
    sys.exit(1)

x0, y0, x1, y1 = SAFE
ok = minx >= x0 and maxx <= x1 and miny >= y0 and maxy <= y1
print("ink bbox x[%d,%d] y[%d,%d]; safe box x[%d,%d] y[%d,%d]" % (minx, maxx, miny, maxy, x0, x1, y0, y1))
if not ok:
    print("error: content escapes the 1000x500 safe area — it will be cropped in unfurls.", file=sys.stderr)
    print("       overshoot: left %d right %d top %d bottom %d (negative = outside)"
          % (minx - x0, x1 - maxx, miny - y0, y1 - maxy), file=sys.stderr)
    sys.exit(1)
print("safe-area margins: left %d right %d top %d bottom %d px" % (minx - x0, x1 - maxx, miny - y0, y1 - maxy))
PY
else
  echo "warn: SKIPPED the safe-area containment check (needs python3 + Pillow: pip install Pillow)" >&2
fi

echo "rendered $OUT (${DIMS:-size unverified})"
echo "next: GitHub -> Settings -> General -> Social preview -> Upload an image,"
echo "      then verify the live tag:  curl -sL https://github.com/backthread/add-reasoning-to-prs | grep -o 'og:image[^>]*'"
