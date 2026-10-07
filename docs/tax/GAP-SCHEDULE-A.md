# Gap: Schedule A (itemized deductions)

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev or Cod.
**Tax year target:** 2026

## Audit sources (required on every claim)

### Statute (HTML)

- Election to itemize: [26 U.S.C. § 63(e)](https://www.law.cornell.edu/uscode/text/26/63)
- Standard deduction baseline (compare vs itemize): [26 U.S.C. § 63(c)](https://www.law.cornell.edu/uscode/text/26/63) — TY2026 amounts in [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) **p. 18**
- Taxes (SALT): [26 U.S.C. § 164](https://www.law.cornell.edu/uscode/text/26/164)
- Qualified residence interest: [26 U.S.C. § 163(h)](https://www.law.cornell.edu/uscode/text/26/163)
- Charitable contributions: [26 U.S.C. § 170](https://www.law.cornell.edu/uscode/text/26/170)
- Medical expenses: [26 U.S.C. § 213](https://www.law.cornell.edu/uscode/text/26/213)
- Overall limitation on itemized deductions: [26 U.S.C. § 68](https://www.law.cornell.edu/uscode/text/26/68)

### Forms / instructions (PDF)

- Draft TY2026 form: [Schedule A (Form 1040) (2026)](https://www.irs.gov/pub/irs-dft/f1040sa--dft.pdf)
- Hub: [IRS.gov/ScheduleA](https://www.irs.gov/schedulea) (attach final 2026 instructions PDF page cites when published)
- Std deduction compare: [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) **p. 18**

### Snippet — Schedule A (2026) line 5e SALT cap (form PDF p. 2)

> Enter the smaller of line 5d or $40,400 ($20,200 if married filing separately)…
> …If Form 1040 or 1040-SR, line 11b, is more than $505,000 ($252,500 if married filing separately)…

Source: [2026 Schedule A (Form 1040) draft](https://www.irs.gov/pub/irs-dft/f1040sa--dft.pdf) PDF **page 2** (Taxes You Paid / line 5e).

### Snippet — Rev. Proc. 2025-32 p. 18 (standard deduction — itemize vs take std)

> For taxable years beginning in 2026, the standard deduction amounts under § 63(c)(2) are as follows: … Married … $32,200 … Heads of Households … $24,150 … Unmarried Individuals … $16,100 … Married Individuals Filing Separate Returns … $16,100.

Source: [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) **p. 18** §4.14.

### Snippet — IRC § 63(e) (election)

> … a taxpayer may elect to itemize deductions…

Source: [26 U.S.C. § 63(e)](https://www.law.cornell.edu/uscode/text/26/63).

**Standing rule:** every dollar (SALT cap, phaseout, medical floor, charitable %, § 68 limit) cites form/instructions PDF page + quote **or** IRC subsection.

## Current behavior (upstream)

Upstream Direct File was largely standard-deduction oriented. Full-return fork needs Schedule A when itemizing beats std deduction (esp. with TY2026 SALT cap $40,400).

## Product intent (MVP)

1. Compare Schedule A total vs TY2026 standard deduction; elect larger (or allow forced itemize)
2. MVP lines: medical (§ 213 floor), SALT (line 5a–5e with $40,400 / phaseout), mortgage interest, charitable
3. Apply § 68 overall limitation when AGI threshold met (cite worksheet / instructions page)
4. Explicit non-support OK for rare lines if documented (no silent zero)

## Acceptance criteria (Rev review gate)

- [ ] SALT $40,400 / $20,200 MFS and $505,000 / $252,500 phaseout threshold match form PDF cite
- [ ] Std-deduction compare uses Rev. Proc. 2025-32 p. 18 figures
- [ ] Medical / charitable / mortgage formulas cite IRC or instructions page
- [ ] § 68 limitation handled or explicitly blocked with cite
- [ ] Proof scenario table in implementation PR body

## Reviewer notes

High blast radius on taxable income. Feat merges only after Rev writeup.
