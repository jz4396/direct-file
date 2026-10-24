#!/usr/bin/env bash
# Build, check and stage the static client-only site into ./out. Used by deploy.sh (direct upload) and as the
# build command of a Cloudflare Pages project connected to the repository (Git integration). See README.md.
#
#   ./build.sh             # dependencies already installed (deploy.sh, local preview)
#   ./build.sh --install   # first install the client dependencies with npm ci --ignore-scripts (Pages build)
#
# Refuses to run if a Cloudflare credential or a VITE_*/REACT_APP_* variable is in the environment: the build
# never needs the former, and the latter would override .env.static and be baked into the bundle. Only the
# variable names are printed.
set -euo pipefail
set +x

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT="$HERE/.."
APP="$CLIENT/df-client-app"

CREDS="$(compgen -e | grep -E '^CLOUDFLARE_(API_TOKEN|ACCOUNT_ID|API_KEY)$' || true)"
if [[ -n "$CREDS" ]]; then
  echo "The build doesn't use Cloudflare credentials; remove these from the build environment:" >&2
  echo "$CREDS" | sed 's/^/  /' >&2
  exit 2
fi
STRAY="$(compgen -e | grep -E '^(VITE_|REACT_APP_)' || true)"
if [[ -n "$STRAY" ]]; then
  echo "Unset these variables first; they would override .env.static in the build:" >&2
  echo "$STRAY" | sed 's/^/  /' >&2
  exit 2
fi

if [[ "${1:-}" == "--install" ]]; then
  echo "==> Installing the client dependencies (npm ci --ignore-scripts)"
  (cd "$CLIENT" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error)
fi

cd "$APP"
echo "==> Generating the fact dictionary"
npm run --silent generate-fact-dictionary > /dev/null
echo "==> Building the static client-only bundle (vite build --mode static)"
npm run --silent build:static
# Run explicitly: npm skips the postbuild:static hook when ignore-scripts is set.
echo "==> Checking dist-static for the all-screens development view"
npm run --silent check:production-build -- dist-static
echo "==> Staging and checking the bundle (no network targets or credentials, unofficial-site notice, CSP, headers)"
npm run --silent stage:static
