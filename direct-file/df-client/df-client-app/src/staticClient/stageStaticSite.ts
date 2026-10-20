/**
 * Stage the static client-only build for Cloudflare Pages and check it (checkStaticBundle.ts).
 *
 *   npm run build:static        # vite build --mode static -> dist-static/
 *   npm run stage:static        # dist-static/ + ../cloudflare-pages/_headers, _redirects -> ../cloudflare-pages/out/
 *                               # (stageStaticSiteCli.ts)
 *
 * Layout of the staged site: the client under /df/file/ (its build base), `_headers` and `_redirects` at the root,
 * and a copy of index.html at the root so Pages' single-page-app fallback serves the client for any route.
 * Exits non-zero, and deploy.sh stops, if the check finds a problem.
 */
import fs from 'fs';
import path from 'path';
import { checkStaticBundle } from './checkStaticBundle.js';

export const DIST = path.resolve(`dist-static`);
export const PAGES = path.resolve(`../cloudflare-pages`);
export const OUT = path.join(PAGES, `out`);

export function stageStaticSite(dist = DIST, out = OUT, pages = PAGES): string[] {
  if (!fs.existsSync(path.join(dist, `index.html`))) return [`${dist}/index.html not found: run npm run build:static`];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, `df`), { recursive: true });
  fs.cpSync(dist, path.join(out, `df`, `file`), { recursive: true });
  fs.copyFileSync(path.join(dist, `index.html`), path.join(out, `index.html`));
  for (const f of [`_headers`, `_redirects`]) fs.copyFileSync(path.join(pages, f), path.join(out, f));
  return checkStaticBundle(out);
}
