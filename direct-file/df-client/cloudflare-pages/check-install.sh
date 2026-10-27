#!/usr/bin/env bash
# Run the Cloudflare Pages Git-integration build and require it to pass. See README.md.
#
#   ./check-install.sh
#
# Pages runs `bash direct-file/df-client/cloudflare-pages/build.sh --install`: npm ci --ignore-scripts
# from the client lockfile (no dependency lifecycle scripts), then fact-dictionary generation,
# build:static, check:production-build and stage:static. This check drops Cloudflare credentials and
# VITE_*/REACT_APP_* variables first, which is how that build environment is set. It prints no values.
set -euo pipefail
set +x

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

unset_args=()
while IFS= read -r name; do
  unset_args+=(-u "$name")
done < <(compgen -e | grep -E '^(CLOUDFLARE_|VITE_|REACT_APP_)' || true)

exec env "${unset_args[@]}" bash "$HERE/build.sh" --install
