#!/usr/bin/env bash
# Phase A: download the IRS TY2024 Schedule D PDF used as the PDFBox template (not pdf-lib).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
curl -fsSL -o "$ROOT/IRS1040SD/en/f1040sd.pdf" \
  "https://www.irs.gov/pub/irs-prior/f1040sd--2024.pdf"
echo "Downloaded Schedule D PDF into $ROOT (Form 8949 print template is a follow-up)"
