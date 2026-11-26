import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  TAX_YEARS_FOLDER,
  TaxYearConfig,
  loadTaxYearConfig,
  loadTaxYearRegistry,
} from '../../fact-dictionary/yearConfig/yearConfig.js';
import { RepinRequest, repinRefusal, repinSource, runRepinCli } from '../../fact-dictionary/yearConfig/repinSource.js';

/**
 * Offline re-pin helper. The fixture is a ty2026.json-shaped copy. Nothing here fetches a URL.
 * The shipped parameter file is read and then compared; these tests do not write it.
 */
const fixturePath = path.resolve(`src/test/factDictionaryTests/fixtures/ty2026.repin.json`);
const helperPath = path.resolve(`src/fact-dictionary/yearConfig/repinSource.ts`);
const HASH = `ab`.repeat(32);
const FINAL_URL = `https://www.irs.gov/pub/irs-pdf/f9999.pdf`;

const loadFixture = (): TaxYearConfig => JSON.parse(fs.readFileSync(fixturePath, `utf8`)) as TaxYearConfig;

const request = (over: Partial<RepinRequest> = {}): RepinRequest => ({
  source: `draft-form`,
  url: FINAL_URL,
  sha256: HASH,
  kind: `final`,
  ...over,
});

const fact = (config: TaxYearConfig, name: string) => {
  const parameter = config.parameters.find((parameter) => parameter.fact === name);
  if (!parameter) {
    throw new Error(`missing ${name}`);
  }
  return parameter;
};

const pending = (config: TaxYearConfig, name: string) => {
  const entry = config.pendingReview.find((entry) => entry.fact === name);
  if (!entry) {
    throw new Error(`missing ${name}`);
  }
  return entry;
};

const withoutProvisional = <T extends { provisional?: unknown }>(entries: T[]) =>
  entries.map((entry) => {
    const copy = { ...entry };
    delete copy.provisional;
    return copy;
  });

function tempCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `year-config-repin-`));
  const file = path.join(dir, `ty2026.json`);
  fs.copyFileSync(fixturePath, file);
  return file;
}

describe(`repin a draft source on a ty2026.json fixture`, () => {
  const outcome = repinSource(loadFixture(), request());
  const next = outcome.config;

  it(`moves that source to the final url, hash, and kind and leaves the title`, () => {
    expect(next.sources[`draft-form`]).toEqual({
      title: `Form 9999 (2026), draft`,
      url: FINAL_URL,
      medium: `pdf`,
      kind: `final`,
      sha256: HASH,
    });
    expect(next.sources[`other-draft`].kind).toBe(`draft`);
  });

  it(`drops provisional only when every cite is now final, and keeps mixed cites`, () => {
    expect(fact(next, `/onlyDraft`).provisional).toBeUndefined();
    expect(fact(next, `/withStatute`).provisional).toBeUndefined();
    expect(fact(next, `/noFlag`).provisional).toBeUndefined();
    expect(fact(next, `/mixed`).provisional).toEqual({
      reason: `mixed`,
      repinFrom: `both finals`,
      tracking: `#91`,
    });
    expect(fact(next, `/untouched`).provisional).toEqual({
      reason: `other`,
      repinFrom: `other final`,
      tracking: `#91`,
    });
    expect(fact(next, `/copiesTable`).provisional?.repinFrom).toBe(`other final`);
    expect(pending(next, `/pendingOnly`).provisional).toBeUndefined();
    expect(pending(next, `/pendingMixed`).provisional?.reason).toBe(`mixed`);
  });

  it(`does not change values, quotes, or notes`, () => {
    const original = loadFixture();
    expect(withoutProvisional(next.parameters)).toEqual(withoutProvisional(original.parameters));
    expect(withoutProvisional(next.pendingReview)).toEqual(withoutProvisional(original.pendingReview));
    expect(fact(next, `/onlyDraft`).values).toEqual([`Dollar:10`]);
    expect(fact(next, `/copiesTable`).valuesFrom).toBe(`/untouched`);
    expect((fact(next, `/onlyDraft`) as { note?: string }).note).toBe(`keep this note`);
  });

  it(`prints each cite of the source with its quote and page`, () => {
    expect(outcome.recheckText).toBe(
      [
        `Recheck source draft-form (6):`,
        `- /onlyDraft (only.xml) page 2: the only draft amount is $10`,
        `- /mixed (mixed.xml) pages 3-4: mixed quote from the draft form`,
        `- /withStatute (statute.xml) page 5: form quote next to the statute`,
        `- /noFlag (noflag.xml) page 6: already had no provisional flag`,
        `- /pendingOnly pendingReview (pending.xml) page 9: pending quote`,
        `- /pendingMixed pendingReview (pending.xml) page 10: pending mixed quote`,
      ].join(`\n`)
    );
  });

  it(`is a no-op the second time, including the recheck list`, () => {
    const again = repinSource(next, request());
    expect(JSON.stringify(again.config)).toBe(JSON.stringify(next));
    expect(again.recheckText).toBe(outcome.recheckText);
  });

  it(`stores an uppercase hash as given`, () => {
    const upper = `AB`.repeat(32);
    const pinned = repinSource(loadFixture(), request({ sha256: upper }));
    expect(pinned.config.sources[`draft-form`].sha256).toBe(upper);
  });
});

