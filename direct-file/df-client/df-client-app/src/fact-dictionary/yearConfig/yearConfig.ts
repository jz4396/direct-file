/**
 * Per-tax-year parameter configuration.
 *
 * backend/src/main/resources/taxYears/registry.json lists the tax years this build supports and
 * names one parameter file per year (e.g. ty2026.json). A parameter file holds, for every fact
 * that carries <TaxYear>YYYY</TaxYear> in the fact dictionary, the fact's literal values in
 * document order and the authority for them (a Rev. Proc./Notice/Publication page and quote, or
 * an IRC section and quote).
 *
 * The parameter file is the source of truth for the values. applyYearConfig.ts writes them into
 * the fact dictionary XML; yearConfig.test.ts fails if the XML and the file disagree, if a
 * parameter has no cite, or if a cited quote does not contain the dollar amounts and rates the
 * parameter holds.
 *
 * Loading is strict: a year that is not in the registry is an error, never a fallback to another
 * year.
 *
 * Every registry entry also has a required boolean `enabled` flag. A year that is listed but not
 * enabled keeps its parameters and existing returns, but no new return can be started for it: the
 * backend refuses the create (SupportedTaxYears) and the client offers no start button
 * (src/constants/taxYearAvailability.ts, fed by the generated generated/taxYears.ts).
 */
import fs from 'fs';
import path from 'path';

export const TAX_YEARS_FOLDER = `../../backend/src/main/resources/taxYears/`;
export const FACT_DICTIONARY_XML_FOLDER = `./src/fact-dictionary/generate-src/xml-src/`;

export type SourceKind = `pdf` | `statute` | `web`;

export interface TaxYearSource {
  title: string;
  url: string;
  kind: SourceKind;
  /** sha256 of the PDF the page numbers and quotes were checked against. */
  sha256?: string;
}

export interface Cite {
  source: string;
  section?: string;
  /** Page in the source PDF (required for pdf sources). */
  page?: number;
  pageEnd?: number;
  /** Section-level URL (required for statute sources). */
  url?: string;
  quote: string;
  /** `table` when the quote is a row-by-row transcription of a table rather than verbatim prose. */
  form?: `table`;
}

export interface TaxYearParameter {
  fact: string;
  file: string;
  /** Literal values of the fact in document order, as `<Type>:<text>`, e.g. `Dollar:32200`. */
  values?: string[];
  /** Use the values of another parameter (for facts that duplicate a table). */
  valuesFrom?: string;
  cite: Cite[];
}

export type PendingStatus = `current` | `stale` | `structural` | `unverified`;
export const PENDING_STATUSES: readonly PendingStatus[] = [`current`, `stale`, `structural`, `unverified`];

/** A fact still tagged with an earlier tax year; its TY2026 status is recorded until it is re-tagged. */
export interface PendingReviewEntry {
  fact: string;
  file: string;
  taggedYear: number;
  status: PendingStatus;
  values: string[];
  cite?: Cite[];
  note: string;
  tracking: string;
}

export interface TaxYearConfig {
  taxYear: number;
  sources: Record<string, TaxYearSource>;
  parameters: TaxYearParameter[];
  pendingReview: PendingReviewEntry[];
}

export interface TaxYearRegistry {
  currentTaxYear: number;
  years: TaxYearRegistryEntry[];
}

export interface TaxYearRegistryEntry {
  taxYear: number;
  config: string;
  /** Whether a new return can be started for this year. Required; there is no default. */
  enabled: boolean;
}

export class UnknownTaxYearError extends Error {
  constructor(taxYear: number, supported: number[]) {
    super(`Tax year ${taxYear} is not in the tax year registry (supported: ${supported.join(`, `) || `none`})`);
    this.name = `UnknownTaxYearError`;
  }
}

function readJson<T>(file: string): T {
  // nosemgrep: eslint.detect-non-literal-fs-filename
  return JSON.parse(fs.readFileSync(file, `utf-8`)) as T;
}

