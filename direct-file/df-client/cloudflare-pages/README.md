# Static client-only build on Cloudflare Pages

This directory deploys a **static, client-only** build of `df-client-app` to Cloudflare Pages on the free plan:
static assets only, uploaded directly. There are no Pages Functions or Workers. The build has no Direct File
backend, and **no return data ever leaves the browser**.

## What the static build changes

`npm run build:static` runs `vite build --mode static`, which loads `df-client-app/.env.static`
(`VITE_STATIC_CLIENT_ONLY=true`).

| Area                                                                                           | Static build behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend API (`VITE_BACKEND_URL`)                                                               | Points at `https://df-static-client.invalid/df/file/api/`. `.invalid` is reserved and never resolves. The network guard answers these requests in the page (`src/staticClient/localApi.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tax return storage                                                                             | Memory only (a module-level array in `localApi.ts`). Autosave writes there. Nothing goes to `localStorage`, `sessionStorage` or IndexedDB (not even the language choice), and a reload starts over. To keep work across reloads, use the Device data page (the encrypted save on this device, or a save file).                                                                                                                                                                                                                                                                                                                                                                          |
| Create, list, read, autosave, delete a return; session keep-alive                              | Answered locally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PDF, preview, sign, submit, submission status, data import (`/populate`), state transfer       | Return `501 {"message":"not-available-in-static-client"}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `fetch` to anything else, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` | Blocked in the page (`src/staticClient/networkGuard.ts`). They throw, or `sendBeacon` returns `false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Content-Security-Policy (both the `<meta>` tag and the `_headers` header)                      | `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `script-src 'self'`. The header also sends `frame-ancestors 'none'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Analytics (GTM)                                                                                | Both the script and the `<noscript>` iframe are removed from `index.html` at build time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Telemetry, devtools, test-data loading, data import, state transfer, auto sign-out             | Off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Sign-out link                                                                                  | Clears browser storage, then does a full page load to `/df/file/home?signed-out=1`. That drops the in-memory return.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Branding                                                                                       | No government site banner, no IRS logos, and no agency identifier footer. Every page shows a notice in English and Spanish that can't be dismissed: "Unofficial preview. Not affiliated with the IRS." It says the preview can't e-file or print, and that answers stay in the browser and a reload clears them. The header home link is text ("Direct File preview"). There are no site icons: the favicon, home-screen, pinned-tab and tile icons and the web app manifest (the IRS seal) are removed from `index.html` and left out of the staged site, so browsers show their default icon. A browser that still asks for `/favicon.ico` gets the HTML fallback page, not an image. |
| Title and description                                                                          | `index.html` and the per-page titles name an unofficial preview, not the agency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Search engines                                                                                 | `X-Robots-Tag: noindex, nofollow` on every path, a robots `<meta>` on every page, and `robots.txt` with `Disallow: /`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Also served on every path (`_headers`): `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, and a restrictive `Permissions-Policy`.

### Known gaps

- **There's no primary filer TIN or email.** In the regular app these come from sign-in and are read-only, so a
  static-client return can't reach a complete, fileable state.
- **There's no PDF, signing or e-file.** The static build is for working through the interview only.
- The real-browser test (`npm run test:no-retention`) covers the interview's first screens, the save file import and
  the device save. It doesn't yet walk every income screen or the review, PDF, sign and submit attempts; those
  backend-only calls are covered by the happy-dom test below.
- `img-src 'self' data: blob:` still lets the app's own code request same-origin images. Nothing in the app
  builds image URLs from return data, and requests to other origins are blocked by the CSP.
- A CSP can't restrict top-level navigation (`location`, `window.open`). Only code in the bundle could use it to
  carry data in a URL, and nothing in the app does that.
- The interview content itself (screens, help text, links to irs.gov) is unchanged and still refers to the IRS and
  Direct File. The notice on every page is what marks the site as unofficial.

## Checks

- `src/staticClient/staticClientNoNetwork.test.ts`: records every `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource` and `sendBeacon`, then runs the app's own code paths: create return, list, autosave with a golden
  end-to-end scenario (synthetic data), read back, keep-alive, and sign/submit/preview/import/status. It asserts
  that zero network calls were made, that exfiltration attempts are refused, and that no return data reached
  browser storage.
- `src/staticClient/noRetention/noRetention.e2e.ts` (`npm run test:no-retention`, which builds and stages the site
  first): headless Chrome against the staged site, served on 127.0.0.1 with its own `_headers` and `_redirects`.
  It types unique marker values into the interview (name, date of birth, address, phone) and imports a golden
  end-to-end scenario (synthetic data) save file with a marker TIN and wage amount. It asserts that every request
  from the page and its workers is a same-origin static asset `GET` with no body and no marker (plain, URL-encoded
  or base64); that nothing goes to the `.invalid` API origin or any other origin; that a deliberate `fetch`,
  `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, cross-origin image and form post are all refused;
  that the CSP response header has `connect-src`, `form-action` and `frame-ancestors` `'none'`; and that
  `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies and service workers are empty after the
  session and after a reload. Only "Save on this device" writes, one AES-GCM envelope with no marker in it, and
  "Clear all data on this device" removes it. It uses the installed Google Chrome (or `CHROME_PATH`) through
  `playwright-core`, downloads no browser and makes no request off 127.0.0.1.
- `src/staticClient/staticBranding.test.tsx`: in static mode the layout shows the notice (English and Spanish), with
  no close control, no government banner, no IRS logo and no agency footer. The regular build still shows them.
- `src/staticClient/pagesConfig.test.ts`: the `_headers` CSP matches the CSP builder; `X-Robots-Tag`, `robots.txt`,
  the static title and description, and the `.env.static` values; the deploy tooling pin. It also runs the bundle
  checker on a good site and on one bad site per rule.
- `npm run stage:static` (`src/staticClient/checkStaticBundle.ts`) checks the built bundle before every deploy, and
  the deploy stops if it fails. It requires:

  - the headers (CSP with `connect-src 'none'`, `frame-ancestors 'none'` and `form-action 'none'`, nosniff, DENY,
    `X-Robots-Tag: noindex`);
  - a static CSP `<meta>` on every HTML page, with no `'unsafe-eval'` or `'unsafe-inline'` in `script-src`, and no
    inline or third-party scripts;
  - the network guard and the `.invalid` API URL, and no other absolute API URL, `localhost:<port>` URL or
    analytics loader;
  - the notice text in English and Spanish;
  - `robots.txt` with `Disallow: /`, and a robots `noindex` `<meta>` on every page.

  It rejects:

  - any file under `favicon/`, any `.ico`, web app manifest or `browserconfig.xml`;
  - icon, apple-touch-icon, mask-icon and manifest `<link>` tags, `msapplication-*` and social card (`og:`, `twitter:`) `<meta>` tags, and references to a favicon;
  - any file with the same SHA-256 as main's seal and logo images (`public/favicon/*` and the IRS logos in `public/imgs/`, recorded in `src/staticClient/officialAssetHashes.ts`), under any name;

  - the government site banner text, in English or Spanish;
  - the agency name in any `<title>` or description;
  - IRS logo files, or references to them.

## Deploy (manual)

There is intentionally no CI workflow. Deploys run from a workstation with `deploy.sh`. It needs Node.js 22 or
later, because wrangler 4.149.0 requires it. The client build itself also runs on Node.js 20.

1. In the Cloudflare dashboard, create an API token with only **Account → Cloudflare Pages → Edit**, scoped to
   your account. Note your account ID.
2. Export the credentials in your shell. Never commit them or paste them into files in this repo. Also make sure
   no `VITE_*` or `REACT_APP_*` variables are set: they would override `.env.static`, so `deploy.sh` refuses to run.
   ```sh
   export CLOUDFLARE_API_TOKEN=...      # read by wrangler from the environment
   export CLOUDFLARE_ACCOUNT_ID=...
   ```
3. One time only, install the pinned tooling and create the Pages project (direct upload, production branch
   `main`):
   ```sh
   cd direct-file/df-client/cloudflare-pages
   npm ci --ignore-scripts
   ./node_modules/.bin/wrangler pages project create direct-file-static --production-branch main
   ```
4. Build, check and deploy:
   ```sh
   direct-file/df-client/cloudflare-pages/deploy.sh             # or --dry-run to build and check only
   ```
   `CF_PAGES_PROJECT` and `CF_PAGES_BRANCH` override the project name (default `direct-file-static`) and the branch
   (default `main`). The site is served at `https://<project>.pages.dev/`, and `/` redirects to `/df/file/`.

`deploy.sh` exit codes:

- `0`: deployed, or the dry run passed. `--dry-run` needs no credentials.
- `2`: a setup problem, with a one-line hint: missing credentials, `VITE_*` or `REACT_APP_*` set in the shell,
  Node.js older than 22, or a bad project or branch name.
- Anything else: the build, the check, the install or the upload failed.

`deploy.sh` never prints the token or the account ID. It keeps xtrace off and passes neither value on a command
line. It runs the fact-dictionary generation, the build, the check and `npm ci` under
`env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID`, masks both values in wrangler's output, and sets
`WRANGLER_SEND_METRICS=false`.

### Free-plan limits

The site is static files only: about 60 files and 12 MB. The largest file, the main JS chunk, is about 10 MB. That
is within the Pages limits of 20,000 files and 25 MiB per file. Uploads count toward the free plan's monthly build
and deploy allowance.

### Deploy tooling and supply-chain screen

`package.json` pins `wrangler` at exactly `4.149.0`, and `package-lock.json` pins every transitive dependency by
version and `sha512` integrity. `deploy.sh` installs them with `npm ci --ignore-scripts`. The lockfile isn't part
of the client workspaces, so the client lockfiles don't change.

Screen of the lockfile (91 entries; 35 install on linux-x64):

- **Publish dates:** none are newer than 7 days. Wrangler and miniflare were published 2026-10-08, and workerd
  2026-10-06. The lockfile was resolved with `--before` a week back.
- **Install scripts:** `esbuild`, `workerd` and `fsevents` (macOS only, optional) declare them. They don't run with
  `--ignore-scripts`, and none are needed: esbuild and workerd load their platform binaries from the
  `@esbuild/<platform>` and `@cloudflare/workerd-<platform>` optional packages at run time. `wrangler --version`,
  `wrangler pages deploy --help`, esbuild's `transformSync` and `workerd --version` all work after an install
  without scripts. A static assets deploy uses neither esbuild nor workerd.
- **Signatures and provenance:** `npm audit signatures` verifies registry signatures for all 35 installed
  packages. 21 have provenance attestations, including wrangler, miniflare, workerd, esbuild and their platform
  binaries.
- **Advisories:** `npm audit` reports 0 vulnerabilities. No package is deprecated.

When you bump wrangler, regenerate the lockfile with
`npm install --package-lock-only --ignore-scripts --before=<a week ago>`, and repeat the screen.

## Local preview

```sh
cd direct-file/df-client/df-client-app
npm run generate-fact-dictionary && npm run build:static && npm run stage:static
cd ../cloudflare-pages && npm ci --ignore-scripts
./node_modules/.bin/wrangler pages dev out   # serves _headers and _redirects locally
```
