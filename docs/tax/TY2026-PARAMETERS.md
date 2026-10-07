# TY2026 tax parameters — compliance spec

**Status:** Implementation in progress on this branch (Dev). Spec retained for audit.
**Tax year:** 2026 (returns filed in calendar 2027)
**Upstream baseline:** Fact dictionary / interview logic as of Tax Year 2024.

## Audit sources (required on every claim)

Primary PDF: [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) (36 pages).  
Newsroom HTML: [IR-2025-103](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill).  
Statute HTML: [26 U.S.C. § 1](https://www.law.cornell.edu/uscode/text/26/1), [§ 24](https://www.law.cornell.edu/uscode/text/26/24), [§ 32](https://www.law.cornell.edu/uscode/text/26/32), [§ 63](https://www.law.cornell.edu/uscode/text/26/63).

**Standing rule:** every dollar amount in implementation PRs must cite PDF page + quote (or IRC HTML link + subsection).

### Standard deduction — Rev. Proc. 2025-32, **p. 18**, §4.14

> For taxable years beginning in 2026, the standard deduction amounts under § 63(c)(2) are as follows:  
> Married Individuals Filing Joint Returns and Surviving Spouses — **$32,200**  
> Heads of Households — **$24,150**  
> Unmarried Individuals … — **$16,100**  
> Married Individuals Filing Separate Returns — **$16,100**

Aged/blind add-on (same page): **$1,650**; **$2,050** if also unmarried and not a surviving spouse.

### Ordinary rate tables — Rev. Proc. 2025-32, **pp. 10–12**, §4.01

Snippet (Unmarried / Table 3, pp. 11–12):

> Not over $12,400 — 10%  
> Over $12,400 but not over $50,400 — $1,240 plus 12% of the excess over $12,400  
> … Over $640,600 — $192,979.25 plus 37% of the excess over $640,600

MFJ Table 1 starts p. 10 (10% not over $24,800; 37% over $768,700). Implement **all four** tables from the PDF — do not extrapolate.

### Child Tax Credit — Rev. Proc. 2025-32, **p. 14**, §4.05

> (1) Maximum amount of the credit. For taxable years beginning in 2026, the maximum amount of the credit allowed under § 24(a) is **$2,200**.  
> (2) Refundable portion. … the amount used in § 24(d)(1)(A) … is **$1,700**.

OBBBA background (same Rev. Proc., section 2): amends § 24(h) so the maximum credit is $2,200 — confirm against PDF §2 when wiring permanence flags.

IRC text (HTML): [26 U.S.C. § 24](https://www.law.cornell.edu/uscode/text/26/24) — note LII may lag OBBBA; **prefer Rev. Proc. 2025-32 for TY2026 dollar amounts**.

### EITC — Rev. Proc. 2025-32, **pp. 14–15**, §4.06

> Maximum Amount of Credit — One $4,427 · Two $7,316 · Three or More **$8,231** · None $664  
> (full earned-income / phaseout table on **p. 15**)

Investment-income disqualifier TY2026: **$12,200** (p. 15, §4.06(2)).

### Preferential capital gains breakpoints — Rev. Proc. 2025-32, **p. 13**, §4.03

> Maximum zero rate / 15% rate amounts under § 1(j)(5)(B) for 2026 — e.g. MFJ **$98,900** / **$613,700**; unmarried **$49,450** / **$545,500** (full table on p. 13).

(Used by Schedule D PR; included here so parameter work owns the source of truth.)

## Why this PR exists

Upstream Direct File hardcodes TY2024 amounts. Shipping TY2026 without refreshing these produces incorrect Form 1040 line items.

## Likely code touchpoints

1. `direct-file/df-client/df-client-app/src/fact-dictionary/`
2. Year / constants XML under fact-dictionary
3. `.../src/test/factDictionaryTests`
4. PDF / MeF form-year mappings
5. Locales mentioning "2024"

## Out of scope

- New schedules (C/D/E) — separate PRs
- Year-config framework (PM #2)
- Non-enacted bills

## Acceptance criteria (Rev review gate)

- [x] Each changed amount cites Rev. Proc. 2025-32 **page + quote** (or IRC HTML §)
- [x] `/taxYear` === 2026
- [x] Std deduction + age/blind add-ons match p. 18
- [x] All four bracket tables match pp. 10–12
- [x] CTC $2,200 / ACTC $1,700 match p. 14
- [x] EITC table matches p. 15
- [x] Fact-dictionary tests updated; proof pasted in PR
- [x] No non-enacted legislation

## Reviewer notes

High blast radius. @Feat merges only after Rev compliance writeup + proof.
