#!/usr/bin/env bash
# Install pinned sbt 1.9.9, the launcher in backend/Dockerfile-local.
# fact-graph-scala/project/build.properties selects sbt 1.9.2 when the build runs.
# The checksum is the trust anchor. A mismatch fails closed.
set -euo pipefail
set +x

SBT_VERSION="1.9.9"
SBT_SHA256="c57cae60c2122ca1bba77184dfb4d0d25fc6c18805394ab36ab6208b0c0f262f"
DEST="/tmp/ci-sbt"

if ! command -v curl >/dev/null || ! command -v sha256sum >/dev/null; then
  echo "curl and sha256sum are required; failing closed." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$DEST"

tar="$tmp/sbt.tgz"
curl --proto '=https' --fail --silent --show-error --location --retry 3 --output "$tar" \
  "https://github.com/sbt/sbt/releases/download/v${SBT_VERSION}/sbt-${SBT_VERSION}.tgz"
echo "${SBT_SHA256}  ${tar}" | sha256sum -c -
# Read the whole listing first. grep -q would close the pipe early, and tar
# then exits on SIGPIPE, which fails the check under pipefail.
tar -tzf "$tar" > "$tmp/list"
if ! grep -qx 'sbt/bin/sbt' "$tmp/list"; then
  echo "sbt archive does not contain sbt/bin/sbt; failing closed." >&2
  exit 1
fi
tar -xzf "$tar" -C "$DEST"
# The first run also prints "copying runtime jar..." on stdout. The version is the last line.
installed="$("$DEST/sbt/bin/sbt" --script-version | tail -n 1 | tr -d '\r')"
if [[ "$installed" != "$SBT_VERSION" ]]; then
  echo "sbt reported ${installed}, expected ${SBT_VERSION}; failing closed." >&2
  exit 1
fi