export function loadTaxYearRegistry(folder = TAX_YEARS_FOLDER): TaxYearRegistry {
  const registry = readJson<TaxYearRegistry>(path.join(folder, `registry.json`));
  const years = registry.years.map((y) => y.taxYear);
  if (new Set(years).size !== years.length) {
    throw new Error(`Tax year registry lists a year more than once`);
  }
  const noFlag = registry.years.find((y) => typeof y.enabled !== `boolean`);
  if (noFlag) {
    throw new Error(`Tax year registry entry ${noFlag.taxYear} has no boolean enabled flag`);
  }
  if (!years.includes(registry.currentTaxYear)) {
    throw new UnknownTaxYearError(registry.currentTaxYear, years);
  }
  return registry;
}

export function loadTaxYearConfig(taxYear: number, folder = TAX_YEARS_FOLDER): TaxYearConfig {
  const registry = loadTaxYearRegistry(folder);
  const entry = registry.years.find((y) => y.taxYear === taxYear);
  if (!entry) {
    throw new UnknownTaxYearError(
      taxYear,
      registry.years.map((y) => y.taxYear)
    );
  }
  const config = readJson<TaxYearConfig>(path.join(folder, entry.config));
  if (config.taxYear !== taxYear) {
    throw new Error(`${entry.config} declares tax year ${config.taxYear}, registry expects ${taxYear}`);
  }
  return config;
}

// ---------------------------------------------------------------------------------------------
// Fact dictionary XML
// ---------------------------------------------------------------------------------------------

const FACT_PATTERN = /<Fact path="([^"]+)">([\s\S]*?)<\/Fact>/g;
const TAX_YEAR_PATTERN = /<TaxYear>(\d+)<\/TaxYear>/;
const LITERAL_PATTERN = /<(Dollar|Int|Day|Rational|Decimal|String)>([^<]*)<\/\1>/g;

export interface TaggedFact {
  fact: string;
  file: string;
  taxYear: number;
  values: string[];
}

export function literalValues(factBody: string): string[] {
  return [...factBody.matchAll(LITERAL_PATTERN)].map((m) => `${m[1]}:${m[2].trim()}`);
}

/** Facts in one XML module that carry a <TaxYear> tag. */
export function taggedFactsInXml(xml: string, file: string): TaggedFact[] {
  const facts: TaggedFact[] = [];
  for (const m of xml.matchAll(FACT_PATTERN)) {
    const year = TAX_YEAR_PATTERN.exec(m[2]);
    if (year) {
      facts.push({ fact: m[1], file, taxYear: Number(year[1]), values: literalValues(m[2]) });
    }
  }
  return facts;
}

export function readXmlModules(folder = FACT_DICTIONARY_XML_FOLDER): Map<string, string> {
  const modules = new Map<string, string>();
  // nosemgrep: eslint.detect-non-literal-fs-filename
  for (const file of fs.readdirSync(folder).filter((f) => f.endsWith(`.xml`))) {
    // nosemgrep: eslint.detect-non-literal-fs-filename
    modules.set(file, fs.readFileSync(path.join(folder, file), `utf-8`));
  }
  return modules;
}

export function taggedFacts(modules: Map<string, string>): TaggedFact[] {
  return [...modules.entries()].flatMap(([file, xml]) => taggedFactsInXml(xml, file));
}

export function resolvedValues(config: TaxYearConfig, parameter: TaxYearParameter): string[] {
  if (parameter.valuesFrom) {
    const from = config.parameters.find((p) => p.fact === parameter.valuesFrom);
    if (!from?.values) {
      throw new Error(`${parameter.fact}: valuesFrom ${parameter.valuesFrom} has no values`);
    }
    return from.values;
  }
  if (!parameter.values) {
    throw new Error(`${parameter.fact}: no values`);
  }
  return parameter.values;
}

