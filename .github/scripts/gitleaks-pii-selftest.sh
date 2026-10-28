#!/usr/bin/env bash
# Prove the SSN, EIN, and ITIN rules and the --log-opts range scan.
# Synthetic values are built at runtime and written only under mktemp.
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="/tmp/ci-scanners/bin:${PATH}"

if ! command -v gitleaks >/dev/null || ! command -v python3 >/dev/null; then
  echo "gitleaks and python3 are required; failing closed." >&2
  exit 1
fi

version="$(gitleaks version)"
if [[ "$version" != "8.30.1" ]]; then
  echo "gitleaks version ${version} does not match the pinned 8.30.1; failing closed." >&2
  exit 1
fi

wf="$ROOT/.github/workflows/secret-and-dependency-audit.yml"
range_script="$ROOT/.github/scripts/gitleaks-pr-range.sh"
audit_script="$ROOT/.github/scripts/dependency-audit.mjs"

grep -q 'contents: read' "$wf"
grep -q '3d3c42e5aac5ba805825da76410c181273ba90b1' "$wf"
grep -q '949feb2413d6458794dcd2491c4babbbce0c15c1' "$wf"
grep -q 'persist-credentials: false' "$wf"
grep -Fq -- '--log-opts=' "$range_script"
grep -Fq -- '--ignore-scripts' "$audit_script"
grep -Fq -- '--audit-level=high' "$audit_script"
if grep -Eq '\$\{\{[[:space:]]*secrets\.|pull_request_target|contents:[[:space:]]*write' "$wf"; then
  echo "workflow grants write, uses pull_request_target, or references secrets; failing closed." >&2
  exit 1
fi

