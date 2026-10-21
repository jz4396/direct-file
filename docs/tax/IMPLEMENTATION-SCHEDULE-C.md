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
   - `/flowKnockoutScheduleCEarnedIncomeCredits` — nonzero Schedule C with EITC or CDCC eligibility (those modules still use wages-only earned income), or a Schedule C loss with CTC eligibility (ACTC earned income floors the SE component at zero)
   - `/flowKnockoutScheduleCAdditionalMedicare`: W-2 Medicare wages (`formW2s /formW2totalMedicareWages`) + net SE earnings (92.35% figure) > `formW2s /medicareWagesAdditionalTaxThreshhold` ($200k / $250k MFJ / $125k MFS), when SE tax applies. Under 26 U.S.C. § 1401(b)(2)(A) the 0.9% Additional Medicare Tax hits SE income above the threshold, and § 1401(b)(2)(B) reduces the threshold by FICA wages (https://www.law.cornell.edu/uscode/text/26/1401#b_2). The wage-only `/knockoutMedicareWages` misses e.g. single $150k wages + $100k profit (150,000 + 92,350 > 200,000, about $381 owed). Form 8959 is not computed, so this case is knocked out.
9. Section is required: `/scheduleCSectionIsComplete` is part of `flow.xml` `/flowIncomplete`
10. Unset `/scheduleCBusinesses` collection: "no" (or section not reached) → $0, complete; "yes" with no businesses → incomplete, so `/totalTaxIsIncomplete` blocks submission

## Out of scope (explicit)

- Schedule C Part II category-level expense lines
- Farm optional methods / Schedule F / church employee income
- Additional 0.9% Medicare tax (Form 8959): not computed; knocked out when wages + SE earnings exceed the threshold (see above)
- QBI § 199A computation (knocked out)
- EITC / CDCC earned income from self-employment (knocked out, see above)
- MFJ spouse-owned business (per-spouse Schedule SE facts exist; the knockout stays until EITC/CDCC earned income is per spouse and a Schedule SE PDF prints for each spouse)
- Schedule C / SE PDF print (Phase A print will expand PDFBox TY2024 → TY2026 templates in a follow-up); no MeF

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

- A: NESE = round(8,000 × 0.9235) = 7,388; OASDI = round(7,388 × 0.124) = 916; HI = round(7,388 × 0.029) = 214; SE = 1,130; half = 565. (EITC-eligible → knocked out.)
- B: NESE 277 < $400 → no SE tax (§ 1402(b)).
- D: OASDI = round(55,410 × 0.124) = 6,871; HI = round(55,410 × 0.029) = 1,607; SE = 8,478 → Sch 2 line 21 / 1040 line 23; half = 4,239 → Sch 1 line 15; AGI = 60,000 − 4,239 = 55,761; total tax = income tax after credits + 8,478.

Tests: `direct-file/df-client/df-client-app/src/test/factDictionaryTests/scheduleC.test.ts`.

## Locale strings

`en.yaml` / `es.yaml` are ~1.4 MB each, so the slice ships its strings as overlays
(`src/locales/en.scheduleC.yaml`, `src/locales/es.scheduleC.yaml`) that `src/locales/featureLocales.ts` deep-merges
onto the base files. The app (`locales/index.ts`) and the locale/flow tests that check flow keys
(flowTranslation, flowLocaleStrings, localeParity, yamlStructure, SubSubCategory, DataReveal) read the merged
locale.

## Review

Compliance review before merge. Keep cites intact.