/** Writes the parameter's values into its fact. Literal types and count must already match. */
export function applyParameterToXml(xml: string, fact: string, values: string[]): string {
  let found = false;
  const out = xml.replace(FACT_PATTERN, (whole, factPath: string, body: string) => {
    if (factPath !== fact) {
      return whole;
    }
    found = true;
    let i = 0;
    const newBody = body.replace(LITERAL_PATTERN, (lit, type: string, text: string) => {
      const wanted = values[i++];
      if (wanted === undefined) {
        throw new Error(`${fact}: XML has more literals than the parameter file`);
      }
      const sep = wanted.indexOf(`:`);
      const [wantedType, wantedText] = [wanted.slice(0, sep), wanted.slice(sep + 1)];
      if (wantedType !== type) {
        throw new Error(`${fact}: literal ${i} is <${type}> in XML but ${wantedType} in the parameter file`);
      }
      const lead = /^\s*/.exec(text)?.[0] ?? ``;
      const trail = /\s*$/.exec(text)?.[0] ?? ``;
      return `<${type}>${lead}${wantedText}${trail}</${type}>`;
    });
    if (i !== values.length) {
      throw new Error(`${fact}: parameter file has ${values.length} values, XML has ${i} literals`);
    }
    return whole.replace(body, () => newBody);
  });
  if (!found) {
    throw new Error(`${fact}: fact not found`);
  }
  return out;
}

