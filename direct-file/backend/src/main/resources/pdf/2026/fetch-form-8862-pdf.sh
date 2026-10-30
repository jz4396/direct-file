#!/usr/bin/env bash
# #89: download the continuous-use Form 8862 (Rev. December 2025) PDF used as the TY2026 PDFBox template and check
# it against the SHA-256 row pinned in continuous-use-pdf-sha256.txt. When IRS publishes a newer revision, point
# the URL at the new irs.gov/pub/irs-pdf file, re-hash, update the manifest row and re-verify the field map.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/IRS8862/en"
curl -fsSL -o "$ROOT/IRS8862/en/f8862.pdf" "https://www.irs.gov/pub/irs-pdf/f8862.pdf"
cd "$ROOT"
grep -E ' IRS8862/' continuous-use-pdf-sha256.txt | awk '{print $1 "  " $2}' | sha256sum -c -
echo "Downloaded and verified Form 8862 (Rev. 12-2025) into $ROOT/IRS8862/en"