# Digit groups stay split in this file so the source itself is not a finding.
ssn() { printf '%s-%s-%s' "$1" "$2" "$3"; }
ein() { printf '%s-%s' "$1" "$2"; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tree="$WORK/tree"
mkdir -p \
  "$tree/src/main" \
  "$tree/src/test" \
  "$tree/src/it" \
  "$tree/docs/testing" \
  "$tree/direct-file/df-client/df-client-app/src/locales" \
  "$tree/direct-file/df-client/df-client-app/src/staticClient/noRetention" \
  "$tree/direct-file/state-api/src/main/java/gov/irs/directfile/stateapi/repository/facts"

novel_ssn="$(ssn 210 45 6789)"
area_666="$(ssn 666 12 3456)"
area_000="$(ssn 000 12 3456)"
near_sentinel="$(ssn 000 00 0001)"
sentinel="$(ssn 000 00 0000)"
itin_issued="$(ssn 900 70 1234)"
itin_other="$(ssn 900 12 3456)"
novel_ein="$(ein 13 1234567)"
bad_ein="$(ein 07 1234567)"
published_ein="$(ein 92 6001185)"

printf 'ssn %s\n' "$novel_ssn" >"$tree/src/main/novel-ssn.txt"
printf 'ssn %s\n' "$area_666" >"$tree/src/main/area-666.txt"
printf 'ssn %s\n' "$area_000" >"$tree/src/main/area-000.txt"
printf 'ssn %s\n' "$near_sentinel" >"$tree/src/main/near-sentinel.txt"
printf 'ssn %s\n' "$sentinel" >"$tree/src/main/sentinel.txt"
printf 'itin %s\n' "$itin_issued" >"$tree/src/main/itin.txt"
printf 'itin %s\n' "$itin_other" >"$tree/src/main/itin-group.txt"
printf 'ein %s\n' "$novel_ein" >"$tree/src/main/ein.txt"
printf 'ein %s\n' "$bad_ein" >"$tree/src/main/bad-ein.txt"
printf 'ein %s\n' "$published_ein" >"$tree/src/main/published-ein.txt"

allow_body="$(printf 'ssn %s\nitin %s\nein %s\n' "$novel_ssn" "$itin_issued" "$novel_ein")"
printf '%s' "$allow_body" >"$tree/src/test/sample.txt"
printf '%s' "$allow_body" >"$tree/src/it/sample.txt"
printf '%s' "$allow_body" >"$tree/docs/testing/notes.txt"
printf '%s' "$allow_body" >"$tree/direct-file/df-client/df-client-app/src/locales/en.yaml"
printf '%s' "$allow_body" >"$tree/direct-file/df-client/df-client-app/src/locales/es.yaml"
printf '%s' "$allow_body" >"$tree/direct-file/df-client/df-client-app/src/staticClient/noRetention/scenario.txt"
printf '%s' "$allow_body" >"$tree/direct-file/state-api/src/main/java/gov/irs/directfile/stateapi/repository/facts/ExportedFactsClientMock.java"

report="$WORK/tree-report.json"
gitleaks detect \
  --no-git \
  --source "$tree" \
  --config "$ROOT/.gitleaks.toml" \
  --report-format json \
  --report-path "$report" \
  --no-banner \
  --redact=100 \
  --exit-code=0

python3 - "$tree" "$report" <<'PY'
import json
import sys
from collections import defaultdict

root, report = sys.argv[1], sys.argv[2]
root = root.rstrip("/") + "/"
findings = json.load(open(report))
by = defaultdict(set)
for item in findings:
    path = item["File"].replace("\\", "/")
    if path.startswith(root):
        path = path[len(root):]
    by[path].add(item["RuleID"])

expected = {
    "src/main/novel-ssn.txt": {"ssn-outside-9xx"},
    "src/main/area-666.txt": {"ssn-outside-9xx"},
    "src/main/area-000.txt": {"ssn-outside-9xx"},
    "src/main/near-sentinel.txt": {"ssn-outside-9xx"},
    "src/main/sentinel.txt": set(),
    "src/main/itin.txt": {"itin"},
    "src/main/itin-group.txt": {"itin"},
    "src/main/ein.txt": {"ein"},
    "src/main/bad-ein.txt": set(),
    "src/main/published-ein.txt": set(),
    "src/test/sample.txt": set(),
    "src/it/sample.txt": set(),
    "docs/testing/notes.txt": set(),
    "direct-file/df-client/df-client-app/src/locales/en.yaml": set(),
    "direct-file/df-client/df-client-app/src/locales/es.yaml": set(),
    "direct-file/df-client/df-client-app/src/staticClient/noRetention/scenario.txt": set(),
    "direct-file/state-api/src/main/java/gov/irs/directfile/stateapi/repository/facts/ExportedFactsClientMock.java": set(),
}
failed = False
for path, rules in sorted(expected.items()):
    got = by.get(path, set())
    if got != rules:
        print(f"rule mismatch {path}: got {sorted(got)} expected {sorted(rules)}", file=sys.stderr)
        failed = True
extra = sorted(set(by) - set(expected))
if extra:
    print(f"unexpected files with findings: {extra}", file=sys.stderr)
    failed = True
if failed:
    sys.exit(1)
print(f"working-tree cases passed: {len(expected)}")
PY

hist="$WORK/hist"
mkdir -p "$hist/src/main"
git -C "$hist" init -q -b main
git -C "$hist" config user.email ci-selftest@localhost
git -C "$hist" config user.name ci-selftest
git -C "$hist" config commit.gpgsign false
printf 'clean\n' >"$hist/src/main/history.txt"
git -C "$hist" add src/main/history.txt
git -C "$hist" commit -q -m init
base="$(git -C "$hist" rev-parse HEAD)"
printf 'leak %s\n' "$novel_ssn" >"$hist/src/main/history.txt"
git -C "$hist" add src/main/history.txt
git -C "$hist" commit -q -m 'add synthetic value'
printf 'clean again\n' >"$hist/src/main/history.txt"
git -C "$hist" add src/main/history.txt
git -C "$hist" commit -q -m 'remove synthetic value'
head_sha="$(git -C "$hist" rev-parse HEAD)"
parent="$(git -C "$hist" rev-parse HEAD^)"

scan_range() {
  local opts="$1"
  local out="$2"
  gitleaks detect \
    --source "$hist" \
    --config "$ROOT/.gitleaks.toml" \
    --log-opts="$opts" \
    --report-format json \
    --report-path "$out" \
    --no-banner \
    --redact=100 \
    --exit-code=0
}

scan_range "${base}..${head_sha}" "$WORK/range.json"
scan_range "${parent}..${head_sha}" "$WORK/tip.json"

python3 - "$WORK/range.json" "$WORK/tip.json" <<'PY'
import json
import sys

def rules(path):
    data = json.load(open(path))
    return sorted({item["RuleID"] for item in data}), len(data)

range_rules, range_count = rules(sys.argv[1])
tip_rules, tip_count = rules(sys.argv[2])
if range_rules != ["ssn-outside-9xx"] or range_count != 1:
    print(f"range scan expected one ssn hit, got {range_count} {range_rules}", file=sys.stderr)
    sys.exit(1)
if tip_count != 0:
    print(f"tip-only scan expected no hits, got {tip_count} {tip_rules}", file=sys.stderr)
    sys.exit(1)
print("commit-range cases passed: base..head hit, parent..head clean")
PY

echo "gitleaks PII self-test passed"
