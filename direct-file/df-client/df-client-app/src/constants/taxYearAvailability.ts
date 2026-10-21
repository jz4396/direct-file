import { taxYearRegistry } from '../fact-dictionary/generated/taxYears.js';

/**
 * Which tax years a new return can be started for, from the per-year `enabled` flag in
 * backend/src/main/resources/taxYears/registry.json (copied into generated/taxYears.ts by
 * `npm run generate-fact-dictionary`). The backend reads the same flag and refuses to create a return for a
 * year that is not listed or not enabled, so the client and the API agree.
 */
export type TaxYearAvailability = { years: readonly { taxYear: number; enabled: boolean }[] };

export function acceptsNewReturns(taxYear: number, registry: TaxYearAvailability = taxYearRegistry): boolean {
  return registry.years.some((y) => y.taxYear === taxYear && y.enabled === true);
}
