#!/usr/bin/env bash
# #89: download the 2026 early-release draft Schedule R PDF used as a PDFBox template and check it against the
# SHA-256 row pinned in draft-pdf-sha256.txt. When the final 2026 form is published (#124), point the URL at
# irs.gov/pub/irs-pdf, re-hash, update the manifest row and re-verify the field map.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/SCHEDULE_R/en"
curl -fsSL -o "$ROOT/SCHEDULE_R/en/f1040sr--dft.pdf" "https://www.irs.gov/pub/irs-dft/f1040sr--dft.pdf"
cd "$ROOT"
grep -E ' SCHEDULE_R/' draft-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified the Schedule R draft into $ROOT"
