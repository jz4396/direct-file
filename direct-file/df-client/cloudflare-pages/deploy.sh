#!/usr/bin/env bash
# Manual deploy of the static client-only build to Cloudflare Pages (free tier). See README.md.
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deploy.sh            # build, check, deploy
#   ./deploy.sh --dry-run                                                     # build and check only, no credentials
#
# Environment:
#   CLOUDFLARE_API_TOKEN    API token with "Cloudflare Pages: Edit" only (read by wrangler, never printed)
#   CLOUDFLARE_ACCOUNT_ID   account id (read by wrangler, never printed)
#   CF_PAGES_PROJECT        Pages project name (default: direct-file-static)
#   CF_PAGES_BRANCH         branch to deploy as (default: main, the production branch)
#
# Exit codes: 0 deployed (or dry run passed); 2 setup problem (missing credentials, VITE_*/REACT_APP_* set in the
# shell, Node.js too old for wrangler, bad project or branch name); anything else is a failed build, check or deploy.
#
# The token is only ever read from the environment by wrangler. This script never echoes it, never passes it on a
# command line, keeps xtrace off, runs the build and the tool install without it (env -u), and masks it in wrangler's
# output in case an error message repeats it.
set -euo pipefail
set +x

# Pinned in package.json / package-lock.json (supply-chain screened; see README.md). Installed with
# `npm ci --ignore-scripts`: no install script of any dependency runs.
WRANGLER_VERSION="4.149.0"
WRANGLER_MIN_NODE=22

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
PROJECT="${CF_PAGES_PROJECT:-direct-file-static}"
BRANCH="${CF_PAGES_BRANCH:-main}"
WRANGLER="$HERE/node_modules/.bin/wrangler"

if [[ ! "$PROJECT" =~ ^[a-z0-9][a-z0-9-]{0,57}$ ]]; then
  echo "CF_PAGES_PROJECT must be a Pages project name (lowercase letters, digits, dashes)" >&2
  exit 2
fi
if [[ ! "$BRANCH" =~ ^[A-Za-z0-9._/-]{1,100}$ ]]; then
  echo "CF_PAGES_BRANCH has unexpected characters" >&2
  exit 2
fi

# Variables in the shell override .env.static, so a stray VITE_* or REACT_APP_* would be baked into the bundle.
# Only the names are printed.
STRAY="$(compgen -e | grep -E '^(VITE_|REACT_APP_)' || true)"
if [[ -n "$STRAY" ]]; then
  echo "Unset these variables first; they would override .env.static in the build:" >&2
  echo "$STRAY" | sed 's/^/  /' >&2
  exit 2
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  # Presence checks only; the values are never printed.
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (or use --dry-run)." >&2
    exit 2
  fi
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_OK=1
if [[ "$NODE_MAJOR" -lt "$WRANGLER_MIN_NODE" ]]; then NODE_OK=0; fi
if [[ "$DRY_RUN" -eq 0 && "$NODE_OK" -eq 0 ]]; then
  echo "wrangler $WRANGLER_VERSION needs Node.js $WRANGLER_MIN_NODE or later (found $NODE_MAJOR)." >&2
  exit 2
fi

# No wrangler usage metrics.
export WRANGLER_SEND_METRICS=false
# Build, check and install without the Cloudflare credentials in the environment.
nocreds() { env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CLOUDFLARE_API_KEY "$@"; }

# Generate, build, check for the all-screens view, stage and check the bundle (build.sh).
nocreds "$HERE/build.sh"

if [[ "$NODE_OK" -eq 1 ]]; then
  echo "==> Installing the pinned deploy tooling (npm ci --ignore-scripts)"
  (cd "$HERE" && nocreds npm ci --ignore-scripts --no-audit --no-fund --loglevel=error)
  FOUND="$(nocreds "$WRANGLER" --version | tail -n 1)"
  if [[ "$FOUND" != "$WRANGLER_VERSION" ]]; then
    echo "Expected wrangler $WRANGLER_VERSION, found $FOUND" >&2
    exit 1
  fi
fi

# With the credentials in its environment (unless this is a dry run), so it can look for their exact values.
# It prints file names only.
echo "==> Checking the staged site for the deploy credentials and Cloudflare tokens"
node "$HERE/checkNoSecrets.mjs" "$OUT"

if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ "$NODE_OK" -eq 0 ]]; then
    echo "==> Note: wrangler $WRANGLER_VERSION needs Node.js $WRANGLER_MIN_NODE or later (found $NODE_MAJOR); a real deploy would stop here."
  fi
  echo "==> Dry run: staged site is in $OUT. Would run:"
  echo "    node_modules/.bin/wrangler pages deploy $OUT --project-name $PROJECT --branch $BRANCH"
  exit 0
fi

echo "==> Deploying $OUT to Cloudflare Pages project $PROJECT (branch $BRANCH) with wrangler $WRANGLER_VERSION"
# Mask the token in anything wrangler prints. node reads it from its own environment, not from argv.
mask() {
  node -e '
    const t = process.env.CLOUDFLARE_API_TOKEN || "";
    const a = process.env.CLOUDFLARE_ACCOUNT_ID || "";
    require("readline").createInterface({ input: process.stdin }).on("line", (l) => {
      if (t) l = l.split(t).join("***");
      if (a) l = l.split(a).join("***");
      process.stdout.write(l + "\n");
    });'
}
"$WRANGLER" pages deploy "$OUT" --project-name "$PROJECT" --branch "$BRANCH" 2>&1 | mask
