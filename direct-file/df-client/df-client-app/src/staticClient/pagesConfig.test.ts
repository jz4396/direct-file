import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../saveState/contentSecurityPolicy.js';
import { checkStaticBundle, IRS_LOGO_FILES, OFFICIAL_SITE_STRINGS, staticBannerHeadings } from './checkStaticBundle.js';
import { BLOCKED_MESSAGE } from './networkGuard.js';
import { STATIC_BACKEND_URL } from './staticMode.js';
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
    expect(script).toMatch(/nocreds\(\) \{ env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID "\$@"; \}/);
    expect(script).toContain(`grep -E '^(VITE_|REACT_APP_)'`);
    expect(script).not.toMatch(/set -x|echo[^\n]*\$\{?CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)/);
  });
});

describe(`static bundle check`, () => {
  let dir = ``;
  const site = (files: Record<string, string>) => {
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

  it(`passes a static build`, () => {
    expect(checkStaticBundle(site(good))).toEqual([]);
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
  ] as [string, Record<string, string | undefined>, RegExp][])(`fails on %s`, (_label, override, expected) => {
    const files = Object.fromEntries(
      Object.entries({ ...good, ...override }).filter((e): e is [string, string] => e[1] !== undefined)
    );
    const problems = checkStaticBundle(site(files));
    expect(problems.some((p) => expected.test(p))).toBe(true);
  });
});
