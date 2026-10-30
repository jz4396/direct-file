#!/usr/bin/env bash
# #17: download the 2026 early-release draft Form 8995 PDF used as a PDFBox template and check it against the
# SHA-256 row pinned in draft-pdf-sha256.txt. When the final 2026 form is published (#124), point the URL at
# irs.gov/pub/irs-pdf, re-hash, update the manifest row and re-verify the field map.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/IRS8995/en"
curl -fsSL -o "$ROOT/IRS8995/en/f8995--dft.pdf" "https://www.irs.gov/pub/irs-dft/f8995--dft.pdf"
cd "$ROOT"
grep -E ' IRS8995/' draft-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified the Form 8995 draft into $ROOT"
