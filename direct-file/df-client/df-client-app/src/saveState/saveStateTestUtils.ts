import { setupFactGraph } from '../test/setupFactGraph.js';
import { filerWithW2NoDeductionsNoCreditsBaseData } from '../test/testData.js';

/** Golden end-to-end scenario (synthetic data): a single filer with one W-2. */
export const scenarioFacts = filerWithW2NoDeductionsNoCreditsBaseData;

/** Synthetic PII markers that appear in the scenario and must never show up in storage, logs or requests. */
export const PII_MARKERS = [`Testerson`, `"area":"555"`];

/** Fact graph JSON exactly as the app produces it (factGraph.toJSON()). */
export function scenarioFactGraphJson(): Record<string, unknown> {
  return JSON.parse(setupFactGraph(scenarioFacts).factGraph.toJSON());
}

/** Fast PBKDF2 setting for tests (the reader still enforces its minimum). */
export const TEST_ITERATIONS = 100_000;
export const PASSPHRASE = `correct horse battery staple`;
