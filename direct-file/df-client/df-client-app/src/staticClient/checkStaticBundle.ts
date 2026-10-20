import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
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
 * - The site doesn't present itself as the official service: the unofficial-preview banner (English and Spanish) is
 *   in the bundle; there is no government site banner or IRS logo; no page title or description names the agency;
 *   and search engines are told not to index it (X-Robots-Tag, robots.txt, and a robots <meta> on every page).
 */
export const REQUIRED_HEADERS = [
  /Content-Security-Policy:[^\n]*connect-src 'none'/,
  /Content-Security-Policy:[^\n]*frame-ancestors 'none'/,
  /Content-Security-Policy:[^\n]*form-action 'none'/,
  /X-Content-Type-Options: nosniff/,
  /X-Frame-Options: DENY/,
  /X-Robots-Tag:[^\n]*noindex/,
];

/** The IRS logo images in public/imgs. The static build doesn't reference them and staging leaves them out. */
export const IRS_LOGO_FILES = [`irs-df-logo.svg`, `irs-logo.svg`, `irs-logo-dark.svg`, `irs_logo_bk.svg`];

/** Text of the government site banner (@trussworks/react-uswds GovBanner), English and Spanish. */
export const OFFICIAL_SITE_STRINGS = [
  `An official website of the United States government`,
  `Un sitio oficial del Gobierno de Estados Unidos`,
  `Official government website`,
];

const AGENCY_IN_TITLE = /Internal Revenue Service|Servicio de Impuestos Internos/;

/** The unofficial-preview banner headings (locales/{en,es}.staticClient.yaml), which must ship in the bundle. */
export function staticBannerHeadings(): string[] {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), `..`, `locales`);
  return [`en`, `es`].map((lang) => {
    const doc = yaml.load(fs.readFileSync(path.join(dir, `${lang}.staticClient.yaml`), `utf8`)) as {
      staticClient: { banner: { heading: string } };
    };
    return doc.staticClient.banner.heading;
  });
}

const ROBOTS_DISALLOW_ALL = (text: string) => /^User-agent: \*$/m.test(text) && /^Disallow: \/$/m.test(text);

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

  if (!fs.existsSync(path.join(siteDir, `robots.txt`))) problems.push(`robots.txt is missing at the site root`);
  for (const f of files.filter((f) => path.basename(f) === `robots.txt`)) {
    if (!ROBOTS_DISALLOW_ALL(fs.readFileSync(f, `utf8`))) problems.push(`${rel(f)}: doesn't disallow all crawlers`);
  }
  for (const f of files.filter((f) => IRS_LOGO_FILES.includes(path.basename(f)))) {
    problems.push(`${rel(f)}: IRS logo file is staged`);
  }

  const html = files.filter((f) => f.endsWith(`.html`));
  if (html.length === 0) problems.push(`no HTML pages`);
  for (const f of html) {
    const text = fs.readFileSync(f, `utf8`);
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(text);
    if (!meta || !meta[1].includes(`connect-src 'none'`)) problems.push(`${rel(f)}: no static CSP <meta>`);
    const scriptSrc = meta ? /(?:^|;)\s*script-src ([^;]*)/.exec(meta[1])?.[1] ?? `` : ``;
    if (/'unsafe-(eval|inline)'/.test(scriptSrc)) problems.push(`${rel(f)}: CSP script-src allows ${scriptSrc}`);
    const title = /<title>([^<]*)<\/title>/.exec(text)?.[1] ?? ``;
    if (AGENCY_IN_TITLE.test(title)) problems.push(`${rel(f)}: <title> names the agency`);
    const description = /<meta name="description" content="([^"]*)"/.exec(text)?.[1] ?? ``;
    if (AGENCY_IN_TITLE.test(description)) problems.push(`${rel(f)}: description names the agency`);
    if (!/<meta name="robots" content="[^"]*noindex/.test(text)) problems.push(`${rel(f)}: no robots noindex <meta>`);
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
  const headings = staticBannerHeadings();
  const sawHeading = headings.map(() => false);
  for (const f of assets) {
    const text = fs.readFileSync(f, `utf8`);
    headings.forEach((h, i) => {
      if (text.includes(h)) sawHeading[i] = true;
    });
    for (const s of OFFICIAL_SITE_STRINGS) if (text.includes(s)) problems.push(`${rel(f)}: contains "${s}"`);
    for (const logo of IRS_LOGO_FILES) if (text.includes(logo)) problems.push(`${rel(f)}: references ${logo}`);
    if (text.includes(BLOCKED_MESSAGE)) sawGuard = true;
    if (text.includes(STATIC_BACKEND_URL)) sawStaticBackend = true;
    for (const [re, what] of FORBIDDEN_IN_ASSETS) if (re.test(text)) problems.push(`${rel(f)}: contains ${what}`);
    for (const m of text.matchAll(/https?:\/\/[^\s'"`)]*\/df\/file\/api\//g)) {
      if (m[0] !== STATIC_BACKEND_URL) problems.push(`${rel(f)}: backend URL ${m[0]}`);
    }
  }
  if (js.length === 0) problems.push(`no JavaScript assets`);
  if (!sawGuard) problems.push(`network guard not found in the bundle (not built with --mode static?)`);
  headings.forEach((h, i) => {
    if (!sawHeading[i]) problems.push(`unofficial-preview banner text not found in the bundle: "${h}"`);
  });
  if (!sawStaticBackend) problems.push(`static backend URL not found in the bundle (not built with --mode static?)`);
  return problems;
}
