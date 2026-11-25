/**
 * Provisional year-config cites (issue 125).
 *
 * A form or instruction cite is a source whose `kind` is `draft` or `priorYear`, or `final` when
 * the title is a form, instructions, schedule, or booklet. Statute, Rev. Proc., and other `final`
 * sources (a notice, a Federal Register determination, a state bulletin, a publication) are not
 * form cites. Statute or Rev. Proc. cites alone count as final.
 *
 * The guard fails when:
 *   1. a parameter, or a pendingReview entry, whose every form or instruction cite is `draft` or
 *      `priorYear` has no `provisional`;
 *   2. a fact with `provisional` has a final form or instruction cite (the flag is stale);
 *   3. a source has no `kind` in `final` | `draft` | `priorYear` | `statute` | `revProc`.
 *
 * The backend mirror is Ty2026ProvisionalParametersTest. Keep the messages and the checklist
 * line format the same in both.
 */
import {
  Cite,
  Provisional,
  SOURCE_AUTHORITIES,
  SourceAuthority,
  TaxYearConfig,
  TaxYearSource,
} from './yearConfig.js';

/** Title words that make a `final` source a form or instruction rather than other final guidance. */
const FORM_TITLE = /\b(form|instructions|schedule|booklet)\b/i;

export interface CitedFact {
  fact: string;
  file: string;
  cite: Cite[];
  provisional?: Provisional;
  /** `parameter` or `pendingReview`, so the checklist can mark facts that are not parameters yet. */
  bucket: `parameter` | `pendingReview`;
}

const MISSING = (fact: string) =>
  `${fact}: every form or instruction cite is draft or priorYear, but provisional is missing`;
const STALE = (fact: string) => `${fact}: provisional is stale; a form or instruction cite is final`;
const SHAPE = (fact: string) => `${fact}: provisional needs reason, repinFrom, and tracking`;
const NO_KIND = (sourceId: string) => `${sourceId}: source has no kind`;

export function isFormOrInstructionSource(source: Pick<TaxYearSource, `kind` | `title`> | undefined): boolean {
  if (!source) {
    return false;
  }
  if (source.kind === `draft` || source.kind === `priorYear`) {
    return true;
  }
  return source.kind === `final` && FORM_TITLE.test(source.title ?? ``);
}

function allowedKind(kind: string | undefined): kind is SourceAuthority {
  return SOURCE_AUTHORITIES.includes(kind as SourceAuthority);
}

function nonBlank(value: unknown): value is string {
  return typeof value === `string` && value.trim().length > 0;
}

export function provisionalObject(value: Provisional | undefined): value is Provisional {
  return !!value && nonBlank(value.reason) && nonBlank(value.repinFrom) && nonBlank(value.tracking);
}

export function citedFacts(config: TaxYearConfig): CitedFact[] {
  return [
    ...config.parameters.map((parameter) => ({
      fact: parameter.fact,
      file: parameter.file,
      cite: parameter.cite ?? [],
      provisional: parameter.provisional,
      bucket: `parameter` as const,
    })),
    ...config.pendingReview.map((entry) => ({
      fact: entry.fact,
      file: entry.file,
      cite: entry.cite ?? [],
      provisional: entry.provisional,
      bucket: `pendingReview` as const,
    })),
  ];
}

/** Distinct form or instruction cites, in cite order. */
export function formCites(config: TaxYearConfig, cites: Cite[]): { id: string; kind: string }[] {
  const out: { id: string; kind: string }[] = [];
  const seen = new Set<string>();
  for (const cite of cites) {
    if (seen.has(cite.source)) {
      continue;
    }
    seen.add(cite.source);
    const source = config.sources[cite.source];
    if (!isFormOrInstructionSource(source)) {
      continue;
    }
    out.push({ id: cite.source, kind: source?.kind ?? `` });
  }
  return out;
}

function needsProvisional(forms: { kind: string }[]): boolean {
  return forms.length > 0 && forms.every((form) => form.kind === `draft` || form.kind === `priorYear`);
}

/** Failures of the three provisional rules, in source order then fact order. */
export function provisionalFindings(config: TaxYearConfig): string[] {
  const errors: string[] = [];
  for (const [id, source] of Object.entries(config.sources)) {
    if (!allowedKind(source?.kind)) {
      errors.push(NO_KIND(id));
    }
  }
  for (const entry of citedFacts(config)) {
    const forms = formCites(config, entry.cite);
    const present = entry.provisional != null;
    if (needsProvisional(forms) && !present) {
      errors.push(MISSING(entry.fact));
    } else if (present && !provisionalObject(entry.provisional)) {
      errors.push(SHAPE(entry.fact));
    } else if (present && forms.some((form) => form.kind === `final`)) {
      errors.push(STALE(entry.fact));
    }
  }
  return errors;
}

/** One checklist line per provisional flag, sorted by fact path. The re-pin sweep reads this. */
export function provisionalChecklistLines(config: TaxYearConfig): string[] {
  const lines = citedFacts(config)
    .filter((entry) => provisionalObject(entry.provisional))
    .map((entry) => {
      const interim = formCites(config, entry.cite)
        .filter((form) => form.kind === `draft` || form.kind === `priorYear`)
        .map((form) => form.id);
      const bucket = entry.bucket === `pendingReview` ? ` pendingReview` : ``;
      const flag = entry.provisional as Provisional;
      const interimText = interim.join(`, `);
      return (
        `- ${entry.fact}${bucket} (${entry.file}) repin from ${flag.repinFrom} ` +
        `[${flag.tracking}]; interim: ${interimText}`
      );
    });
  lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return lines;
}

export function provisionalChecklistText(config: TaxYearConfig): string {
  const lines = provisionalChecklistLines(config);
  return [`TY2026 provisional re-pin checklist (${lines.length}):`, ...lines].join(`\n`);
}
