#!/usr/bin/env bash
# #35: download the 2026 early-release draft Schedule D and Form 8949 PDFs used as PDFBox templates and check them
# against the SHA-256 rows pinned in draft-pdf-sha256.txt. When the final 2026 forms are published (#124), point the
# URLs at irs.gov/pub/irs-pdf, re-hash, update the manifest rows and re-verify the field maps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/IRS1040SD/en" "$ROOT/IRS8949/en"
curl -fsSL -o "$ROOT/IRS1040SD/en/f1040sd--dft.pdf" "https://www.irs.gov/pub/irs-dft/f1040sd--dft.pdf"
curl -fsSL -o "$ROOT/IRS8949/en/f8949--dft.pdf" "https://www.irs.gov/pub/irs-dft/f8949--dft.pdf"
cd "$ROOT"
grep -E ' (IRS1040SD|IRS8949)/' draft-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified Schedule D and Form 8949 drafts into $ROOT"
