#!/usr/bin/env bash
# Install pinned scanner binaries into /tmp/ci-scanners/bin.
# Checksums are the trust anchor reviewed with this script. A mismatch fails closed.
# gitleaks 8.30.1 (2026-03-21) linux x64
# osv-scanner 2.7.0 (2026-10-12) linux amd64
set -euo pipefail
set +x

GITLEAKS_VERSION="8.30.1"
GITLEAKS_SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
OSV_VERSION="2.7.0"
OSV_SHA256="160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b"

BIN_DIR="/tmp/ci-scanners/bin"
want="${1:-all}"

usage() {
  echo "usage: install-pinned-scanners.sh [all|gitleaks|osv-scanner]" >&2
  exit 1
}

case "$want" in
  all | gitleaks | osv-scanner) ;;
  *) usage ;;
esac

if ! command -v curl >/dev/null || ! command -v sha256sum >/dev/null; then
  echo "curl and sha256sum are required; failing closed." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$BIN_DIR"

download_verified() {
  local url="$1"
  local dest="$2"
  local sha="$3"
  curl --proto '=https' --fail --silent --show-error --location --retry 3 --output "$dest" "$url"
  echo "${sha}  ${dest}" | sha256sum -c -
}

install_gitleaks() {
  local tar="$tmp/gitleaks.tar.gz"
  download_verified \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    "$tar" \
    "$GITLEAKS_SHA256"
  if ! tar -tzf "$tar" | grep -qx 'gitleaks'; then
    echo "gitleaks archive does not contain the expected binary; failing closed." >&2
    exit 1
  fi
  tar -xzf "$tar" -C "$tmp" gitleaks
  install -m 0755 "$tmp/gitleaks" "$BIN_DIR/gitleaks"
  local version
  version="$("$BIN_DIR/gitleaks" version)"
  if [[ "$version" != "$GITLEAKS_VERSION" ]]; then
    echo "gitleaks reported ${version}, expected ${GITLEAKS_VERSION}; failing closed." >&2
    exit 1
  fi
}

install_osv() {
  local bin="$tmp/osv-scanner"
  download_verified \
    "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_amd64" \
    "$bin" \
    "$OSV_SHA256"
  install -m 0755 "$bin" "$BIN_DIR/osv-scanner"
  local version
  version="$("$BIN_DIR/osv-scanner" --version)"
  if ! grep -qx "osv-scanner version: ${OSV_VERSION}" <<<"$version"; then
    echo "osv-scanner version did not match ${OSV_VERSION}; failing closed." >&2
    exit 1
  fi
}

case "$want" in
  all)
    install_gitleaks
    install_osv
    ;;
  gitleaks) install_gitleaks ;;
  osv-scanner) install_osv ;;
esac

echo "installed ${want} into ${BIN_DIR}"
