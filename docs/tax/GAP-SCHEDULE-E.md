# Gap: Schedule E (supplemental income / rental)

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev or Cod.
**Tax year target:** 2026

## Audit sources (required on every claim)

### Statute (HTML)

- Gross income: [26 U.S.C. § 61](https://www.law.cornell.edu/uscode/text/26/61)
- Expenses for production of income: [26 U.S.C. § 212](https://www.law.cornell.edu/uscode/text/26/212)
- Passive activity losses: [26 U.S.C. § 469](https://www.law.cornell.edu/uscode/text/26/469)
- At-risk rules: [26 U.S.C. § 465](https://www.law.cornell.edu/uscode/text/26/465)
- Excess business loss: [26 U.S.C. § 461(l)](https://www.law.cornell.edu/uscode/text/26/461) (Form 461)
- QBI (if rental qualifies): [26 U.S.C. § 199A](https://www.law.cornell.edu/uscode/text/26/199A)

### Forms / instructions (PDF)

- Draft TY2026 instructions: [Instructions for Schedule E (Form 1040) (2026)](https://www.irs.gov/pub/irs-dft/i1040se--dft.pdf)
- Draft form: [Schedule E (Form 1040) (2026)](https://www.irs.gov/pub/irs-dft/f1040se--dft.pdf)
- Hub: [IRS.gov/ScheduleE](https://www.irs.gov/schedulee)
- Gap evidence (upstream exclusion): [Pub 6048 (12-2024)](https://www.irs.gov/pub/irs-pdf/p6048.pdf) **p. 2**

### Snippet — Pub 6048 p. 2 (why this is a gap)

> Taxpayers can't use Direct File if they had other types of income, such as gig economy, rental, or business income.

Source: [Pub 6048](https://www.irs.gov/pub/irs-pdf/p6048.pdf) PDF **page 2**.

### Snippet — Schedule E instructions (General Instructions)

> Use Schedule E (Form 1040) to report income or loss from rental real estate, royalties, partnerships, S corporations, estates, trusts, and residual interests in REMICs.

Source: [2026 Instructions for Schedule E](https://www.irs.gov/pub/irs-dft/i1040se--dft.pdf) — General Instructions (instructions content after coversheet; cite the printed page when implementing).

### Snippet — TY2026 What’s New (mileage / §179)

> The standard mileage rate for miles driven in connection with your rental activities increased. For January 1, 2026, through June 30, 2026, the rate is 72.5 cents a mile. For July 1, 2026, through December 31, 2026, the rate is 76 cents a mile.

> For 2026, the maximum section 179 expense deduction is $2,560,000. This amount is reduced by the amount by which the cost of section 179 property placed in service exceeds $4,090,000.

Source: same PDF, What’s New section (first instructions page after coversheet).

**Standing rule:** every computation cites IRC § or Schedule E instructions **PDF page** + quote.

## Current behavior (upstream)

Direct File excluded rental / Schedule E. This fork targets full-return coverage.

## Product intent (MVP)

1. Interview for rental real estate and/or royalties (Part I)
2. Income + expense categories; net → Schedule 1
3. Document passive-activity / at-risk treatment (implement simple case **or** explicit non-support — no silent zero)
4. K-1 / partnership / S-corp (Part II): implement later **or** block with clear message
5. Excess business loss → Form 461 path documented

## Acceptance criteria (Rev review gate)

- [ ] Every formula cites IRC § or Schedule E instructions **PDF page**
- [ ] W-2-only regression unchanged
- [ ] Simple cash rental → Schedule 1 / AGI correct
- [ ] Passive / at-risk / excess-loss rules handled or explicitly blocked
- [ ] Mileage / §179 amounts (if used) match TY2026 cited figures
- [ ] Proof scenario table in implementation PR body

## Reviewer notes

High blast radius on AGI/NIIT/credits. Feat merges only after Rev writeup.
