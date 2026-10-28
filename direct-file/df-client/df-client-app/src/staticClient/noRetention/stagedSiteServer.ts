import fs from 'fs';
import http, { type IncomingHttpHeaders } from 'http';
import path from 'path';
import type { AddressInfo } from 'net';

/**
 * Minimal local stand-in for Cloudflare Pages, used by the no-retention browser test (noRetention.e2e.ts). It serves
 * the staged static site (`npm run stage:static` output) the way Pages does:
 *
 * - the `/*` block of `_headers` is sent on every response, so the browser enforces the real CSP header;
 * - `_redirects` rules of the form `<from> <to> <status>` (exact paths only, which is all the site uses);
 * - any path that isn't a file gets the root `index.html` (Pages' single-page-app fallback, since there is no
 *   404.html).
 *
 * Only GET and HEAD are answered. Every request is recorded, including its headers, and the server listens on
 * 127.0.0.1 only. The no-retention test scans that log for a query string, a cookie, or a marker.
 */
export type ServedRequest = { method: string; url: string; headers: string; body: string };

/** One line per header, names sorted, so a test can search the log without depending on Node's key order. */
export function formatRequestHeaders(headers: IncomingHttpHeaders): string {
  return Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(`, `) : value ?? ``}`)
    .join(`\n`);
}

export type StagedSiteServer = {
  origin: string;
  requests: ServedRequest[];
  close: () => Promise<void>;
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': `text/html; charset=utf-8`,
  '.js': `text/javascript; charset=utf-8`,
  '.css': `text/css; charset=utf-8`,
  '.json': `application/json`,
  '.svg': `image/svg+xml`,
  '.png': `image/png`,
  '.ico': `image/x-icon`,
  '.woff': `font/woff`,
  '.woff2': `font/woff2`,
  '.ttf': `font/ttf`,
  '.txt': `text/plain; charset=utf-8`,
  '.map': `application/json`,
};

/** Headers from the `/*` block of a Pages `_headers` file. */
export function parseCatchAllHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let inCatchAll = false;
  for (const line of text.split(`\n`)) {
    if (!line.trim() || line.trim().startsWith(`#`)) continue;
    if (!/^\s/.test(line)) {
      inCatchAll = line.trim() === `/*`;
      continue;
    }
    if (!inCatchAll) continue;
    const i = line.indexOf(`:`);
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

/** Exact-path rules from a Pages `_redirects` file. */
export function parseRedirects(text: string): Map<string, { to: string; status: number }> {
  const rules = new Map<string, { to: string; status: number }>();
  for (const line of text.split(`\n`)) {
    const t = line.trim();
    if (!t || t.startsWith(`#`)) continue;
    const [from, to, status] = t.split(/\s+/);
    if (from && to) rules.set(from, { to, status: Number(status ?? 302) });
  }
  return rules;
}

/** Resolve a URL path to a file under `root`, or undefined. Paths that escape `root` are never served. */
function resolveFile(root: string, urlPath: string): string | undefined {
  const candidate = path.resolve(root, `.${urlPath}`);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return undefined;
  const file = urlPath.endsWith(`/`) ? path.join(candidate, `index.html`) : candidate;
  try {
    return fs.statSync(file).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

export async function startStagedSiteServer(siteDir: string): Promise<StagedSiteServer> {
  const root = path.resolve(siteDir);
  const headers = parseCatchAllHeaders(fs.readFileSync(path.join(root, `_headers`), `utf8`));
  const redirects = parseRedirects(fs.readFileSync(path.join(root, `_redirects`), `utf8`));
  const requests: ServedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on(`data`, (c: Buffer) => chunks.push(c));
    req.on(`end`, () => {
      const method = req.method ?? `GET`;
      requests.push({
        method,
        url: req.url ?? ``,
        headers: formatRequestHeaders(req.headers),
        body: Buffer.concat(chunks).toString(`utf8`),
      });
      if (method !== `GET` && method !== `HEAD`) {
        res.writeHead(405, headers).end();
        return;
      }
      let urlPath: string;
      try {
        urlPath = decodeURIComponent(new URL(req.url ?? `/`, `http://localhost`).pathname);
      } catch {
        res.writeHead(400, headers).end();
        return;
      }
      const redirect = redirects.get(urlPath);
      if (redirect) {
        res.writeHead(redirect.status, { ...headers, Location: redirect.to }).end();
        return;
      }
      const file = resolveFile(root, urlPath) ?? path.join(root, `index.html`);
      const type = CONTENT_TYPES[path.extname(file)] ?? `application/octet-stream`;
      res.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': `no-store` });
      if (method === `HEAD`) res.end();
      else fs.createReadStream(file).pipe(res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, `127.0.0.1`, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
