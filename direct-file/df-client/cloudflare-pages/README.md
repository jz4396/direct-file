# Static client-only build on Cloudflare Pages

This directory deploys a **static, client-only** build of `df-client-app` to Cloudflare Pages on the free plan:
static assets only. There are no Pages Functions or Workers. The build has no Direct File backend, and **no return
data ever leaves the browser**.

| File                 | Purpose                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `build.sh`           | Generate, build (`build:static`), `check:production-build`, stage and check into `out/`. No credentials. |
| `deploy.sh`          | Direct upload from a workstation: `build.sh`, `checkNoSecrets.mjs`, then the pinned wrangler.            |
| `checkNoSecrets.mjs` | Fails if a staged file holds a deploy credential's value or a Cloudflare token. Prints file names only.  |
| `_headers`           | CSP (`connect-src 'none'`, `form-action 'none'`, `frame-ancestors 'none'`) and other headers.            |
| `_redirects`         | `/` → `/df/file/`.                                                                                       |
| `robots.txt`         | `Disallow: /`.                                                                                           |

There are two ways to publish `out/`; pick one per Pages project (a direct-upload project can't later be connected
to Git, and the reverse):

- **Git integration** (recommended): Cloudflare builds the repository with `build.sh --install`. No API token
  exists anywhere: not in the repo, not in a shell, not in Cloudflare's build settings.
- **Direct upload** with `deploy.sh`: you build locally and upload with an API token kept in your shell only.

Creating the Cloudflare account and the Pages project, and connecting the repository, are manual steps for the
repository owner in the Cloudflare dashboard. Nothing in this repository creates them.

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
  from the page and its workers is a same-origin `GET` with no body, for a staged file unless it is a page load,
  and with no marker in it (plain, JSON-escaped, URL-encoded, UTF-16, base64 or base64url, and the TIN even split
  into its parts); that nothing goes to the `.invalid` API origin or any other origin and no WebSocket opens; that
  a deliberate `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, cross-origin image and form
  post are all refused; that the CSP response header has `connect-src`, `form-action` and `frame-ancestors`
  `'none'`; and that `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, the origin private file system,
  cookies and service workers are empty after switching to Español, after the session and after a reload. Only
  "Save on this device" writes: one envelope with exactly the expected fields (PBKDF2-SHA-256 at the configured
  iterations, 16-byte salt, 12-byte IV, base64 AES-GCM ciphertext that opens with the passphrase only) and no
  marker, and "Clear all data on this device" removes it. It uses the installed Google Chrome (or `CHROME_PATH`)
  through `playwright-core`, downloads no browser and makes no request off 127.0.0.1.
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
  - no `fetch`, `sendBeacon`, `EventSource`, `WebSocket`, `XMLHttpRequest.open` or `importScripts` call with a URL
    literal on another origin (absolute or protocol-relative), no `ws://`/`wss://` URL, and no absolute data
    endpoint URL (`/api/`, `/graphql`, `/collect`, `/telemetry`, `/ingest`, `/beacon`, `/rum`, `/v1/events` and
    similar) except the `.invalid` API origin. Links to other sites (irs.gov, state sites) are allowed: they are
    pages a person opens, and the CSP and the guard stop the page itself from sending requests to them;
  - in every staged file (any type): no Cloudflare API key or token (`cfk_`, `cfut_`, `cfat_`, `cfoat_` prefixes),
    no `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_KEY` name, and no literal bearer token;
  - the notice text in English and Spanish;
  - `robots.txt` with `Disallow: /`, and a robots `noindex` `<meta>` on every page.

  It rejects:

  - any file under `favicon/`, any `.ico`, web app manifest or `browserconfig.xml`;
  - icon, apple-touch-icon, mask-icon and manifest `<link>` tags, `msapplication-*` and social card (`og:`, `twitter:`) `<meta>` tags, and references to a favicon;
  - any file with the same SHA-256 as main's seal and logo images (`public/favicon/*` and the IRS logos in `public/imgs/`, recorded in `src/staticClient/officialAssetHashes.ts`), under any name;

  - the government site banner text, in English or Spanish;
  - the agency name in any `<title>` or description;
  - IRS logo files, or references to them.

- `src/staticClient/pagesScripts.test.ts`: `build.sh` exits 2 when `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY` or a `VITE_*` variable is set, printing the name and not the value;
  `checkNoSecrets.mjs` fails on a staged file holding a credential's value or a prefixed token, naming the file and
  not the value; neither script turns on xtrace or echoes a credential.
- `src/staticClient/noCommittedSecrets.test.ts`: no tracked file in the repository holds a prefixed Cloudflare token
  or assigns a Cloudflare credential variable a literal value.

## Deploy with Git integration (recommended)

Cloudflare clones the repository and runs `build.sh --install` on each push to the production branch. The build
installs the client's locked dependencies with `npm ci --ignore-scripts`, so no dependency install script runs,
and runs the same checks as `deploy.sh`. If a check fails, the build fails and nothing is published.

Repository owner, one time, in the Cloudflare dashboard (**Workers & Pages → Create → Pages → Connect to Git**):

1. Authorize the Cloudflare GitHub app for this repository only.
2. Build settings:

   | Setting                | Value                                                            |
   | ---------------------- | ---------------------------------------------------------------- |
   | Production branch      | `main`                                                           |
   | Framework preset       | None                                                             |
   | Root directory         | _(empty: the repository root)_                                   |
   | Build command          | `bash direct-file/df-client/cloudflare-pages/build.sh --install` |
   | Build output directory | `direct-file/df-client/cloudflare-pages/out`                     |

3. Environment variables (Production and Preview): `SKIP_DEPENDENCY_INSTALL=1` (Pages' own install would run
   install scripts; `build.sh --install` installs without them) and `NODE_VERSION=20.19.2` (the version
   `build.sh` was checked with; the build doesn't need wrangler, so Node.js 22 isn't required). Add nothing else: no API
   token, and no `VITE_*` or `REACT_APP_*` variable (`build.sh` refuses to run with either).
4. **Settings → Builds & deployments**: set preview deployments to **None** (or to `main` only), so branches other
   than `main` aren't built or published.
5. Optional: build watch paths `direct-file/df-client/*` and `direct-file/backend/src/main/resources/tax/*` (the
   fact dictionary XML the build reads).

The site is served at `https://<project>.pages.dev/`, and `/` redirects to `/df/file/`.

## Deploy with direct upload (manual)

There is intentionally no CI workflow. Deploys run from a workstation with `deploy.sh`. It needs Node.js 22 or
later, because wrangler 4.149.0 requires it. The client build itself also runs on Node.js 20.

Steps 1 and 3 are for the repository owner and are done by hand; nothing in the repo performs them.

1. In the Cloudflare dashboard, create an API token with only **Account → Cloudflare Pages → Edit**, scoped to
   your account. Note your account ID. Never put the token in Cloudflare build settings, a file in this repo, a
   command line or an issue.
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
line. It runs `build.sh` (generation, build, checks, staging) and `npm ci` under
`env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CLOUDFLARE_API_KEY`, then runs `checkNoSecrets.mjs` on
`out/` with the credentials in its environment (it looks for their exact values and prints only file names),
masks both values in wrangler's output, and sets `WRANGLER_SEND_METRICS=false`.

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
../cloudflare-pages/build.sh        # or: npm run generate-fact-dictionary && npm run build:static && npm run stage:static
cd ../cloudflare-pages && npm ci --ignore-scripts
./node_modules/.bin/wrangler pages dev out   # serves _headers and _redirects locally
```
