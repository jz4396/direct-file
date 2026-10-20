import { v4 as uuidv4 } from 'uuid';
import { CURRENT_TAX_YEAR } from '../constants/taxConstants.js';
import type { TaxReturn } from '../types/core.js';

/**
 * In-browser stand-in for the Direct File API in static client-only mode (staticMode.ts).
 *
 * It answers the requests the interview needs to run (list, create and autosave the tax return, session
 * keep-alive) from memory. Nothing is sent anywhere and nothing is written to browser storage: the return lives in
 * this module until the page is closed or reloaded. To keep it, use the save-state page (encrypted device save or
 * save file, src/saveState). Everything that needs the real backend (PDF, preview, sign, submit, status, data
 * import, state transfer) answers 501 with a JSON `message`, which the app shows as an ordinary API error.
 */
export const STATIC_UNAVAILABLE = `not-available-in-static-client`;

type Method = `GET` | `POST` | `PUT` | `DELETE` | `PATCH` | `HEAD` | `OPTIONS`;

let returns: TaxReturn[] = [];

/** Test hook: forget the in-memory return. */
export function resetLocalApi(): void {
  returns = [];
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': `application/json` },
  });

const unavailable = () => json(501, { message: STATIC_UNAVAILABLE });

function newReturn(taxYear: number): TaxReturn {
  // The backend seeds the filers collection (and the email and TIN from the sign-in, which static mode has none of).
  const primaryFilerId = uuidv4();
  const secondaryFilerId = uuidv4();
  return {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    taxYear,
    facts: {
      '/filers': {
        $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
        item: { items: [primaryFilerId, secondaryFilerId] },
      },
      [`/filers/#${primaryFilerId}/isPrimaryFiler`]: {
        $type: `gov.irs.factgraph.persisters.BooleanWrapper`,
        item: true,
      },
      [`/filers/#${secondaryFilerId}/isPrimaryFiler`]: {
        $type: `gov.irs.factgraph.persisters.BooleanWrapper`,
        item: false,
      },
    } as TaxReturn[`facts`],
    taxReturnSubmissions: [],
    isEditable: true,
    surveyOptIn: null,
  };
}

const parseBody = (body: unknown): Record<string, unknown> | undefined => {
  if (typeof body !== `string`) return undefined;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === `object` && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Answer one API request. `path` is the part after the backend base URL, e.g. `v1/taxreturns/<id>`; query strings
 * are ignored.
 */
export function handleLocalApiRequest(path: string, method: string, body: unknown): Response {
  const m = method.toUpperCase() as Method;
  const parts = path.split(`?`)[0].split(`/`).filter(Boolean);

  if (parts[0] !== `v1`) return json(404, { message: `not-found` });
  const [, resource, id, action] = parts;

  if (resource === `session` && id === `keep-alive` && m === `GET`) return json(200, {});

  if (resource === `taxreturns`) {
    if (!id) {
      if (m === `GET`) return json(200, returns);
      if (m === `POST`) {
        const taxYear = Number(parseBody(body)?.taxYear ?? CURRENT_TAX_YEAR);
        if (returns.some((r) => r.taxYear === taxYear)) return json(409, { message: `already-exists` });
        const created = newReturn(taxYear);
        returns = [...returns, created];
        return json(200, created);
      }
      return json(405, { message: `method-not-allowed` });
    }
    const current = returns.find((r) => r.id === id);
    if (!current) return json(404, { message: `not-found` });
    if (!action) {
      if (m === `GET`) return json(200, current);
      if (m === `POST` || m === `PUT`) {
        const update = parseBody(body);
        const updated: TaxReturn = {
          ...current,
          ...(update?.facts && typeof update.facts === `object` ? { facts: update.facts as TaxReturn[`facts`] } : {}),
          ...(typeof update?.surveyOptIn === `boolean` ? { surveyOptIn: update.surveyOptIn } : {}),
        };
        returns = returns.map((r) => (r.id === id ? updated : r));
        return json(200, updated);
      }
      if (m === `DELETE`) {
        returns = returns.filter((r) => r.id !== id);
        return json(200, undefined);
      }
    }
  }
  return unavailable();
}
