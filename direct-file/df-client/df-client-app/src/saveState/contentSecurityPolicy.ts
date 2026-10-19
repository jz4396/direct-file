/**
 * Content-Security-Policy for the built client (injected as a <meta> tag by vite.config.ts at build time only, so
 * the dev server's inline HMR preamble keeps working).
 *
 * Only same-origin scripts may run: third-party and inline scripts (including the upstream analytics snippet in
 * index.html) are blocked, so other origins' code can't read the encrypted device save, the in-memory return, or
 * a passphrase as it's typed. Network access is limited to this origin plus the configured backend origin.
 *
 * `frame-ancestors` and reporting can't be set from a <meta> tag; set them as response headers where the client
 * is served.
 */
export function buildContentSecurityPolicy(backendUrl?: string): string {
  let backendOrigin = ``;
  try {
    backendOrigin = backendUrl ? new URL(backendUrl).origin : ``;
  } catch {
    backendOrigin = ``;
  }
  const connect = [`'self'`, backendOrigin].filter(Boolean).join(` `);
  return [
    `default-src 'self'`,
    `script-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-src 'none'`,
    `worker-src 'self'`,
    `connect-src ${connect}`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // React and USWDS components set inline style attributes.
    `style-src 'self' 'unsafe-inline'`,
  ].join(`; `);
}
