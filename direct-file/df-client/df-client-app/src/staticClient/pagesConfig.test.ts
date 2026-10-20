import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../saveState/contentSecurityPolicy.js';
import { checkStaticBundle } from './checkStaticBundle.js';
import { BLOCKED_MESSAGE } from './networkGuard.js';
import { STATIC_BACKEND_URL } from './staticMode.js';
import { stripAnalyticsSnippet } from './stripAnalyticsSnippet.js';

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

  const goodHtml = `<html><head><meta http-equiv="Content-Security-Policy" content="${buildContentSecurityPolicy(
    undefined,
    { staticClientOnly: true }
  )}"><script type="module" src="/df/file/assets/main.js"></script></head></html>`;
  const good = {
    _headers: read(path.join(PAGES, `_headers`)),
    'index.html': goodHtml,
    'df/file/index.html': goodHtml,
    'df/file/assets/main.js': `const b="${STATIC_BACKEND_URL}";throw new TypeError("${BLOCKED_MESSAGE}");`,
  };

  it(`passes a static build`, () => {
    expect(checkStaticBundle(site(good))).toEqual([]);
  });

  it.each([
    [`a localhost API URL`, { 'df/file/assets/x.js': `fetch("http://localhost:8080/df/file/api/v1/taxreturns")` }],
    [`another backend URL`, { 'df/file/assets/x.js': `const u="https://api.example.com/df/file/api/";` }],
    [`the analytics loader`, { 'df/file/assets/x.js': `"https://www.googletagmanager.com/gtm.js"` }],
    [`an inline script`, { 'index.html': goodHtml.replace(`</head>`, `<script>alert(1)</script></head>`) }],
    [`a third-party script`, { 'index.html': goodHtml.replace(`/df/file/assets/main.js`, `https://cdn.example/x.js`) }],
    [`a page without the static CSP`, { 'index.html': `<html><head></head></html>` }],
    [`missing headers`, { _headers: `/*\n  X-Frame-Options: DENY\n` }],
    [`a bundle without the guard (regular build)`, { 'df/file/assets/main.js': `const b="${STATIC_BACKEND_URL}";` }],
  ])(`fails on %s`, (_label, override) => {
    expect(checkStaticBundle(site({ ...good, ...override })).length).toBeGreaterThan(0);
  });
});
