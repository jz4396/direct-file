#!/usr/bin/env bash
# Scan every commit reachable from the pull request head and not from the base.
# --log-opts=base..head is required: a value added and then removed is on HEAD
# no longer, but it is still in the range.
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="/tmp/ci-scanners/bin:${PATH}"

if ! command -v gitleaks >/dev/null; then
  echo "gitleaks is not installed; failing closed." >&2
  exit 1
fi

version="$(gitleaks version)"
if [[ "$version" != "8.30.1" ]]; then
  echo "gitleaks version ${version} does not match the pinned 8.30.1; failing closed." >&2
  exit 1
fi

is_sha() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }

if ! is_sha "${BASE_SHA:-}" || ! is_sha "${HEAD_SHA:-}"; then
  echo "Pull request base and head must be full 40-character SHAs; failing closed." >&2
  exit 1
fi

have_commit() {
  git -C "$ROOT" cat-file -e "${1}^{commit}" 2>/dev/null
}

if ! have_commit "$BASE_SHA" || ! have_commit "$HEAD_SHA"; then
  if [[ "${PR_NUMBER:-}" =~ ^[0-9]+$ ]]; then
    git -C "$ROOT" fetch --no-tags origin "pull/${PR_NUMBER}/head" || true
  fi
fi
if ! have_commit "$BASE_SHA"; then
  git -C "$ROOT" fetch --no-tags origin "$BASE_SHA" || true
fi
if ! have_commit "$HEAD_SHA"; then
  git -C "$ROOT" fetch --no-tags origin "$HEAD_SHA" || true
fi
if ! have_commit "$BASE_SHA" || ! have_commit "$HEAD_SHA"; then
  ref="${BASE_REF:-}"
  if [[ "$ref" =~ ^[A-Za-z0-9._/-]{1,200}$ ]] && [[ "$ref" != -* ]] && [[ "$ref" != *..* ]]; then
    git -C "$ROOT" fetch --no-tags origin "$ref" || true
  fi
fi
if ! have_commit "$BASE_SHA" || ! have_commit "$HEAD_SHA"; then
  echo "Cannot resolve the pull request commit range; failing closed." >&2
  exit 1
fi

echo "gitleaks --log-opts=${BASE_SHA}..${HEAD_SHA}"
git -C "$ROOT" log --oneline "${BASE_SHA}..${HEAD_SHA}"

gitleaks detect \
  --source "$ROOT" \
  --config "$ROOT/.gitleaks.toml" \
  --log-opts="${BASE_SHA}..${HEAD_SHA}" \
  --redact=100 \
  --verbose \
  --no-banner \
  --exit-code=1
