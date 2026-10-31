# Gap: Schedule C + self-employment tax

**Status:** Supported Part I and Part II lines, simple Part III (lines 35–42 to line 4, cost or lower of cost or market, for a small business taxpayer who is not a tax shelter, with line 42 at least zero and line 35 equal to last year's closing inventory), three Part V lines, and the out-of-scope stops are in this tree, on top of the single expense total, Schedule SE, Schedule 1 line 3, and the section 164(f) deduction. The nonfarm optional method (Schedule SE line 4b and Part II lines 16 and 17) is figured when the filer elects it and the dollar tests and prior-year tests are met. An election that applies stops when the earned income credit, the additional child tax credit, or the child and dependent care credit is claimed; that stop is not part of Schedule C section completeness. Schedule SE lines this tool does not compute (farm, the farm optional method, church employee income, ministry or Forms 4361 and 4029, notary fees, and Form 8919) stop the return. What is still open is listed in IMPLEMENTATION-SCHEDULE-C.md.
**Tax year target:** TY2026, filed in 2027

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

### Snippet — IRC § 1401(a) (SE tax)

> In addition to other taxes, there shall be imposed for each taxable year, on the self-employment income of every individual, a tax equal to 12.4 percent of the amount of the self-employment income for such taxable year…

Source: [26 U.S.C. § 1401](https://www.law.cornell.edu/uscode/text/26/1401).

### Snippet — IRC § 164(f) (deductible half of SE tax)

> In the case of an individual, in addition to the taxes described in subsection (a), there shall be allowed as a deduction for the taxable year an amount equal to one-half of the taxes imposed by section 1401 (other than the taxes imposed by section 1401(b)(2)) for such taxable year.

Source: [26 U.S.C. § 164(f)](https://www.law.cornell.edu/uscode/text/26/164#f).

**Standing rule:** implementation commits must paste the controlling instruction page or IRC subsection next to each computation.

## Product intent (MVP)

1. Interview for self-employment / gig / freelance income
2. One or more businesses
3. Gross receipts + expense categories (MVP subset OK if documented)
4. Net → Schedule 1 → AGI
5. Schedule SE + deductible half under § 164(f)
6. QBI § 199A: implement simple case **or** explicit non-support (no silent zero)

## Acceptance criteria (review gate)

- [ ] Every formula cites IRC § or Schedule C/SE instructions **PDF page**
- [ ] W-2-only regression unchanged
- [ ] Simple cash Schedule C → AGI correct
- [ ] SE tax + § 164(f) deduction match cited law for TY2026 wage base
- [ ] Loss / zero SE documented
- [ ] QBI handled or explicitly blocked
- [ ] Proof scenario table in PR body

## Reviewer notes

High blast radius on AGI/credits. Merge only after the tax + security review writeup.