/** Applies every parameter of the config to the XML modules; returns the modules that changed. */
export function applyConfig(config: TaxYearConfig, modules: Map<string, string>): Map<string, string> {
  const changed = new Map<string, string>();
  for (const parameter of config.parameters) {
    const current = changed.get(parameter.file) ?? modules.get(parameter.file);
    if (current === undefined) {
      throw new Error(`${parameter.fact}: module ${parameter.file} not found`);
    }
    const next = applyParameterToXml(current, parameter.fact, resolvedValues(config, parameter));
    if (next !== modules.get(parameter.file)) {
      changed.set(parameter.file, next);
    } else {
      changed.delete(parameter.file);
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/** `Dollar:206583.50` -> `$206,583.50`; `Rational:22/100` -> `22%`; other literals need no quote check. */
export function quotedForms(value: string): string | null {
  const sep = value.indexOf(`:`);
  const [type, text] = [value.slice(0, sep), value.slice(sep + 1)];
  if (type === `Dollar`) {
    const [whole, cents] = text.split(`.`);
    if (Number(text) === 0) {
      return null;
    }
    return `$${Number(whole).toLocaleString(`en-US`)}${cents === undefined ? `` : `.${cents}`}`;
  }
  if (type === `Rational`) {
    const [num, den] = text.split(`/`);
    return den === `100` ? `${num}%` : null;
  }
  return null;
}

export function citeErrors(config: TaxYearConfig, where: string, cites: Cite[] | undefined): string[] {
  const errors: string[] = [];
  if (!cites || cites.length === 0) {
    return [`${where}: no cite`];
  }
  cites.forEach((cite, i) => {
    const label = `${where} cite ${i + 1}`;
    const source = config.sources[cite.source];
    if (!source) {
      errors.push(`${label}: unknown source ${cite.source}`);
      return;
    }
    if (!cite.quote || cite.quote.trim().length < 8) {
      errors.push(`${label}: missing quote`);
    }
    if (source.kind === `pdf`) {
      if (!Number.isInteger(cite.page) || (cite.page as number) < 1) {
        errors.push(`${label}: ${cite.source} cite needs a page`);
      }
      if (cite.pageEnd !== undefined && cite.pageEnd < (cite.page ?? 0)) {
        errors.push(`${label}: pageEnd before page`);
      }
    }
    if (source.kind === `statute`) {
      if (!cite.section || !/^§ \d/.test(cite.section)) {
        errors.push(`${label}: statute cite needs a section like "§ 1211(b)(1)"`);
      }
      if (!cite.url || !cite.url.startsWith(source.url)) {
        errors.push(`${label}: statute cite needs a section URL under ${source.url}`);
      }
    }
  });
  return errors;
}

/** Every dollar amount and percentage rate the parameter holds must appear in one of its quotes. */
export function quoteCoverageErrors(where: string, values: string[], cites: Cite[]): string[] {
  const quotes = cites.map((c) => c.quote).join(`\n`);
  const missing = [...new Set(values.map(quotedForms).filter((v): v is string => v !== null))].filter(
    (v) => !quotes.includes(v)
  );
  return missing.length ? [`${where}: cited quotes do not contain ${missing.join(`, `)}`] : [];
}

export function validateConfig(config: TaxYearConfig, facts: TaggedFact[]): string[] {
  const errors: string[] = [];
  const byFact = new Map(facts.map((f) => [f.fact, f]));
  const seen = new Set<string>();

  for (const parameter of config.parameters) {
    const where = parameter.fact;
    if (seen.has(where)) {
      errors.push(`${where}: listed more than once`);
    }
    seen.add(where);
    const xml = byFact.get(where);
    if (!xml) {
      errors.push(`${where}: no fact with a <TaxYear> tag at this path`);
      continue;
    }
    if (xml.taxYear !== config.taxYear) {
      errors.push(`${where}: tagged ${xml.taxYear} in ${xml.file}, but listed as a TY${config.taxYear} parameter`);
    }
    if (xml.file !== parameter.file) {
      errors.push(`${where}: in ${xml.file}, parameter file says ${parameter.file}`);
    }
    let values: string[];
    try {
      values = resolvedValues(config, parameter);
    } catch (e) {
      errors.push((e as Error).message);
      continue;
    }
    if (JSON.stringify(values) !== JSON.stringify(xml.values)) {
      const [inXml, inFile] = [JSON.stringify(xml.values), JSON.stringify(values)];
      errors.push(`${where}: XML values ${inXml} differ from parameter file ${inFile}`);
    }
    errors.push(...citeErrors(config, where, parameter.cite));
    if (parameter.cite?.length) {
      errors.push(...quoteCoverageErrors(where, values, parameter.cite));
    }
  }

  for (const entry of config.pendingReview) {
    const where = entry.fact;
    if (seen.has(where)) {
      errors.push(`${where}: listed more than once`);
    }
    seen.add(where);
    const xml = byFact.get(where);
    if (!xml) {
      errors.push(`${where}: no fact with a <TaxYear> tag at this path`);
      continue;
    }
    if (xml.taxYear !== entry.taggedYear || xml.taxYear === config.taxYear) {
      errors.push(`${where}: tagged ${xml.taxYear}, pendingReview says ${entry.taggedYear}`);
    }
    if (JSON.stringify(entry.values) !== JSON.stringify(xml.values)) {
      errors.push(`${where}: XML values ${JSON.stringify(xml.values)} differ from pendingReview`);
    }
    if (!PENDING_STATUSES.includes(entry.status)) {
      errors.push(`${where}: unknown status ${entry.status}`);
    }
    if (!entry.note?.trim() || !entry.tracking?.trim()) {
      errors.push(`${where}: pendingReview needs a note and a tracking issue`);
    }
    if (entry.status === `current`) {
      errors.push(...citeErrors(config, where, entry.cite));
      if (entry.cite?.length) {
        errors.push(...quoteCoverageErrors(where, entry.values, entry.cite));
      }
    } else if (entry.cite) {
      errors.push(...citeErrors(config, where, entry.cite));
    }
  }

  for (const fact of facts) {
    if (!seen.has(fact.fact)) {
      const where = `${fact.fact} (${fact.file}, TaxYear ${fact.taxYear})`;
      errors.push(`${where} is not in the TY${config.taxYear} parameter file`);
    }
  }
  return errors;
}
