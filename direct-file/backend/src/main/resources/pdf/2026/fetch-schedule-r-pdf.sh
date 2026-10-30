#!/usr/bin/env bash
# #124: download the final 2026 Schedule R PDF used as a PDFBox template and check it against the SHA-256 row
# pinned in final-pdf-sha256.txt. When IRS republishes the form, point the URL at the new irs.gov/pub/irs-pdf
# file, re-hash, update the manifest row and re-verify the field map.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/SCHEDULE_R/en"
curl -fsSL -o "$ROOT/SCHEDULE_R/en/f1040sr.pdf" "https://www.irs.gov/pub/irs-pdf/f1040sr.pdf"
cd "$ROOT"
grep -E ' SCHEDULE_R/' final-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified the 2026 Schedule R final into $ROOT"
