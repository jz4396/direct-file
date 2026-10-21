import { describe, expect, it } from 'vitest';
import { taxYearRegistry } from '../fact-dictionary/generated/taxYears.js';
import { CURRENT_TAX_YEAR } from './taxConstants.js';
import { acceptsNewReturns } from './taxYearAvailability.js';

describe(`tax year availability (registry enabled flag)`, () => {
  it(`keeps TY2026, the current tax year, open for new returns`, () => {
    expect(CURRENT_TAX_YEAR).toBe(`2026`);
    expect(taxYearRegistry.currentTaxYear).toBe(2026);
    expect(acceptsNewReturns(2026)).toBe(true);
  });

  it.each([2024, 2025, 2027])(`refuses new returns for unlisted tax year %i`, (taxYear) => {
    expect(acceptsNewReturns(taxYear)).toBe(false);
  });

  it(`refuses new returns for a listed year whose enabled flag is false`, () => {
    const registry = {
      years: [
        { taxYear: 2026, enabled: true },
        { taxYear: 2027, enabled: false },
      ],
    };
    expect(acceptsNewReturns(2026, registry)).toBe(true);
    expect(acceptsNewReturns(2027, registry)).toBe(false);
    expect(acceptsNewReturns(2026, { years: [{ taxYear: 2026, enabled: false }] })).toBe(false);
  });

  it(`treats anything but enabled: true as closed`, () => {
    const notBoolean = { years: [{ taxYear: 2026, enabled: `true` as unknown as boolean }] };
    expect(acceptsNewReturns(2026, notBoolean)).toBe(false);
  });
});
