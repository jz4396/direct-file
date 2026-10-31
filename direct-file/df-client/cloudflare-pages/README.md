# Static client-only build on Cloudflare Pages

This directory deploys a **static, client-only** build of `df-client-app` to Cloudflare Pages on the free plan:
static assets only. There are no Pages Functions, no Workers, and no Cloudflare Containers. The build has no Direct
File backend, and **no return data ever leaves the browser**.

| File                 | Purpose                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `build.sh`           | Generate, build (`build:static`), `check:production-build`, stage and check into `out/`. No credentials. |
| `check-install.sh`   | Runs `build.sh --install`: lockfile install with no lifecycle scripts, then the production checks.       |
| `checkNoContainers.mjs` | Fails the build and the upload if the tree would use Cloudflare Containers. Plain Node.js.            |
| `deploy.sh`          | Direct upload from a workstation: `build.sh`, `checkNoSecrets.mjs`, then the pinned wrangler.            |
| `checkNoSecrets.mjs` | Fails if a staged file holds a deploy credential's value or a Cloudflare token. Prints file names only.  |
| `_headers`           | CSP (`base-uri 'none'`, `connect-src 'none'`, `form-action 'none'`, `frame-ancestors 'none'`) and others. |
| `_redirects`         | `/` → `/df/file/`.                                                                                       |
| `robots.txt`         | `Disallow: /`.                                                                                           |

There are two ways to publish `out/`; pick one per Pages project (a direct-upload project can't later be connected
to Git, and the reverse):

- **Git integration** (recommended): Cloudflare builds the repository with `build.sh --install`. No API token
  exists anywhere: not in the repo, not in a shell, not in Cloudflare's build settings.
- **Direct upload** with `deploy.sh`: you build locally and upload with an API token kept in your shell only.

Creating the Cloudflare account and the Pages project, and connecting the repository, are manual steps for the
repository owner in the Cloudflare dashboard. Nothing in this repository creates them.

## Cloudflare Containers are not part of Phase A

Phase A hosting is two pieces, and only the first one uses Cloudflare:

1. **Public client.** Cloudflare Pages on the free plan, static files only. Git integration runs
   `build.sh --install`. Direct upload runs `wrangler pages deploy` (and, one time, `wrangler pages project create`;
   local preview uses `wrangler pages dev`). Those are the only wrangler subcommands on this path.
2. **JVM and PDF stack.** Local Docker (`direct-file/scripts/local-docker.sh` and `docker-compose*.yaml`). That is
   Docker Engine on the machine running the stack. It is not Cloudflare Containers.

Cloudflare Containers attaches a container image to a Worker. It is a separate product from Pages and is not
included with the Pages free plan. This repository does not ship a Worker or a container image to Cloudflare.
Phase A does not require paid Cloudflare Containers.

`build.sh` (Git integration and direct upload) and `deploy.sh` (before the upload) run `checkNoContainers.mjs`.
The script exits 1, and the build or upload stops, when any of these is present:

- a `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc` that declares a containers binding (`[[containers]]`, a
  `containers =` assignment, or a `"containers"` key);
- a `package.json` that depends on `@cloudflare/containers`;
- a shell script, a file under this directory, or a GitHub Actions workflow that runs `wrangler containers`, runs
  `wrangler deploy` (a Worker deploy), or references `registry.cloudflare.com`;
- a `Dockerfile` under this directory.

