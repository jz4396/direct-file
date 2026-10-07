# Gap: Form 2441 (child and dependent care credit / benefits)

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev or Cod.
**Tax year target:** 2026

## Audit sources (required on every claim)

### Statute (HTML)

- Credit for household and dependent care services: [26 U.S.C. § 21](https://www.law.cornell.edu/uscode/text/26/21)
- Dependent care assistance exclusion: [26 U.S.C. § 129](https://www.law.cornell.edu/uscode/text/26/129)

### Forms / instructions (PDF)

- Draft TY2026 instructions: [Instructions for Form 2441 (2026)](https://www.irs.gov/pub/irs-dft/i2441--dft.pdf)
- Draft form: [Form 2441 (2026)](https://www.irs.gov/pub/irs-dft/f2441--dft.pdf)
- Hub: [IRS.gov/Form2441](https://www.irs.gov/form2441)
- Related: [Pub 503](https://www.irs.gov/pub503)

### Snippet — What’s New (credit % and phaseouts)

> Beginning in 2026, the maximum percentage used to figure the credit for child and dependent care expenses is increased from 35% to 50%, and higher adjusted gross income phaseout thresholds apply. As adjusted gross income increases, the percentage used to figure the credit is reduced, but not below 20%. For 2026, the percentage used to figure the credit ranges from 50% to 20%, compared to 35% to 20% for 2025. … For 2026, the 20% minimum percentage doesn’t apply until adjusted gross income exceeds $206,000 for joint filers and $103,000 for other filers.

Source: [2026 Instructions for Form 2441](https://www.irs.gov/pub/irs-dft/i2441--dft.pdf) — What’s New (instructions **p. 1** after coversheet).

### Snippet — Dependent care benefits exclusion

> Beginning in 2026, employers may increase the maximum amount that can be excluded from an employee’s income through a dependent care assistance program. The maximum amount is increased to $7,500 (previously $5,000). For certain married employees filing separate returns, the maximum amount is increased to $3,750 (previously $2,500).

Source: same PDF, What’s New (dependent care benefits).

### Snippet — 2026 Phaseout Schedule (line 8)

> If your filing status is married filing jointly and line 7 is… Over: $0 – But not over: $15,000 — The decimal amount to enter on line 8 is: .50 … Over: $206,000 – But not over: No limit — .20

(Same structure for other filing statuses with $103,000 → .20.)

Source: same PDF — **2026 Phaseout Schedule** (instructions content page labeled with the phaseout table; cite printed page in implementation).

### Snippet — IRC § 21

> … there shall be allowed as a credit against the tax imposed by this chapter for the taxable year an amount equal to the applicable percentage of the employment-related expenses …

Source: [26 U.S.C. § 21](https://www.law.cornell.edu/uscode/text/26/21).

**Standing rule:** percentage table, expense caps ($3,000 / $6,000), and $7,500 exclusion must cite instruction PDF page + quote or IRC §.

## Current behavior (upstream)

Pub 6048 listed Child and Dependent Care Credit among Direct File credits for some seasons, but TY2026 law changes (50% max, new phaseouts, $7,500 exclusion) need an explicit audited implementation in this fork.

## Product intent (MVP)

1. Qualifying person(s) + provider TIN rules per instructions
2. Expense caps: $3,000 / $6,000 (form lines)
3. Credit % from TY2026 phaseout schedule (50% → 20%)
4. Part III dependent care benefits with $7,500 / $3,750 caps
5. Credit → Schedule 3 / Form 1040 correctly

## Acceptance criteria (Rev review gate)

- [ ] 50%→20% schedule and $206k / $103k thresholds match instruction cite
- [ ] $7,500 / $3,750 exclusion caps match cite
- [ ] Expense dollar limits cite form/instructions
- [ ] Joint / MFS / earned-income rules handled or blocked with cite
- [ ] Proof scenario table in implementation PR body

## Reviewer notes

Medium–high blast radius on credits. Feat merges only after Rev writeup.
