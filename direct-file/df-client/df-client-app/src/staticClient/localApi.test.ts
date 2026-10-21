import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_TAX_YEAR } from '../constants/taxConstants.js';
import { exportSaveFile, importSaveFile } from '../saveState/saveStateFile.js';
import { scenarioFacts } from '../saveState/saveStateTestUtils.js';
import { handleLocalApiRequest, resetLocalApi } from './localApi.js';

const create = (taxYear?: number) =>
  handleLocalApiRequest(`v1/taxreturns`, `POST`, JSON.stringify(taxYear === undefined ? {} : { taxYear }));

describe(`static client local API`, () => {
  beforeEach(() => resetLocalApi());
  afterEach(() => {
    vi.doUnmock(`../constants/taxYearAvailability.js`);
    vi.resetModules();
  });

  it(`creates a return for the current, enabled tax year once`, async () => {
    const res = create();
    expect(res.status).toBe(200);
    expect((await res.json()).taxYear).toBe(Number(CURRENT_TAX_YEAR));
    expect(create().status).toBe(409);
  });

  it(`refuses a year that is not in the tax year registry, like the backend`, async () => {
    const res = create(2019);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/2019 is not open for new returns/);
  });

  it(`refuses a registered year whose enabled flag is off`, async () => {
    vi.doMock(`../constants/taxYearAvailability.js`, () => ({ acceptsNewReturns: () => false }));
    vi.resetModules();
    const local = await import('./localApi.js');
    local.resetLocalApi();
    const res = local.handleLocalApiRequest(`v1/taxreturns`, `POST`, `{}`);
    expect(res.status).toBe(400);
  });

  it(`keeps facts that the save-state validator accepts (seeded filers and an autosaved scenario)`, async () => {
    const created = await create().json();
    // The seeded /filers collection uses UUID item ids, so a save file of a fresh return imports cleanly.
    const fresh = await importSaveFile((await exportSaveFile(created.facts)).text);
    expect(fresh.facts).toEqual(created.facts);

    const saved = handleLocalApiRequest(
      `v1/taxreturns/${created.id}`,
      `POST`,
      JSON.stringify({ facts: scenarioFacts })
    );
    expect(saved.status).toBe(200);
    const [back] = await handleLocalApiRequest(`v1/taxreturns`, `GET`, undefined).json();
    const imported = await importSaveFile((await exportSaveFile(back.facts)).text);
    expect(imported.facts).toEqual(scenarioFacts);
  });
});