`wrangler pages deploy` does not match that Worker-deploy check. Local `docker-compose` files and the Dockerfiles
under `backend/`, `submit/`, `status/`, and the other services are local Docker, so they are not an error.
`.github/workflows/no-cloudflare-containers.yml` runs the same script on pull requests and on pushes to `main`.
It does not deploy. The Pages project in the dashboard stays a static Pages project: no Containers binding, and the
build command stays `build.sh --install`.

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
| Content-Security-Policy (both the `<meta>` tag and the `_headers` header)                      | `base-uri 'none'`, `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `script-src 'self'`. The header also sends `frame-ancestors 'none'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
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
- **Unanswered Schedule B Part III does not knock the interview out.** `/flowKnockoutScheduleBPartIII` is complete
  false until line 8 is "Yes", Form 8938 is required, or the countries do not fit on line 7b. A Yes on line 7a
  prints, with question 2 and line 7b countries when FinCEN Form 114 is required and every country fits. A fresh
  return still offers Start on the checklist. The print is still refused through `/flowPrintRefuseScheduleBPartIII`
  when Part III is unanswered (including an unanswered question 2 or an unanswered "do the countries fit?" question),
  when line 7b is blank and FinCEN Form 114 is required, or when line 8, Form 8938, or "the countries do not fit" is
  the stop (2026 draft Instructions for Schedule B, PDF p. 4, Line 7b: "Attach a separate statement if you need more
  space"; FinCEN Form 114, 31 U.S.C. 5314; Form 8938, 26 U.S.C. 6038D; Form 3520, 26 U.S.C. 6048). The browser test
  enters About you through that Start control.
- The real-browser test (`npm run test:no-retention`) walks a golden end-to-end scenario (synthetic data): create,
  every income screen, autosave, read-back, review, and the PDF, sign, and submit attempts. Those attempts show a
  refusal. They do not download a PDF or open the submitted screen. PDF, sign, and submit are also covered by the
  happy-dom test below.
- `img-src 'self' data: blob:` still lets the app's own code request same-origin images. Nothing in the app
  builds image URLs from return data, and requests to other origins are blocked by the CSP.
- A CSP can't restrict top-level navigation (`location`, `window.open`). Only code in the bundle could use it to
  carry data in a URL, and nothing in the app does that.
- The interview content itself (screens, help text, links to irs.gov) is unchanged and still refers to the IRS and
  Direct File. The notice on every page is what marks the site as unofficial.

## Server build

No-retention applies only to this static client-only build. The Java API under `direct-file/backend` is a separate
server build. Tax-return create, update, and submit stay reachable whenever that server is running. This repository
does not claim that the server build keeps no return data.

## Checks

- `src/staticClient/staticClientNoNetwork.test.ts`: records every `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource` and `sendBeacon`, then runs the app's own code paths: create return, list, autosave with a golden
  end-to-end scenario (synthetic data), read back, keep-alive, and sign/submit/preview/import/status. It asserts
  that zero network calls were made, that exfiltration attempts are refused, and that no return data reached
  browser storage.
- `src/staticClient/noRetention/noRetention.e2e.ts` (`npm run test:no-retention`, which generates the fact
  dictionary, then builds and stages the site): pinned Chromium against the staged site, served on 127.0.0.1 with
  its own `_headers` and `_redirects`. It opens About you from the checklist Start control, types unique marker
  values into the interview (name, date of birth, address, phone), imports a golden end-to-end scenario (synthetic
  data) save file with a marker TIN and wage amount, and opens every income screen. It asserts that every request
  from the page and its workers is a
  same-origin `GET` with no body and no query string, for a staged file unless it is a page load,
  and with no marker in it (plain, JSON-escaped, URL-encoded, UTF-16, base64 or base64url, and the TIN even split
  into its parts) and no cookie. The local server records every request's URL, headers and body, and that log is
  the same set of method-and-path pairs the browser recorded for the scenario. Nothing goes to the `.invalid` API
  origin or any other origin and no WebSocket opens. A deliberate `fetch`, `XMLHttpRequest`, `sendBeacon`,
  `WebSocket`, `EventSource`, cross-origin image, form post, blob worker and cross-origin worker script are all
  refused. The CSP response header has `connect-src`, `form-action` and `frame-ancestors` `'none'`, `worker-src
  'self'` and `script-src 'self'`. `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, the origin private
  file system, cookies and service workers are empty after switching to Español, after the session and after a
  reload. Only
  "Save on this device" writes: one envelope with exactly the expected fields (PBKDF2-SHA-256 at the configured
  iterations, 16-byte salt, 12-byte IV, base64 AES-GCM ciphertext that opens with the passphrase only) and no
  marker, and "Clear all data on this device" removes it. It runs in the Chromium revision pinned by
  `playwright@1.64.0` (Chromium 156.0.8078.4, browsers.json revision 1248). Launch fails when `browser.version()`
  is not that `browserVersion`. `playwright@1.64.0` and `playwright-core@1.64.0` were published on 2026-10-07,
  are Apache-2.0, declare no lifecycle scripts, and are pinned in `direct-file/df-client/package-lock.json` by
  version and `sha512` integrity, so `npm ci --ignore-scripts` does not download a browser. CI rejects a lockfile or
  installed package that is not 1.64.0 or that declares `preinstall`, `install`, `postinstall` or `prepare`.
  Install that revision with `npx playwright install chromium` (CI uses `--with-deps`). The test makes no request
  off 127.0.0.1.
- `src/saveState/encryptedExportImport.e2e.ts` (same command): load a synthetic return, download it as an encrypted
  save file, clear all data on this device, reload, and import that file with the passphrase. The return comes
  back. The same file with a wrong passphrase shows the decrypt-failed message and leaves the open return unchanged.
  An encrypted file for another tax year shows the wrong-tax-year message and leaves the open return unchanged. The
  download is an AES-GCM envelope at the production PBKDF2 iteration count; the marker and the passphrase are not in
  the file and not in any request.
- `src/staticClient/staticBranding.test.tsx`: in static mode the layout shows the notice (English and Spanish), with
  no close control, no government banner, no IRS logo and no agency footer. The regular build still shows them.
- `src/staticClient/pagesConfig.test.ts`: the `_headers` CSP matches the CSP builder, including `base-uri 'none'`;
  `X-Robots-Tag`, `robots.txt`, the static title and description, and the `.env.static` values; the deploy tooling
  pin. It also runs the bundle checker on a good site and on one bad site per rule.
- `npm run stage:static` (`src/staticClient/checkStaticBundle.ts`) checks the built bundle before every deploy, and
  the deploy stops if it fails. It requires:

  - the headers (CSP with `base-uri 'none'`, `connect-src 'none'`, `frame-ancestors 'none'` and `form-action 'none'`,
    nosniff, DENY, `X-Robots-Tag: noindex`);
  - a static CSP `<meta>` on every HTML page, with no `'unsafe-eval'` or `'unsafe-inline'` in `script-src`, and no
    inline or third-party scripts;
  - the network guard and the `.invalid` API URL, and no other absolute API URL, `localhost:<port>` URL,
    analytics loader, tag manager, or test-data loader;
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
  `checkNoSecrets.mjs` fails on a staged file holding the value of `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  or `CLOUDFLARE_API_KEY`, or a prefixed token, naming the file and not the value; neither script turns on xtrace
  or echoes a credential. `check-install.sh` runs `build.sh --install` (npm ci --ignore-scripts, then
  `check:production-build` and `stage:static`). `checkNoContainers.mjs` accepts this repository and a tree whose
  only wrangler command is `wrangler pages deploy`, and it rejects a containers binding, the Containers SDK, a
  Worker deploy, a Containers command in a workflow, and a Dockerfile on the Pages path.
- `src/staticClient/noCommittedSecrets.test.ts`: no tracked file in the repository holds a prefixed Cloudflare token
  or assigns a Cloudflare credential variable a literal value.

## Deploy with Git integration (recommended)

Cloudflare clones the repository and runs `build.sh --install` on each push to the production branch. The build
installs the client's locked dependencies with `npm ci --ignore-scripts`, so no dependency install script runs,
and runs the same checks as `deploy.sh`. If a check fails, the build fails and nothing is published.
`check-install.sh` runs that command with Cloudflare credentials and `VITE_*` / `REACT_APP_*` variables removed.

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
`out/` with the credentials in its environment (it looks for the exact values of `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_KEY` when set, and prints only file names),
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
