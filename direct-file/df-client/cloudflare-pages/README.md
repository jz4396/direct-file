# Static client-only build on Cloudflare Pages

This directory deploys a **static, client-only** build of `df-client-app` to Cloudflare Pages on the free plan:
static assets only, uploaded directly. There are no Pages Functions or Workers. The build has no Direct File
backend, and **no return data ever leaves the browser**.

## What the static build changes

`npm run build:static` runs `vite build --mode static`, which loads `df-client-app/.env.static`
(`VITE_STATIC_CLIENT_ONLY=true`).

| Area                                                                                           | Static build behavior                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend API (`VITE_BACKEND_URL`)                                                               | Points at `https://df-static-client.invalid/df/file/api/`. `.invalid` is reserved and never resolves. The network guard answers these requests in the page (`src/staticClient/localApi.ts`).                                                                                    |
| Tax return storage                                                                             | Memory only (a module-level array in `localApi.ts`). Autosave writes there. Nothing goes to `localStorage`, `sessionStorage` or IndexedDB, and a reload starts over. To keep work across reloads, use the Device data page (the encrypted save on this device, or a save file). |
| Create, list, read, autosave, delete a return; session keep-alive                              | Answered locally.                                                                                                                                                                                                                                                               |
| PDF, preview, sign, submit, submission status, data import (`/populate`), state transfer       | Return `501 {"message":"not-available-in-static-client"}`.                                                                                                                                                                                                                      |
| `fetch` to anything else, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` | Blocked in the page (`src/staticClient/networkGuard.ts`). They throw, or `sendBeacon` returns `false`.                                                                                                                                                                          |
| Content-Security-Policy (both the `<meta>` tag and the `_headers` header)                      | `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `script-src 'self'`. The header also sends `frame-ancestors 'none'`.                                                                                                                                            |
| Analytics (GTM)                                                                                | Both the script and the `<noscript>` iframe are removed from `index.html` at build time.                                                                                                                                                                                        |
| Telemetry, devtools, test-data loading, data import, state transfer, auto sign-out             | Off.                                                                                                                                                                                                                                                                            |
| Sign-out link                                                                                  | Clears browser storage, then does a full page load to `/df/file/home?signed-out=1`. That drops the in-memory return.                                                                                                                                                            |

Also served on every path (`_headers`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, and a restrictive `Permissions-Policy`.

### Known gaps

- **There's no primary filer TIN or email.** In the regular app these come from sign-in and are read-only, so a
  static-client return can't reach a complete, fileable state.
- **There's no PDF, signing or e-file.** The static build is for working through the interview only.
- The automated proof runs in vitest with happy-dom, plus a bundle scan. It isn't a real-browser end-to-end run.
- `img-src 'self' data: blob:` still lets the app's own code request same-origin images. Nothing in the app
  builds image URLs from return data, and requests to other origins are blocked by the CSP.

## No-network checks

- `src/staticClient/staticClientNoNetwork.test.ts`: records every `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource` and `sendBeacon`, then runs the app's own code paths: create return, list, autosave with a golden
  end-to-end scenario (synthetic data), read back, keep-alive, and sign/submit/preview/import/status. It asserts
  that zero network calls were made, that exfiltration attempts are refused, and that no return data reached
  browser storage.
- `src/staticClient/pagesConfig.test.ts`: checks that the `_headers` CSP matches the CSP builder, checks the
  `.env.static` values, and tests the bundle checker against good and bad sites.
- `npm run stage:static` (`src/staticClient/checkStaticBundle.ts`) scans the built bundle before every deploy. It
  checks the headers, that every HTML page has the static CSP, and that there are no inline or third-party
  scripts. It also checks there are no `localhost:<port>` or analytics URLs, that every absolute API URL is the
  `.invalid` one, and that the network guard is present. If any check fails, the deploy stops.

## Deploy (manual)

There is intentionally no CI workflow. Deploys run from a workstation with `deploy.sh`.

1. In the Cloudflare dashboard, create an API token with only **Account → Cloudflare Pages → Edit**, scoped to
   your account. Note your account ID.
2. Export the credentials in your shell. Never commit them or paste them into files in this repo.
   ```sh
   export CLOUDFLARE_API_TOKEN=...      # read by wrangler from the environment
   export CLOUDFLARE_ACCOUNT_ID=...
   ```
3. One time only, create the Pages project (direct upload, production branch `main`):
   ```sh
   npx --yes wrangler@4.149.0 pages project create direct-file-static --production-branch main
   ```
4. Build, check and deploy:
   ```sh
   direct-file/df-client/cloudflare-pages/deploy.sh             # or --dry-run to build and check only
   ```
   `CF_PAGES_PROJECT` and `CF_PAGES_BRANCH` override the project name (default `direct-file-static`) and the branch
   (default `main`). The site is served at `https://<project>.pages.dev/`, and `/` redirects to `/df/file/`.

`deploy.sh` never prints the token or the account ID. It keeps xtrace off, passes neither value on a command line,
masks both in wrangler's output, and sets `WRANGLER_SEND_METRICS=false`.

### Free-plan limits

The site is static files only: about 64 files and 12 MB. The largest file, the main JS chunk, is about 10 MB. That
is within the Pages limits of 20,000 files and 25 MiB per file. Uploads count toward the free plan's monthly build
and deploy allowance.

### Wrangler version screen

`wrangler@4.149.0` is pinned in `deploy.sh` and run through `npx`. It isn't a project dependency, so the
lockfiles don't change. When screened, this version:

- was published 2026-10-08 by Cloudflare's npm publisher, with an npm provenance attestation;
- has no install scripts of its own;
- depends on `workerd` and `esbuild`, which use `postinstall` to fetch their platform binaries;
- has no known advisories.

When you bump the version, pick a release that is at least a week old and check it the same way.

## Local preview

```sh
cd df-client/df-client-app
npm run generate-fact-dictionary && npm run build:static && npm run stage:static
npx --yes wrangler@4.149.0 pages dev ../cloudflare-pages/out   # serves _headers and _redirects locally
```
