#!/usr/bin/env bash
# #120: download the 2026 early-release draft Schedule 8812 and Forms 2441, 8880 and 8889 PDFs used as PDFBox templates
# and check them against the SHA-256 rows pinned in draft-pdf-sha256.txt. When the final 2026 forms are published
# (#124), point the URLs at irs.gov/pub/irs-pdf, re-hash, update the manifest rows and re-verify the field maps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/IRS1040S8812/en" "$ROOT/IRS2441/en" "$ROOT/IRS8880/en" "$ROOT/IRS8889/en"
curl -fsSL -o "$ROOT/IRS1040S8812/en/f1040s8--dft.pdf" "https://www.irs.gov/pub/irs-dft/f1040s8--dft.pdf"
curl -fsSL -o "$ROOT/IRS2441/en/f2441--dft.pdf" "https://www.irs.gov/pub/irs-dft/f2441--dft.pdf"
curl -fsSL -o "$ROOT/IRS8880/en/f8880--dft.pdf" "https://www.irs.gov/pub/irs-dft/f8880--dft.pdf"
curl -fsSL -o "$ROOT/IRS8889/en/f8889--dft.pdf" "https://www.irs.gov/pub/irs-dft/f8889--dft.pdf"
cd "$ROOT"
grep -E ' (IRS1040S8812|IRS2441|IRS8880|IRS8889)/' draft-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified Schedule 8812 and Form 2441, 8880 and 8889 drafts into $ROOT"