describe(`refusals leave the file alone`, () => {
  const original = fs.readFileSync(fixturePath);

  const refuse = (over: Partial<RepinRequest>) => repinRefusal(loadFixture(), request(over));

  it(`refuses a bad hash, an unknown key, a foreign host, and a non-final kind`, () => {
    expect(refuse({ sha256: `abc` })).toBe(`sha256 must be 64 hex characters`);
    expect(refuse({ sha256: `g`.repeat(64) })).toBe(`sha256 must be 64 hex characters`);
    expect(refuse({ sha256: `a`.repeat(63) })).toBe(`sha256 must be 64 hex characters`);
    expect(refuse({ sha256: `a`.repeat(65) })).toBe(`sha256 must be 64 hex characters`);
    expect(refuse({ source: `no-such-source` })).toBe(`unknown source: no-such-source`);
    expect(refuse({ url: `https://example.com/f9999.pdf` })).toBe(
      `url host is not irs.gov or a state revenue domain already in sources: example.com`
    );
    expect(refuse({ url: `https://www.irs.gov.example.com/f9999.pdf` })).toBe(
      `url host is not irs.gov or a state revenue domain already in sources: www.irs.gov.example.com`
    );
    expect(refuse({ kind: `draft` })).toBe(`kind must be final`);
    expect(refuse({ kind: `priorYear` })).toBe(`kind must be final`);
    expect(refuse({ kind: `statute` })).toBe(`kind must be final`);
    expect(refuse({ kind: `revProc` })).toBe(`kind must be final`);
    expect(refuse({ url: `https://user:x@www.irs.gov/f9999.pdf` })).toBe(
      `url must be an http(s) URL with no username or password`
    );
    expect(fs.readFileSync(fixturePath)).toEqual(original);
  });

  it(`allows irs.gov and a state revenue host already in sources, and refuses the others`, () => {
    const config = loadFixture();
    expect(repinRefusal(config, request({ url: `https://irs.gov/pub/irs-pdf/f9999.pdf` }))).toBeUndefined();
    expect(repinRefusal(config, request({ url: `http://www.irs.gov/pub/irs-pdf/f9999.pdf` }))).toBeUndefined();
    expect(
      repinRefusal(config, request({ source: `state-prior`, url: `https://tax.illinois.gov/forms/2026.pdf` }))
    ).toBeUndefined();
    expect(
      repinRefusal(config, request({ source: `state-prior`, url: `https://www.tax.illinois.gov/forms/2026.pdf` }))
    ).toBeUndefined();
    expect(
      repinRefusal(config, request({ source: `mass-prior`, url: `https://www.mass.gov/doc/2026-form-1/download` }))
    ).toBeUndefined();
    expect(
      repinRefusal(config, request({ source: `vendor-prior`, url: `https://api.realfile.rtsclients.com/new.pdf` }))
    ).toMatch(/rtsclients.com/);
    expect(repinRefusal(config, request({ source: `legis`, url: `https://www.legis.state.pa.us/new` }))).toMatch(
      /legis.state.pa.us/
    );
    expect(
      repinRefusal(config, request({ source: `federal-register`, url: `https://www.federalregister.gov/d/2026-1` }))
    ).toMatch(/federalregister.gov/);
    expect(repinRefusal(config, request({ url: `https://tax.colorado.gov/form.pdf` }))).toMatch(/tax.colorado.gov/);
    expect(repinRefusal(config, request({ url: `https://www.law.cornell.edu/uscode/text/26` }))).toMatch(
      /law.cornell.edu/
    );
  });

  it(`does not throw a partial rewrite`, () => {
    expect(() => repinSource(loadFixture(), request({ sha256: `nope` }))).toThrow(/64 hex characters/);
  });
});

