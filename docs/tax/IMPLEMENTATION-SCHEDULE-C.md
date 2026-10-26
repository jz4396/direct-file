# Implementation: Schedule C + SE tax (vertical slice)

**Implements:** [GAP-SCHEDULE-C.md](./GAP-SCHEDULE-C.md) / gap PR [#3](https://github.com/jz4396/direct-file/pull/3)
**Tax year:** TY2026, filed in 2027
**Blast radius:** **high** — total income / AGI, ACTC earned income, Schedule 1 line 15 (§ 164(f)) adjustment, Schedule 2 line 21 / Form 1040 line 23–24 (SE tax).

## What this slice ships

1. Interview gate for self-employment / gig / freelance income (`/hadSelfEmploymentIncome`)
2. One or more Schedule C businesses (name, gross receipts, MVP expense total)
3. Net profit/(loss) `/scheduleCNetProfitOrLoss` → Schedule 1 line 3 → `income.xml` `/otherIncome` (Schedule 1 line 10 → Form 1040 line 8) → `/totalIncome` (Form 1040 line 9)
4. Schedule SE, one per filer with SE income (#118): net earnings = that filer's net profit × 92.35%, 12.4% OASDI (wage base reduced by that filer's own W-2 boxes 3 and 7, § 1402(b)(1)), 2.9% HI. Schedule 2 line 4 = sum of each line 12; Schedule 1 line 15 = sum of each line 13; Form 8959 line 13 = sum of each line 6
5. `/selfEmploymentTax` → Schedule 2 line 4 / line 21 (`/line21OfSchedule2`) → Form 1040 line 23 → `/totalTax` (line 24)
6. `/deductibleSelfEmploymentTax` (one-half, § 164(f)) → Schedule 1 line 15 → `/adjustmentsToIncome` → `/agi`
7. ACTC earned income (`/earnedIncomeWithAllCombatPay`, Schedule 8812 line 18a) += net profit − deductible SE tax
8. **Explicit knockouts (no silent zero / no silent mis-statement)**, both `BlockSubmissionOnTrue` and in `/flowIsKnockedOut`:
   - `/flowKnockoutScheduleCQbi` — § 199A QBI deduction requested
   - `/flowKnockoutScheduleCSpouseBusiness` — any business owned by the secondary filer. Schedule SE is figured per spouse, but EITC/CDCC earned income with self-employment are not per spouse yet, and no Schedule SE PDF is printed yet
   - `/flowKnockoutScheduleCEarnedIncomeCredits` — a Schedule C loss when the EITC could apply (AGI below the completed phaseout) or the CDCC or CTC applies, since `/scheduleCNetProfitForEarnedIncome` floors a loss at zero; or a joint return with a Schedule C claiming the CDCC (Form 2441 lines 4 and 5 need per-spouse Schedule SE)
   - `/flowKnockoutScheduleCAdditionalMedicare`: W-2 Medicare wages (`formW2s /formW2totalMedicareWages`) + net SE earnings (92.35% figure) > `formW2s /medicareWagesAdditionalTaxThreshhold` ($200k / $250k MFJ / $125k MFS), when SE tax applies. Under 26 U.S.C. § 1401(b)(2)(A) the 0.9% Additional Medicare Tax hits SE income above the threshold, and § 1401(b)(2)(B) reduces the threshold by FICA wages (https://www.law.cornell.edu/uscode/text/26/1401#b_2). The wage-only `/knockoutMedicareWages` misses e.g. single $150k wages + $100k profit (150,000 + 92,350 > 200,000, about $381 owed). Form 8959 is not computed, so this case is knocked out.
9. Section is required: `/scheduleCSectionIsComplete` is part of `flow.xml` `/flowIncomplete`
10. Unset `/scheduleCBusinesses` collection: "no" (or section not reached) → $0, complete; "yes" with no businesses → incomplete, so `/totalTaxIsIncomplete` blocks submission

## Line-item expenses

A return that only stored one expense total still uses that total, and lines 2, 4, and 6 are zero. Once any Part I amount, stop answer, or expense answer is entered, the single total is ignored and Schedule C is figured from the lines.

Supported on that path: lines 1 through 8, 10, 11, 14, 15, 16a, 16c, 17 through 19, 20b, and 21 through 26. Line 24b is half of the meals entered, rounded half up (26 U.S.C. 274(n)). Part V accepts three other expenses; their total is lines 48 and 27b. Line 28 is the sum. Line 31 is line 7 minus line 28 (line 30 is blank because a home office stops the return). Two or more businesses still add into Schedule 1 line 3 and, for one filer, into Schedule SE line 2 before the 92.35 percent factor. A loss with material participation and every investment at risk (line 32a) flows. Anything else below stops the return, and an unanswered required amount stays incomplete rather than zero.

Stopped, and not printed as zero: inventory and cost of goods sold (Part III), car and truck expenses and vehicle-loan interest (lines 9 and 16b, Form 4562), depreciation and section 179 (line 13, Form 4562), depletion (line 12), rent of vehicles, machinery, and equipment (line 20a), business use of the home (line 30, Form 8829 or the simplified method), the energy efficient commercial buildings deduction (line 27a, Form 7205), meals that are not limited to 50 percent, wages reduced by Form 5884, 8932, or 8994, mortgage or other interest that must be allocated, amortization that begins this year (Form 4562-B), a fourth Part V line, line 6 income that is a fuel credit or Form 4797 recapture, a loss without material participation (Form 8582, 26 U.S.C. 469), and a loss that is not fully at risk (line 32b, Form 6198, 26 U.S.C. 465).

## Out of scope (explicit)

- Schedule C header items A, B, D, E, F, H, I, and J, and the line 1 statutory-employee checkbox
- Part V lines 4 through 9 (a fourth other expense stops the return)
- Form 461 excess business loss
- Notary-public exclusion from self-employment tax, church-employee income, the optional methods, farm income, and statutory employees
- Additional 0.9% Medicare tax (Form 8959): not computed; knocked out when wages + SE earnings exceed the threshold (see above)
- QBI § 199A computation (knocked out)
- EITC / CDCC earned income from a Schedule C loss, and CDCC on a joint return with a Schedule C (knocked out, see above). A profit is included: Schedule SE line 3 minus Schedule 1 line 15 (Form 1040 instructions (2025) EIC Worksheet B, PDF p. 47; 2026 draft Form 2441 instructions, PDF p. 5)
- MFJ spouse-owned business (per-spouse Schedule SE facts exist; the knockout stays until EITC/CDCC earned income is per spouse and a Schedule SE PDF prints for each spouse)
- Public print of a Schedule C return is still refused because Form 8995 has no 2026 template. The Schedule C draft itself is mapped. No MeF for these lines yet. The Spanish Schedule C draft is not in the package.

## Primary sources

| Claim | Source | Link |
| --- | --- | --- |
| Gross income | IRC § 61 | https://www.law.cornell.edu/uscode/text/26/61 |
| Expenses | IRC § 162 | https://www.law.cornell.edu/uscode/text/26/162 |
| SE tax 12.4% / 2.9% | IRC § 1401(a), (b)(1) | https://www.law.cornell.edu/uscode/text/26/1401 |
| 92.35% factor | IRC § 1402(a)(12) | https://www.law.cornell.edu/uscode/text/26/1402 |
| $400 threshold | IRC § 1402(b) | https://www.law.cornell.edu/uscode/text/26/1402 |
| Deductible half | IRC § 164(f)(1) | https://www.law.cornell.edu/uscode/text/26/164#f |
| QBI unsupported | IRC § 199A | https://www.law.cornell.edu/uscode/text/26/199A |
| TY2026 wage base $184,500 | SSA Contribution and Benefit Base | https://www.ssa.gov/oact/cola/cbb.html |
| Same (Federal Register) | 90 FR 49047, at 49047 and 49050 (Nov. 3, 2025), FR Doc. 2025-19763 | https://www.federalregister.gov/d/2025-19763 · PDF https://www.govinfo.gov/content/pkg/FR-2025-11-03/pdf/2025-19763.pdf |
| Gap evidence | Pub 6048 | https://www.irs.gov/pub/irs-pdf/p6048.pdf |

### Snippets

> § 1401(a): "a tax equal to 12.4 percent of the amount of the self-employment income for such taxable year."

> § 1401(b)(1): "a tax equal to 2.9 percent of the amount of the self-employment income for such taxable year."

> § 1402(a)(12): "a deduction equal to the product of— (A) the taxpayer's net earnings from self-employment for the taxable year (determined without regard to this paragraph), and (B) one-half of the sum of the rates imposed by subsections (a) and (b) of section 1401" → 1 − (0.124 + 0.029)/2 = 0.9235.

> § 164(f)(1): "there shall be allowed as a deduction for the taxable year an amount equal to one-half of the taxes imposed by section 1401 (other than the taxes imposed by section 1401(b)(2)) for such taxable year."

> SSA cbb.html: "For earnings in 2026, this base is $184,500."

> 90 FR 49050: "The OASDI contribution and benefit base is $184,500 for remuneration paid in 2026 and self-employment income earned in tax years beginning in 2026."

### Proof scenarios (no W-2 OASDI wages)

| # | Gross | Exp | Net | NESE | SE tax | § 164(f) | AGI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 10,000 | 2,000 | 8,000 | 7,388 | 1,130 | 565 | 7,435 |
| B | 500 | 200 | 300 | 277 | 0 | 0 | — |
| C | 1,000 | 1,500 | −500 | 0 | 0 | 0 | — |
| D | 70,000 | 10,000 | 60,000 | 55,410 | 8,478 | 4,239 | 55,761 |

- A: NESE = round(8,000 × 0.9235) = 7,388; OASDI = round(7,388 × 0.124) = 916; HI = round(7,388 × 0.029) = 214; SE = 1,130; half = 565. EITC earned income 8,000 − 565 = 7,435; no qualifying child, EIC $568.
- B: NESE 277 < $400 → no SE tax (§ 1402(b)).
- D: OASDI = round(55,410 × 0.124) = 6,871; HI = round(55,410 × 0.029) = 1,607; SE = 8,478 → Sch 2 line 21 / 1040 line 23; half = 4,239 → Sch 1 line 15; AGI = 60,000 − 4,239 = 55,761; total tax = income tax after credits + 8,478.

Tests: `direct-file/df-client/df-client-app/src/test/factDictionaryTests/scheduleC.test.ts` and `scheduleCExpenses.test.ts`.

## Locale strings

`en.yaml` / `es.yaml` are ~1.4 MB each, so the slice ships its strings as overlays
(`src/locales/en.scheduleC.yaml`, `src/locales/es.scheduleC.yaml`) that `src/locales/featureLocales.ts` deep-merges
onto the base files. The app (`locales/index.ts`) and the locale/flow tests that check flow keys
(flowTranslation, flowLocaleStrings, localeParity, yamlStructure, SubSubCategory, DataReveal) read the merged
locale.

## Review

Compliance review before merge. Keep cites intact.
