#!/usr/bin/env bash
# Manual deploy of the static client-only build to Cloudflare Pages (free tier). See README.md.
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deploy.sh            # build, check, deploy
#   ./deploy.sh --dry-run                                                     # build and check only
#
# Environment:
#   CLOUDFLARE_API_TOKEN    API token with "Cloudflare Pages: Edit" only (read by wrangler, never printed)
#   CLOUDFLARE_ACCOUNT_ID   account id (read by wrangler, never printed)
#   CF_PAGES_PROJECT        Pages project name (default: direct-file-static)
#   CF_PAGES_BRANCH         branch to deploy as (default: main, the production branch)
#
# The token is only ever read from the environment by wrangler. This script never echoes it, never passes it on a
# command line, keeps xtrace off, and masks it in wrangler's output in case an error message repeats it.
set -euo pipefail
set +x

# Pinned wrangler (supply-chain screened; see README.md). Run through npx, so it is not a project dependency.
WRANGLER_VERSION="4.149.0"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/../df-client-app"
OUT="$HERE/out"
PROJECT="${CF_PAGES_PROJECT:-direct-file-static}"
BRANCH="${CF_PAGES_BRANCH:-main}"

if [[ ! "$PROJECT" =~ ^[a-z0-9][a-z0-9-]{0,57}$ ]]; then
  echo "CF_PAGES_PROJECT must be a Pages project name (lowercase letters, digits, dashes)" >&2
  exit 2
fi
if [[ ! "$BRANCH" =~ ^[A-Za-z0-9._/-]{1,100}$ ]]; then
  echo "CF_PAGES_BRANCH has unexpected characters" >&2
  exit 2
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  # Presence checks only; the values are never printed.
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (or use --dry-run)." >&2
    exit 2
  fi
fi

# No wrangler usage metrics.
export WRANGLER_SEND_METRICS=false

cd "$APP"
echo "==> Generating the fact dictionary"
npm run --silent generate-fact-dictionary > /dev/null
echo "==> Building the static client-only bundle (vite build --mode static)"
npm run --silent build:static
echo "==> Staging and checking the bundle (no network targets, CSP, headers)"
npm run --silent stage:static

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Dry run: staged site is in $OUT. Would run:"
  echo "    npx --yes wrangler@$WRANGLER_VERSION pages deploy $OUT --project-name $PROJECT --branch $BRANCH"
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
npx --yes "wrangler@$WRANGLER_VERSION" pages deploy "$OUT" --project-name "$PROJECT" --branch "$BRANCH" 2>&1 | mask
