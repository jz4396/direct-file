#!/usr/bin/env bash
# #17: download the 2026 early-release draft Schedule B and Schedule E PDFs used as PDFBox templates and check them
# against the SHA-256 rows pinned in draft-pdf-sha256.txt. When the final 2026 forms are published (#124), point the
# URLs at irs.gov/pub/irs-pdf, re-hash, update the manifest rows and re-verify the field maps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/IRS1040SB/en" "$ROOT/IRS1040SE/en"
curl -fsSL -o "$ROOT/IRS1040SB/en/f1040sb--dft.pdf" "https://www.irs.gov/pub/irs-dft/f1040sb--dft.pdf"
curl -fsSL -o "$ROOT/IRS1040SE/en/f1040se--dft.pdf" "https://www.irs.gov/pub/irs-dft/f1040se--dft.pdf"
cd "$ROOT"
grep -E ' IRS1040SB/| IRS1040SE/' draft-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified the Schedule B and Schedule E drafts into $ROOT"
