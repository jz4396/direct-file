import fs from 'fs';
import path from 'path';
import { BLOCKED_MESSAGE } from './networkGuard.js';
import { STATIC_BACKEND_URL } from './staticMode.js';

/**
 * Checks a staged static client-only site (stageStaticSite.ts) before it is deployed. Returns a list of problems;
 * an empty list means the bundle passed.
 *
 * - `_headers` sends a CSP with `connect-src 'none'` and `frame-ancestors 'none'`, plus nosniff and DENY framing.
 * - Every HTML page carries the static CSP <meta> (`connect-src 'none'`) and has no inline or third-party script.
 * - The JavaScript was built in static mode: it contains the network guard and the `.invalid` backend URL, and no
 *   other backend URL (a localhost API, or any absolute `.../df/file/api/` URL) or analytics loader.
 */
export const REQUIRED_HEADERS = [
  /Content-Security-Policy:[^\n]*connect-src 'none'/,
  /Content-Security-Policy:[^\n]*frame-ancestors 'none'/,
  /Content-Security-Policy:[^\n]*form-action 'none'/,
  /X-Content-Type-Options: nosniff/,
  /X-Frame-Options: DENY/,
];

const FORBIDDEN_IN_ASSETS: [RegExp, string][] = [
  [/localhost:\d+/, `a localhost URL`],
  [/googletagmanager\.com/, `the analytics loader`],
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export function checkStaticBundle(siteDir: string): string[] {
  const problems: string[] = [];
  const rel = (f: string) => path.relative(siteDir, f);
  if (!fs.existsSync(siteDir)) return [`${siteDir} does not exist`];
  const files = walk(siteDir);

  const headersFile = path.join(siteDir, `_headers`);
  if (!fs.existsSync(headersFile)) {
    problems.push(`_headers is missing`);
  } else {
    const headers = fs.readFileSync(headersFile, `utf8`);
    for (const re of REQUIRED_HEADERS) if (!re.test(headers)) problems.push(`_headers lacks ${re.source}`);
  }

  const html = files.filter((f) => f.endsWith(`.html`));
  if (html.length === 0) problems.push(`no HTML pages`);
  for (const f of html) {
    const text = fs.readFileSync(f, `utf8`);
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(text);
    if (!meta || !meta[1].includes(`connect-src 'none'`)) problems.push(`${rel(f)}: no static CSP <meta>`);
    for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const src = /\bsrc="([^"]*)"/.exec(m[1])?.[1];
      if (!src) problems.push(`${rel(f)}: inline <script>`);
      else if (/^(https?:)?\/\//.test(src)) problems.push(`${rel(f)}: third-party script ${src}`);
    }
  }

  const assets = files.filter((f) => /\.(js|mjs|html|css)$/.test(f));
  const js = assets.filter((f) => /\.m?js$/.test(f));
  let sawGuard = false;
  let sawStaticBackend = false;
  for (const f of assets) {
    const text = fs.readFileSync(f, `utf8`);
    if (text.includes(BLOCKED_MESSAGE)) sawGuard = true;
    if (text.includes(STATIC_BACKEND_URL)) sawStaticBackend = true;
    for (const [re, what] of FORBIDDEN_IN_ASSETS) if (re.test(text)) problems.push(`${rel(f)}: contains ${what}`);
    for (const m of text.matchAll(/https?:\/\/[^\s'"`)]*\/df\/file\/api\//g)) {
      if (m[0] !== STATIC_BACKEND_URL) problems.push(`${rel(f)}: backend URL ${m[0]}`);
    }
  }
  if (js.length === 0) problems.push(`no JavaScript assets`);
  if (!sawGuard) problems.push(`network guard not found in the bundle (not built with --mode static?)`);
  if (!sawStaticBackend) problems.push(`static backend URL not found in the bundle (not built with --mode static?)`);
  return problems;
}
