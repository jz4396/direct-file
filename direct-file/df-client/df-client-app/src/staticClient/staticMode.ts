/**
 * Static client-only mode (`vite build --mode static`, see `.env.static`).
 *
 * The bundle is served as plain files (for example from Cloudflare Pages) with no Direct File backend. Everything
 * the interview would send to the API is answered in the browser by localApi.ts, and every browser network API is
 * blocked by networkGuard.ts, so taxpayer data never leaves the page. The CSP for this mode sets
 * `connect-src 'none'` as a second, independent layer (contentSecurityPolicy.ts and pages/_headers).
 */
export const isStaticClientOnly = (): boolean => import.meta.env.VITE_STATIC_CLIENT_ONLY === `true`;

/**
 * Backend base URL in static mode. The `.invalid` top-level domain never resolves (RFC 6761), so even a request
 * that somehow got past the guard and the CSP could not reach a server.
 */
export const STATIC_BACKEND_URL = `https://df-static-client.invalid/df/file/api/`;
