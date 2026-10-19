import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './contentSecurityPolicy.js';

const directives = (csp: string) =>
  Object.fromEntries(csp.split(`; `).map((d) => [d.split(` `)[0], d.split(` `).slice(1).join(` `)]));

describe(`content security policy`, () => {
  it(`allows only same-origin scripts (no third-party, inline or eval)`, () => {
    const d = directives(buildContentSecurityPolicy(`http://localhost:8080/df/file/api/`));
    expect(d[`script-src`]).toBe(`'self'`);
    expect(d[`default-src`]).toBe(`'self'`);
    expect(d[`object-src`]).toBe(`'none'`);
    expect(d[`frame-src`]).toBe(`'none'`);
    expect(d[`base-uri`]).toBe(`'self'`);
  });

  it(`limits network access to this origin and the backend origin`, () => {
    expect(directives(buildContentSecurityPolicy(`http://localhost:8080/df/file/api/`))[`connect-src`]).toBe(
      `'self' http://localhost:8080`
    );
    expect(directives(buildContentSecurityPolicy(`not a url`))[`connect-src`]).toBe(`'self'`);
    expect(directives(buildContentSecurityPolicy())[`connect-src`]).toBe(`'self'`);
  });
});
