import { handleLocalApiRequest } from './localApi.js';

/**
 * Network guard for static client-only mode (staticMode.ts). Installed before anything else runs (index.tsx).
 *
 * - `fetch`: a request to the backend base URL is answered in the page by localApi.ts. Every other request is
 *   refused with a TypeError, as if the network were down. The original `fetch` is never called.
 * - `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` and `EventSource` are refused outright.
 *
 * Static assets (scripts, styles, images, fonts) are loaded by the browser from this origin and don't go through
 * these APIs. The CSP (`connect-src 'none'`) blocks the same APIs at the browser level, in case code captured the
 * originals before the guard was installed.
 */
export const BLOCKED_MESSAGE = `Network access is disabled in the static client`;

type GuardTarget = {
  fetch: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  WebSocket?: unknown;
  EventSource?: unknown;
  navigator?: Navigator;
};

const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === `string` ? input : input instanceof URL ? input.href : input.url;

export function installStaticNetworkGuard(target: GuardTarget, backendUrl: string): void {
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (backendUrl && url.startsWith(backendUrl)) {
      const method = init?.method ?? (typeof input === `object` && `method` in input ? input.method : `GET`);
      return handleLocalApiRequest(url.slice(backendUrl.length), method, init?.body);
    }
    throw new TypeError(BLOCKED_MESSAGE);
  };

  if (target.XMLHttpRequest) {
    const proto = target.XMLHttpRequest.prototype;
    proto.open = function blockedOpen() {
      throw new TypeError(BLOCKED_MESSAGE);
    };
    proto.send = function blockedSend() {
      throw new TypeError(BLOCKED_MESSAGE);
    };
  }

  const refuse = function Blocked() {
    throw new TypeError(BLOCKED_MESSAGE);
  };
  if (`WebSocket` in target) target.WebSocket = refuse;
  if (`EventSource` in target) target.EventSource = refuse;

  if (target.navigator && `sendBeacon` in target.navigator) {
    Object.defineProperty(target.navigator, `sendBeacon`, { configurable: true, value: () => false });
  }
}
