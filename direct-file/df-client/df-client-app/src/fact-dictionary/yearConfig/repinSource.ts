/**
 * Offline re-pin of one draft or prior-year source in a tax year parameter file.
 *
 *   npm run year-config:repin -- --source <key> --url <final url> --sha256 <hash> --kind final
 *   npm run year-config:repin -- --file <copy.json> --source <key> ...
 *
 * The hash and the URL are arguments. This process does not open a socket, resolve DNS, or
 * download the document. It rewrites that one source's url, sha256, and kind, prints every
 * parameter and pendingReview cite of the source (quote and page) as a recheck list, and
 * removes `provisional` only when every cite on that fact is now final, statute, or revProc.
 * A fact that still cites a draft or prior-year source keeps `provisional`. Title and medium
 * are left as they are. Parameter values are not modified.
 *
 * `--kind` must be `final`. Running the same command again writes nothing.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TAX_YEARS_FOLDER, TaxYearConfig, loadTaxYearRegistry, type Cite } from './yearConfig.js';

/** Kinds that count as final for a cite. `draft` and `priorYear` do not. */
const FINAL_CITE_KINDS = new Set([`final`, `statute`, `revProc`]);

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

const FLAGS = new Set([`--source`, `--url`, `--sha256`, `--kind`, `--file`]);

export class RepinRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = `RepinRefusal`;
  }
}

export interface RepinRequest {
  source: string;
  url: string;
  sha256: string;
  /** Must be `final`. Other kinds, including statute and revProc, are refused. */
  kind: string;
}

export interface RepinResult {
  config: TaxYearConfig;
  recheckText: string;
}

interface RepinIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

interface CitedFact {
  fact: string;
  file: string;
  bucket: `parameter` | `pendingReview`;
  cite?: Cite[];
  provisional?: { reason: string; repinFrom: string; tracking: string };
}

function defaultIo(): RepinIo {
  return {
    // eslint-disable-next-line no-console
    log: (line) => console.log(line),
    // eslint-disable-next-line no-console
    error: (line) => console.error(line),
  };
}

function bareHost(host: string): string {
  const lower = host.toLowerCase();
  return lower.startsWith(`www.`) ? lower.slice(4) : lower;
}

function isIrsHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === `irs.gov` || lower.endsWith(`.irs.gov`);
}

/**
 * A state tax-agency host: a `tax`, `dor`, or `revenue` label, a two-letter prefix plus `dor`
 * or `revenue` (`ncdor`, `azdor`, `ksrevenue`), or `mass.gov` (Massachusetts publishes Form 1
 * instructions there). Legislature hosts, code publishers, and vendor CDNs do not match.
 */
function isStateRevenueHost(host: string): boolean {
  const bare = bareHost(host);
  if (bare === `mass.gov`) {
    return true;
  }
  return bare.split(`.`).some((label) => {
    return (
      label === `tax` ||
      label === `dor` ||
      label === `revenue` ||
      /^[a-z]{2}dor$/.test(label) ||
      /^[a-z]{2}revenue$/.test(label)
    );
  });
}

function hostsInSources(config: TaxYearConfig): string[] {
  const hosts: string[] = [];
  for (const source of Object.values(config.sources ?? {})) {
    if (!source?.url) {
      continue;
    }
    try {
      hosts.push(new URL(source.url).hostname.toLowerCase());
    } catch {
      // An unrelated source with a bad URL does not widen the allowlist.
    }
  }
  return hosts;
}

/** The host is already used by a source, or is a subdomain of one of those hosts (`www` ignored). */
function knownRevenueSite(host: string, knownHosts: readonly string[]): boolean {
  const bare = bareHost(host);
  return knownHosts.some((known) => {
    const knownBare = bareHost(known);
    return bare === knownBare || bare.endsWith(`.${knownBare}`);
  });
}

function parseHttpUrl(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if ((url.protocol !== `http:` && url.protocol !== `https:`) || url.username !== `` || url.password !== ``) {
    return undefined;
  }
  if (url.hostname === ``) {
    return undefined;
  }
  return url;
}

/** Why this request must not run, or undefined when the rewrite is allowed. Does not modify the file. */
export function repinRefusal(config: TaxYearConfig, request: RepinRequest): string | undefined {
  if (request.kind !== `final`) {
    return `kind must be final`;
  }
  if (!SHA256_HEX.test(request.sha256)) {
    return `sha256 must be 64 hex characters`;
  }
  const url = parseHttpUrl(request.url);
  if (!url) {
    return `url must be an http(s) URL with no username or password`;
  }
  if (!config.sources?.[request.source]) {
    return `unknown source: ${request.source}`;
  }
  const host = url.hostname.toLowerCase();
  if (isIrsHost(host)) {
    return undefined;
  }
  if (isStateRevenueHost(host) && knownRevenueSite(host, hostsInSources(config))) {
    return undefined;
  }
  return `url host is not irs.gov or a state revenue domain already in sources: ${host}`;
}

function cloneConfig(config: TaxYearConfig): TaxYearConfig {
  return JSON.parse(JSON.stringify(config)) as TaxYearConfig;
}

function citeIsFinal(config: TaxYearConfig, cite: Cite): boolean {
  const kind = config.sources[cite.source]?.kind;
  return kind !== undefined && FINAL_CITE_KINDS.has(kind);
}

