import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The local client image (df-client/Dockerfile-local) writes its nginx.conf with `RUN echo "..."`. Render that the
 * way the image's shell does and check the anti-framing headers: a <meta> CSP can't carry frame-ancestors, so they
 * must be response headers. Production hosting must send the same two headers (see the README).
 */
function renderedNginxConf(): string {
  const dockerfile = readFileSync(resolve(__dirname, `../../../Dockerfile-local`), `utf8`);
  const start = dockerfile.indexOf(`RUN echo "events {}`);
  const end = dockerfile.indexOf(`" > /etc/nginx/nginx.conf`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return dockerfile
    .slice(start + `RUN echo "`.length, end)
    .replace(/\\\n/g, ``) // Dockerfile line continuations
    .replace(/\\n/g, `\n`) // echo escapes (dash)
    .replace(/\\"/g, `"`)
    .replace(/\\\$/g, `$`)
    .replace(/\$\{DF_CLIENT_PUBLIC_PATH\}/g, `/df/file`);
}

/** Top-level directives of the server block, without nested location blocks. */
function serverDirectives(conf: string): { server: string; locations: string[] } {
  const body = conf.slice(conf.indexOf(`server {`) + `server {`.length);
  const locations: string[] = [];
  let server = ``;
  let depth = 0;
  let current = ``;
  for (const line of body.split(`\n`)) {
    const trimmed = line.trim();
    if (depth === 0 && trimmed.startsWith(`location`)) {
      depth = 1;
      current = ``;
      continue;
    }
    if (depth > 0) {
      if (trimmed.endsWith(`{`)) depth++;
      if (trimmed === `}`) depth--;
      if (depth === 0) locations.push(current);
      else current += `${trimmed}\n`;
      continue;
    }
    if (trimmed === `}`) break;
    if (!trimmed.startsWith(`#`)) server += `${trimmed}\n`;
  }
  return { server, locations };
}

describe(`df-client local nginx: no framing`, () => {
  const { server, locations } = serverDirectives(renderedNginxConf());

  it(`sends CSP frame-ancestors 'none' and X-Frame-Options DENY on every response`, () => {
    expect(server).toContain(`add_header Content-Security-Policy "frame-ancestors 'none'" always;`);
    expect(server).toContain(`add_header X-Frame-Options DENY always;`);
  });

  it(`no location block sets its own headers (which would drop the server-level ones)`, () => {
    expect(locations.length).toBeGreaterThanOrEqual(2);
    locations.forEach((l) => expect(l).not.toContain(`add_header`));
  });
});
