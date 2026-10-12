#!/usr/bin/env bash
# Phase A: download the IRS Schedule D and Form 8949 fillable PDFs used as PDFBox templates (not pdf-lib).
# Latest published revision is 2025 (TY2026 forms not yet released); re-run and re-verify field names when they are.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
curl -fsSL -o "$ROOT/IRS1040SD/en/f1040sd.pdf" "https://www.irs.gov/pub/irs-pdf/f1040sd.pdf"
mkdir -p "$ROOT/IRS8949/en"
curl -fsSL -o "$ROOT/IRS8949/en/f8949.pdf" "https://www.irs.gov/pub/irs-pdf/f8949.pdf"
echo "Downloaded Schedule D and Form 8949 PDFs into $ROOT"
