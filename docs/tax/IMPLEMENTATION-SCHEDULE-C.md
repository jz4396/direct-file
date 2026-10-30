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
   - `/flowKnockoutScheduleSEOutOfScope` — Schedule SE lines this tool does not compute, asked only after self-employment income is yes: farm profit and Conservation Reserve Program payments (lines 1a and 1b; 26 U.S.C. 1402(a), 1402(a)(1)), church employee income (lines 5a and 5b; 1402(a)(14), 1402(j)), an optional method (line 4b and Part II; 1402(a), 1402(l)), ministry or a Form 4361 or Form 4029 exemption (1402(a)(8), 1402(c)(4), 1402(e), 1402(g)), notary fees (1402(c)(1)), and Form 8919 wages (line 8c). An unanswered question stays incomplete. Every answer no leaves those lines blank and keeps the regular Schedule SE computation.
   - Additional Medicare tax on self-employment income is computed on Form 8959 (26 U.S.C. 1401(b)(2)). `/flowKnockoutScheduleCAdditionalMedicare` is not used.
9. Section is required: `/scheduleCSectionIsComplete` is part of `flow.xml` `/flowIncomplete`
10. Unset `/scheduleCBusinesses` collection: "no" (or section not reached) → $0, complete; "yes" with no businesses → incomplete, so `/totalTaxIsIncomplete` blocks submission

## Line-item expenses

A return that only stored one expense total still uses that total, and lines 2, 4, and 6 are zero. Once any Part I amount, stop answer, or expense answer is entered, the single total is ignored and Schedule C is figured from the lines.

Supported on that path: lines 1 through 8, 10, 11, 14, 15, 16a, 16c, 17 through 19, 20b, and 21 through 26. Line 24b is half of the meals entered, rounded half up (26 U.S.C. 274(n)). Part V accepts three other expenses; their total is lines 48 and 27b. Line 28 is the sum. Line 31 is line 7 minus line 28 (line 30 is blank because a home office stops the return). Two or more businesses still add into Schedule 1 line 3 and, for one filer, into Schedule SE line 2 before the 92.35 percent factor. A loss with material participation and every investment at risk (line 32a) flows. Anything else below stops the return, and an unanswered required amount stays incomplete rather than zero.

Simple Part III is figured. 2026 draft Schedule C, PDF p. 3, line 4: "Cost of goods sold (from line 42)." Line 35 is inventory at the beginning of the year. Line 36 is "Purchases less cost of items withdrawn for personal use" (purchases and withdrawals are entered separately; the form has no separate personal-use line). Line 37 is cost of labor, not including amounts paid to yourself. Line 38 is materials and supplies. Line 39 is other costs. Line 40: "Add lines 35 through 39." Line 41 is inventory at the end of the year. Line 42: "Cost of goods sold. Subtract line 41 from line 40. Enter the result here and on line 4." Each of those derived lines is rounded half up to the nearest dollar, the same way the other Schedule C lines in this tool are rounded. The result is Schedule C line 4, then line 5, line 7, line 31, Schedule 1 line 3, and Schedule SE line 2.

That path applies only when the business has inventory, line 33 is cost (33a) or lower of cost or market (33b), line 34 is no, line 42 is at least zero, line 35 equals last year's closing inventory, the filer is not a tax shelter, and the average annual gross receipts for the 3 prior tax years do not exceed $32,000,000. Rev. Proc. 2025-32 §4.30, PDF p. 23: the § 448(c) test "does not exceed $32,000,000." The instructions, PDF p. 16, say a small business taxpayer has "average annual gross receipts of $32 million or less for the 3 prior tax years (indexed for inflation), and (b) are not a tax shelter (as defined in section 448(d)(3))." 26 U.S.C. 471(c)(1) and 263A(i)(1) use that test. The filer enters the 3-prior-year average. This year's line 1 is not the test. An average equal to $32,000,000 still uses simple Part III. An average greater than $32,000,000 stops it. A tax shelter stops it. Line 42 below zero is not replaced with zero; it stops the return. Line 35 different from last year's closing inventory stops the return because the form says to attach an explanation. Section 263A uniform capitalization is not computed, and neither is a LIFO or other method.

An answer of no to inventory, with Part III left blank or zero, keeps line 4 at zero. The section 471(c)(1)(B)(i) method (inventory treated as non-incidental materials and supplies) with every Part III amount blank or zero is the same zero. Saying there is no inventory while a cost, lower-of-cost-or-market, or other method is selected, or while any Part III amount is greater than zero, stops the return. Saying there is inventory and then choosing that no-inventory method also stops it. Line 33c ("Other (attach explanation)") stops. Line 34 yes ("Was there any change in determining quantities, costs, or valuations between opening and closing inventory?") stops. An unanswered method, line 34, or amount on the simple path leaves line 4 incomplete. A stopped return does not publish line 4 as zero.

