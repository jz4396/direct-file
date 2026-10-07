# Gap: Schedule C + self-employment tax

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev.
**Tax year target:** 2026

## Audit sources (required on every claim)

### Statute (HTML)

- Gross income: [26 U.S.C. § 61](https://www.law.cornell.edu/uscode/text/26/61)
- Trade/business expenses: [26 U.S.C. § 162](https://www.law.cornell.edu/uscode/text/26/162)
- SE tax rates / definitions: [26 U.S.C. § 1401](https://www.law.cornell.edu/uscode/text/26/1401), [§ 1402](https://www.law.cornell.edu/uscode/text/26/1402)
- Deduction for employer-equivalent portion of SE tax: [26 U.S.C. § 164(f)](https://www.law.cornell.edu/uscode/text/26/164)
- QBI (if implemented): [26 U.S.C. § 199A](https://www.law.cornell.edu/uscode/text/26/199A)

### Forms / instructions (PDF)

- [Schedule C (Form 1040) — latest instructions PDF](https://www.irs.gov/instructions/i1040sc) (follow through to current-year PDF; cite **page number** of any line rule used)
- [Schedule SE instructions](https://www.irs.gov/instructions/i1040sse)
- Upstream scope exclusion (why this is a gap): [Pub 6048 (12-2024)](https://www.irs.gov/pub/irs-pdf/p6048.pdf) — Direct File did **not** support gig/business/rental income

### Snippet — Pub 6048 scope (audit trail for the gap itself)

From IRS Direct File eligibility materials (Pub 6048 / related outreach): taxpayers **cannot** use Direct File if they had other types of income such as gig economy, rental, or business income. Full PDF: https://www.irs.gov/pub/irs-pdf/p6048.pdf — quote the exact “Income” / exclusion bullets and note the **PDF page** when updating this PR after opening the PDF in implementation.

### Snippet — IRC § 1401(a) (SE tax)

> In addition to other taxes, there shall be imposed for each taxable year, on the self-employment income of every individual, a tax equal to 12.4 percent of the amount of the self-employment income for such taxable year…

Source: [26 U.S.C. § 1401](https://www.law.cornell.edu/uscode/text/26/1401). Pair with § 1401(b) hospital insurance and § 1402 definitions. TY2026 Social Security wage base: cite the SSA/IRS figure in the implementation PR (do not hardcode without a dated source).

### Snippet — IRC § 164(f) (deductible half of SE tax)

> In the case of an individual, … there shall be allowed as a deduction … an amount equal to … the taxes imposed by section 1401 … (employer-equivalent portion).

Source: [26 U.S.C. § 164(f)](https://www.law.cornell.edu/uscode/text/26/164#f).

**Standing rule:** implementation commits must paste the controlling instruction page or IRC subsection next to each computation.

## Current behavior (upstream)

Direct File excluded Schedule C / gig / business income. This fork targets full-return coverage.

## Product intent (MVP)

1. Interview for self-employment / gig / freelance income
2. One or more businesses
3. Gross receipts + expense categories (MVP subset OK if documented)
4. Net → Schedule 1 → AGI
5. Schedule SE + deductible half under § 164(f)
6. QBI § 199A: implement simple case **or** explicit non-support (no silent zero)

## Acceptance criteria (Rev review gate)

- [ ] Every formula cites IRC § or Schedule C/SE instructions **PDF page**
- [ ] W-2-only regression unchanged
- [ ] Simple cash Schedule C → AGI correct
- [ ] SE tax + § 164(f) deduction match cited law for TY2026 wage base
- [ ] Loss / zero SE documented
- [ ] QBI handled or explicitly blocked
- [ ] Proof scenario table in PR body

## Reviewer notes

High blast radius on AGI/credits. Feat merges only after Rev writeup.