describe(`command line`, () => {
  it(`writes the fixture once and the second run is a byte-for-byte no-op`, () => {
    const file = tempCopy();
    const args = [`--file`, file, `--source`, `draft-form`, `--url`, FINAL_URL, `--sha256`, HASH, `--kind`, `final`];
    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (line: string) => logs.push(line), error: (line: string) => errors.push(line) };
    expect(runRepinCli(args, io)).toBe(0);
    const once = fs.readFileSync(file);
    logs.length = 0;
    expect(runRepinCli(args, io)).toBe(0);
    expect(fs.readFileSync(file)).toEqual(once);
    expect(errors).toEqual([]);
    expect(logs).toEqual([
      [
        `Recheck source draft-form (6):`,
        `- /onlyDraft (only.xml) page 2: the only draft amount is $10`,
        `- /mixed (mixed.xml) pages 3-4: mixed quote from the draft form`,
        `- /withStatute (statute.xml) page 5: form quote next to the statute`,
        `- /noFlag (noflag.xml) page 6: already had no provisional flag`,
        `- /pendingOnly pendingReview (pending.xml) page 9: pending quote`,
        `- /pendingMixed pendingReview (pending.xml) page 10: pending mixed quote`,
      ].join(`\n`),
    ]);
    const written = JSON.parse(once.toString(`utf8`)) as TaxYearConfig;
    expect(written.sources[`draft-form`].kind).toBe(`final`);
    expect(fact(written, `/onlyDraft`).provisional).toBeUndefined();
    expect(fact(written, `/mixed`).provisional).toBeDefined();
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it(`refuses a foreign host without writing`, () => {
    const file = tempCopy();
    const before = fs.readFileSync(file);
    const errors: string[] = [];
    const code = runRepinCli(
      [
        `--file`,
        file,
        `--source`,
        `draft-form`,
        `--url`,
        `https://example.com/f.pdf`,
        `--sha256`,
        HASH,
        `--kind`,
        `final`,
      ],
      { log: () => undefined, error: (line) => errors.push(line) }
    );
    expect(code).toBe(1);
    expect(errors).toEqual([`url host is not irs.gov or a state revenue domain already in sources: example.com`]);
    expect(fs.readFileSync(file)).toEqual(before);
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it(`refuses a missing flag`, () => {
    const errors: string[] = [];
    expect(runRepinCli([`--source`, `draft-form`], { log: () => undefined, error: (line) => errors.push(line) })).toBe(
      1
    );
    expect(errors).toEqual([`missing --url`]);
  });
});

describe(`shipped ty2026.json`, () => {
  const registry = loadTaxYearRegistry();
  const entry = registry.years.find((year) => year.taxYear === registry.currentTaxYear);
  if (!entry) {
    throw new Error(`current tax year is not in the registry`);
  }
  const diskPath = path.resolve(TAX_YEARS_FOLDER, entry.config);
  const diskBefore = fs.readFileSync(diskPath);
  const config = loadTaxYearConfig(registry.currentTaxYear);

  it(`does not change values when a draft source is re-pinned in memory`, () => {
    const snapshot = JSON.stringify(config);
    const outcome = repinSource(config, {
      source: `f6251-dft`,
      url: `https://www.irs.gov/pub/irs-pdf/f6251.pdf`,
      sha256: HASH,
      kind: `final`,
    });
    expect(JSON.stringify(config)).toBe(snapshot);
    expect(withoutProvisional(outcome.config.parameters)).toEqual(withoutProvisional(config.parameters));
    expect(withoutProvisional(outcome.config.pendingReview)).toEqual(withoutProvisional(config.pendingReview));
    expect(fact(outcome.config, `/form6251RateOffset`).values).toEqual([`Dollar:2445`, `Dollar:4890`]);
    expect(fact(outcome.config, `/form6251RateOffset`).provisional).toBeUndefined();
    expect(fact(outcome.config, `/form6251Line7`).provisional).toBeUndefined();
    expect(outcome.config.sources[`f6251-dft`].title).toBe(config.sources[`f6251-dft`].title);
    expect(outcome.config.sources[`f6251-dft`].medium).toBe(`pdf`);
    for (const [id, source] of Object.entries(config.sources)) {
      if (id === `f6251-dft`) {
        continue;
      }
      expect(outcome.config.sources[id]).toEqual(source);
    }
    expect(outcome.recheckText).toContain(`page 3: If line 17 is $244,500 or less`);
    expect(fs.readFileSync(diskPath)).toEqual(diskBefore);
  });

  it(`allows revenue hosts already in the file and refuses hosts that are not`, () => {
    const allow = (source: string, url: string) =>
      expect(repinRefusal(config, request({ source, url }))).toBeUndefined();
    allow(`f6251-dft`, `https://www.irs.gov/pub/irs-pdf/f6251.pdf`);
    allow(`f6251-dft`, `https://draft.irs.gov/pub/irs-pdf/f6251.pdf`);
    allow(`az-140-instr-2025`, `https://azdor.gov/forms/2026.pdf`);
    allow(`ma-form-1-instr-2025`, `https://www.mass.gov/doc/2026-form-1-instructions/download`);
    allow(`il-1040-instr-2025`, `https://tax.illinois.gov/forms/2026/il-1040-instr.pdf`);
    allow(`id-form-40-instr-2025`, `https://tax.idaho.gov/forms/2026.pdf`);
    allow(`k-40-booklet-2025`, `https://www.ksrevenue.gov/pdf/ip26.pdf`);
    allow(`d-401-2025`, `https://www.ncdor.gov/2026-d-401/open`);
    allow(`nm-pit-1-ins-2025`, `https://realfile.tax.newmexico.gov/2026pit-1-ins.pdf`);
    allow(`ak-dor-26-004`, `https://dor.alaska.gov/docs/2026.pdf`);

    const deny = (source: string, url: string, host: string) =>
      expect(repinRefusal(config, request({ source, url }))).toBe(
        `url host is not irs.gov or a state revenue domain already in sources: ${host}`
      );
    deny(`nm-pit-rates-2025`, `https://api.realfile.rtsclients.com/new.pdf`, `api.realfile.rtsclients.com`);
    deny(`pa-trc`, `https://www.legis.state.pa.us/new`, `www.legis.state.pa.us`);
    deny(`irc`, `https://www.law.cornell.edu/uscode/text/26`, `www.law.cornell.edu`);
    deny(`fr-2025-19763`, `https://www.federalregister.gov/d/2026-1`, `www.federalregister.gov`);
    deny(`fr-2025-01377`, `https://www.govinfo.gov/content/x.pdf`, `www.govinfo.gov`);
    deny(`mgl-c62`, `https://malegislature.gov/Laws/2026`, `malegislature.gov`);
    deny(`f6251-dft`, `https://tax.colorado.gov/form.pdf`, `tax.colorado.gov`);
    deny(`f6251-dft`, `https://notirs.gov/f.pdf`, `notirs.gov`);
    expect(fs.readFileSync(diskPath)).toEqual(diskBefore);
  });
});

describe(`the helper source`, () => {
  it(`does not import a network client or call fetch`, () => {
    const source = fs.readFileSync(helperPath, `utf8`);
    expect(source).not.toMatch(/\bfrom ['"](?:node:)?(?:http|https|net|dns|tls|undici)['"]/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\b(?:axios|node-fetch|got)\b/);
    expect(source).not.toMatch(/\bhttps?\.(?:request|get)\b/);
  });

  it(`runs as a script without a network call`, () => {
    const candidates = [path.resolve(`node_modules/.bin/vite-node`), path.resolve(`../node_modules/.bin/vite-node`)];
    const viteNode = candidates.find((candidate) => fs.existsSync(candidate));
    expect(viteNode, `vite-node is installed with the client dependencies`).toBeTruthy();
    const file = tempCopy();
    const result = spawnSync(
      viteNode as string,
      [helperPath, `--file`, file, `--source`, `draft-form`, `--url`, FINAL_URL, `--sha256`, HASH, `--kind`, `final`],
      { encoding: `utf8`, timeout: 120000 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`- /onlyDraft (only.xml) page 2: the only draft amount is $10`);
    const written = fs.readFileSync(file, `utf8`);
    const parsed = JSON.parse(written) as TaxYearConfig;
    expect(parsed.sources[`draft-form`].url).toBe(FINAL_URL);
    const second = spawnSync(
      viteNode as string,
      [helperPath, `--file`, file, `--source`, `draft-form`, `--url`, FINAL_URL, `--sha256`, HASH, `--kind`, `final`],
      { encoding: `utf8`, timeout: 120000 }
    );
    expect(second.status, second.stderr).toBe(0);
    expect(fs.readFileSync(file, `utf8`)).toBe(written);
    fs.rmSync(path.dirname(file), { recursive: true });
  });
});