`PrintRefusingKnockouts.FACT_PATHS` did not gain or lose a path. `/flowKnockoutScheduleCOutOfScope` is still the print-refuse fact and is an operand of `/flowIsKnockedOut`. It is no longer true merely because the business has inventory valued at cost or lower of cost or market, with line 34 no, line 42 at least zero, line 35 equal to last year's closing inventory, a 3-prior-year average that does not exceed $32,000,000, and the filer not a tax shelter. It is still true for line 33c, a line 34 change, a 3-prior-year average greater than $32,000,000, a tax shelter, line 42 below zero, line 35 different from last year's closing inventory, the section 471(c) no-inventory method while Part III is required, Part III filled in after a no to inventory, and the other stops below. An unanswered Part III question stays incomplete, and an incomplete knockout refuses the print. Line 35's difference fact, and the line 42 sign fact, are complete and false when the business has no inventory path.

Stopped, and not printed as zero: Part III when it cannot be figured (line 33c, a line 34 change, a 3-prior-year average greater than $32,000,000, a tax shelter, line 42 below zero, line 35 different from last year's closing inventory, the section 471(c) no-inventory method while Part III is required, or Part III filled in after a no to inventory), car and truck expenses and vehicle-loan interest (lines 9 and 16b, Form 4562), depreciation and section 179 (line 13, Form 4562), depletion (line 12), rent of vehicles, machinery, and equipment (line 20a), business use of the home (line 30, Form 8829 or the simplified method), the energy efficient commercial buildings deduction (line 27a, Form 7205), meals that are not limited to 50 percent, wages reduced by Form 5884, 8932, or 8994, mortgage or other interest that must be allocated, amortization that begins this year (Form 4562-B), a fourth Part V line, line 6 income that is a fuel credit or Form 4797 recapture, a loss without material participation (Form 8582, 26 U.S.C. 469), and a loss that is not fully at risk (line 32b, Form 6198, 26 U.S.C. 465).

## Out of scope (explicit)

- Schedule C header items A, B, D, E, F, H, I, and J, and the line 1 statutory-employee checkbox
- Part V lines 4 through 9 (a fourth other expense stops the return)
- Form 461 excess business loss
- Statutory employees (already stopped on the Form W-2). Notary fees, church employee income, the optional methods, and farm income stop on `/flowKnockoutScheduleSEOutOfScope` instead of being left blank
- Additional 0.9% Medicare tax is computed on Form 8959 (26 U.S.C. 1401(b)(2))
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
| QBI unsupported cases | IRC § 199A | https://www.law.cornell.edu/uscode/text/26/199A |
| Inventories | IRC § 471(a) | https://www.law.cornell.edu/uscode/text/26/471 |
| Small-business inventory method | IRC § 471(c)(1) | https://www.law.cornell.edu/uscode/text/26/471 |
| Small-business exception from uniform capitalization | IRC § 263A(i) | https://www.law.cornell.edu/uscode/text/26/263A |
| Gross receipts test | IRC § 448(c) | https://www.law.cornell.edu/uscode/text/26/448 |
| Tax shelter | IRC § 448(d)(3) | https://www.law.cornell.edu/uscode/text/26/448 |
| Gross receipts test amount, taxable years beginning in 2026 | Rev. Proc. 2025-32 §4.30, PDF p. 23 | https://www.irs.gov/pub/irs-drop/rp-25-32.pdf |
| Schedule C lines 4 and 33–42 | 2026 draft Schedule C, PDF p. 3, SHA-256 287b4510dd847c11f6cbbcc98fee05ac5ff187cc18e1413f8759a4a7cd802224 | https://www.irs.gov/pub/irs-dft/f1040sc--dft.pdf |
| Part III and the small-business exception | 2026 draft Instructions for Schedule C, PDF pp. 16–17 | https://www.irs.gov/pub/irs-dft/i1040sc--dft.pdf |
| TY2026 wage base $184,500 | SSA Contribution and Benefit Base | https://www.ssa.gov/oact/cola/cbb.html |
| Same (Federal Register) | 90 FR 49047, at 49047 and 49050 (Nov. 3, 2025), FR Doc. 2025-19763 | https://www.federalregister.gov/d/2025-19763 · PDF https://www.govinfo.gov/content/pkg/FR-2025-11-03/pdf/2025-19763.pdf |
| Gap evidence | Pub 6048 | https://www.irs.gov/pub/irs-pdf/p6048.pdf |

### Snippets

> § 1401(a): "a tax equal to 12.4 percent of the amount of the self-employment income for such taxable year."

> § 1401(b)(1): "a tax equal to 2.9 percent of the amount of the self-employment income for such taxable year."

> § 1402(a)(12): "a deduction equal to the product of— (A) the taxpayer's net earnings from self-employment for the taxable year (determined without regard to this paragraph), and (B) one-half of the sum of the rates imposed by subsections (a) and (b) of section 1401" → 1 − (0.124 + 0.029)/2 = 0.9235.

> § 164(f)(1): "there shall be allowed as a deduction for the taxable year an amount equal to one-half of the taxes imposed by section 1401 (other than the taxes imposed by section 1401(b)(2)) for such taxable year."

> 2026 draft Schedule C, PDF p. 3, line 42: "Cost of goods sold. Subtract line 41 from line 40. Enter the result here and on line 4." Line 40: "Add lines 35 through 39." Line 36: "Purchases less cost of items withdrawn for personal use."

> 2026 draft Schedule C, PDF p. 3, line 35: "Inventory at beginning of year. If different from last year's closing inventory, attach explanation."

> 2026 draft Instructions for Schedule C, PDF p. 16: "If, however, you choose to keep an inventory, you must generally value the inventory each year to determine your cost of goods sold in Part III of Schedule C." Small business taxpayer: "You qualify as a small business taxpayer if you (a) have average annual gross receipts of $32 million or less for the 3 prior tax years (indexed for inflation), and (b) are not a tax shelter (as defined in section 448(d)(3))."

> 2026 draft Instructions for Schedule C, PDF p. 17, Line 35: "If there is a difference between last year's closing inventory and the refigured amount, attach an explanation."

> Rev. Proc. 2025-32 §4.30, PDF p. 23: "For taxable years beginning in 2026, a corporation or partnership meets the gross receipts test of § 448(c) for any taxable year if the average annual gross receipts of such entity for the 3-taxable-year period ending with the taxable year which precedes such taxable year does not exceed $32,000,000."

> § 471(a): "Whenever in the opinion of the Secretary the use of inventories is necessary in order clearly to determine the income of any taxpayer, inventories shall be taken by such taxpayer on such basis as the Secretary may prescribe as conforming as nearly as may be to the best accounting practice in the trade or business and as most clearly reflecting the income."

> § 448(c)(1): a corporation or partnership meets the gross receipts test "if the average annual gross receipts of such entity for the 3-taxable-year period ending with the taxable year which precedes such taxable year does not exceed $25,000,000." The 2026 inflation adjustment of that amount is the revenue procedure above.

> § 448(d)(3): "The term 'tax shelter' has the meaning given such term by section 461(i)(3) (determined after application of paragraph (4) thereof)."

> § 471(c)(1): a taxpayer that meets the § 448(c) gross receipts test, and is not a tax shelter prohibited from using the cash method under § 448(a)(3), is not required by § 471(a) to keep inventories, and the method is not treated as failing to clearly reflect income if it "treats inventory as non-incidental materials and supplies" or conforms to the taxpayer's financial accounting treatment.

> § 263A(i)(1): if the taxpayer meets the § 448(c) gross receipts test (same tax-shelter carveout), "this section shall not apply" for that year.

Hand worksheet, whole dollars, one business, no Part II expenses. Line 1 = 20,000. The 3-prior-year average is not over $32,000,000 and the filer is not a tax shelter. Line 35 = 1,000, equal to last year's closing inventory. Purchases = 5,000. Personal use = 200, so line 36 = 4,800. Line 37 = 300. Line 38 = 400. Line 39 = 50. Line 40 = 6,550. Line 41 = 1,500. Line 42 and line 4 = 5,050. Line 7 and line 31 = 14,950. Schedule 1 line 3 = 14,950. With no W-2 OASDI wages, net earnings = round(14,950 × 0.9235) = 13,806; OASDI = round(13,806 × 0.124) = 1,712; HI = round(13,806 × 0.029) = 400; SE tax = 2,112; deductible half = 1,056. Lower of cost or market uses the same arithmetic. A 3-prior-year average of $32,000,000 still computes, even when this year's line 1 is $32,000,001. A 3-prior-year average of $32,000,001 stops. A tax shelter stops. Line 42 of −100 stops and is not replaced with zero. A yes on the line 35 screener (opening inventory differs from last year's closing inventory) stops. The form's attach-explanation path is not computed.

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
