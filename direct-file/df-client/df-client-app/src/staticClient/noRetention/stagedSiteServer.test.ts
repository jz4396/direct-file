import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { startStagedSiteServer, type StagedSiteServer } from './stagedSiteServer.js';

/**
 * The no-retention browser test trusts this log. A request the browser made has to show up here with its URL,
 * headers and body, or a marker in a header could pass unnoticed.
 */
describe(`staged site server request log`, () => {
  let server: StagedSiteServer | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await server?.close();
    server = undefined;
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  async function serve(): Promise<StagedSiteServer> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `staged-site-`));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, `_headers`), `/*\n  X-Content-Type-Options: nosniff\n`);
    fs.writeFileSync(path.join(dir, `_redirects`), ``);
    fs.writeFileSync(path.join(dir, `index.html`), `<!doctype html><title>preview</title>`);
    server = await startStagedSiteServer(dir);
    return server;
  }

  const request = (
    site: StagedSiteServer,
    method: string,
    urlPath: string,
    headers: http.OutgoingHttpHeaders,
    body = ``
  ) =>
    new Promise<void>((resolve, reject) => {
      const req = http.request(site.origin + urlPath, { method, headers }, (res) => {
        res.resume();
        res.on(`end`, () => resolve());
      });
      req.on(`error`, reject);
      req.end(body);
    });

  it(`records the method, query string, headers and body of every request`, async () => {
    const site = await serve();
    await request(site, `GET`, `/df/file/?canary=Zephyrcanary`, { Cookie: `tin=900700001`, 'X-Amount': `73519.47` });
    await request(site, `POST`, `/collect`, { 'Content-Type': `text/plain` }, `Orrinwisp`);

    expect(site.requests).toEqual([
      {
        method: `GET`,
        url: `/df/file/?canary=Zephyrcanary`,
        headers: expect.stringContaining(`cookie: tin=900700001`),
        body: ``,
      },
      {
        method: `POST`,
        url: `/collect`,
        headers: expect.stringContaining(`content-type: text/plain`),
        body: `Orrinwisp`,
      },
    ]);
    expect(site.requests[0].headers).toContain(`x-amount: 73519.47`);
  });
});