function citedFacts(config: TaxYearConfig): CitedFact[] {
  return [
    ...(config.parameters ?? []).map((parameter) => ({ ...parameter, bucket: `parameter` as const })),
    ...(config.pendingReview ?? []).map((entry) => ({ ...entry, bucket: `pendingReview` as const })),
  ];
}

function pageText(cite: Cite): string {
  if (cite.page === undefined) {
    return `no page`;
  }
  if (cite.pageEnd !== undefined && cite.pageEnd !== cite.page) {
    return `pages ${cite.page}-${cite.pageEnd}`;
  }
  return `page ${cite.page}`;
}

function recheckLine(fact: CitedFact, cite: Cite): string {
  const who =
    fact.bucket === `pendingReview` ? `${fact.fact} pendingReview (${fact.file})` : `${fact.fact} (${fact.file})`;
  return `- ${who} ${pageText(cite)}: ${cite.quote}`;
}

/** One line per cite of `sourceKey`, parameters first, then pendingReview, in file order. */
export function recheckText(config: TaxYearConfig, sourceKey: string): string {
  const lines: string[] = [];
  for (const fact of citedFacts(config)) {
    for (const cite of fact.cite ?? []) {
      if (cite.source === sourceKey) {
        lines.push(recheckLine(fact, cite));
      }
    }
  }
  return [`Recheck source ${sourceKey} (${lines.length}):`, ...lines].join(`\n`);
}

function dropSettledProvisional(config: TaxYearConfig, sourceKey: string): void {
  const facts = [...(config.parameters ?? []), ...(config.pendingReview ?? [])];
  for (const fact of facts) {
    const cites = fact.cite ?? [];
    if (!fact.provisional || !cites.some((cite) => cite.source === sourceKey)) {
      continue;
    }
    if (cites.every((cite) => citeIsFinal(config, cite))) {
      delete fact.provisional;
    }
  }
}

/**
 * Returns a new config. The input is not modified. Throws {@link RepinRefusal} when the URL host,
 * sha256, kind, or source key is not acceptable, and does not describe a partial rewrite.
 */
export function repinSource(config: TaxYearConfig, request: RepinRequest): RepinResult {
  const refusal = repinRefusal(config, request);
  if (refusal) {
    throw new RepinRefusal(refusal);
  }
  const next = cloneConfig(config);
  const source = next.sources[request.source];
  source.url = request.url;
  source.sha256 = request.sha256;
  source.kind = `final`;
  dropSettledProvisional(next, request.source);
  return { config: next, recheckText: recheckText(next, request.source) };
}

export function defaultConfigFile(): string {
  const registry = loadTaxYearRegistry();
  const entry = registry.years.find((year) => year.taxYear === registry.currentTaxYear);
  if (!entry) {
    throw new RepinRefusal(`current tax year ${registry.currentTaxYear} is not in the registry`);
  }
  return path.join(TAX_YEARS_FOLDER, entry.config);
}

function parseArgs(argv: string[]): RepinRequest & { file?: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!FLAGS.has(arg)) {
      throw new RepinRefusal(`unknown argument ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith(`--`)) {
      throw new RepinRefusal(`missing value for ${arg}`);
    }
    if (values.has(arg)) {
      throw new RepinRefusal(`duplicate argument ${arg}`);
    }
    values.set(arg, value);
    i += 1;
  }
  for (const flag of [`--source`, `--url`, `--sha256`, `--kind`]) {
    if (!values.has(flag)) {
      throw new RepinRefusal(`missing ${flag}`);
    }
  }
  return {
    source: values.get(`--source`) as string,
    url: values.get(`--url`) as string,
    sha256: values.get(`--sha256`) as string,
    kind: values.get(`--kind`) as string,
    file: values.get(`--file`),
  };
}

function writeAtomically(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  // nosemgrep: eslint.detect-non-literal-fs-filename
  fs.writeFileSync(tmp, text);
  // nosemgrep: eslint.detect-non-literal-fs-filename
  fs.renameSync(tmp, file);
}

/** Reads the year file, rewrites it when the result differs, and prints the recheck list. */
export function runRepinCli(argv: string[], io: RepinIo = defaultIo()): number {
  try {
    const args = parseArgs(argv);
    const file = args.file ?? defaultConfigFile();
    // nosemgrep: eslint.detect-non-literal-fs-filename
    const raw = fs.readFileSync(file, `utf8`);
    const config = JSON.parse(raw) as TaxYearConfig;
    const result = repinSource(config, args);
    const text = `${JSON.stringify(result.config, null, 2)}\n`;
    if (text !== raw) {
      writeAtomically(file, text);
    }
    io.log(result.recheckText);
    return 0;
  } catch (error) {
    if (error instanceof RepinRefusal) {
      io.error(error.message);
      return 1;
    }
    throw error;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  let self = ``;
  try {
    self = fileURLToPath(import.meta.url);
  } catch {
    // A loader can expose a non-file import.meta.url. That load is not the CLI.
    return false;
  }
  if (path.resolve(entry) === self) {
    return true;
  }
  // vite-node removes the script path from argv and leaves its own binary in argv[1].
  return path.basename(entry) === `vite-node` && path.basename(self) === `repinSource.ts`;
}

if (isDirectRun()) {
  process.exit(runRepinCli(process.argv.slice(2)));
}
