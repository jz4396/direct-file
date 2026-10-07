# TY2026 tax parameters — compliance spec

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev.
**Tax year:** 2026 (returns filed in calendar 2027)
**Authority:** IRS IR-2025-103; Revenue Procedure 2025-32; One, Big, Beautiful Bill Act (P.L. 119-21) individual provisions as reflected in IRS guidance.
**Upstream baseline:** Fact dictionary / interview logic as of Tax Year 2024.

## Why this PR exists

Upstream Direct File hardcodes TY2024 amounts and year flags. Shipping TY2026 without refreshing these parameters produces incorrect Form 1040 line items (standard deduction, brackets, EITC, CTC, AMT, etc.). This is the highest-priority tax-code gap.

## Required TY2026 amounts (authoritative for this PR)

### Standard deduction (OBBBA + inflation)

| Filing status | TY2026 |
| --- | ---: |
| Single / MFS | $16,100 |
| Married filing jointly / Surviving spouse | $32,200 |
| Head of household | $24,150 |

Additional amounts for age 65+ / blindness must continue to follow IRC §63 and Rev. Proc. 2025-32 (implement from the Rev. Proc. table; do not invent).

### Ordinary income brackets (single; MFJ in parentheses)

| Rate | Taxable income over |
| ---: | ---: |
| 10% | $0 ($0) |
| 12% | $12,400 ($24,800) |
| 22% | $50,400 ($100,800) |
| 24% | $105,700 ($211,400) |
| 32% | $201,775 ($403,550) |
| 35% | $256,225 ($512,450) |
| 37% | $640,600 ($768,700) |

Confirm HoH / MFS / QSS tables from Rev. Proc. 2025-32 when wiring facts — do not extrapolate only from Single/MFJ.

### Child Tax Credit (OBBBA §70104)

- Maximum CTC: **$2,200** per qualifying child under 17
- Refundable ACTC cap: **$1,700** per child (as confirmed for TY2026 under OBBBA indexing rules)
- Phaseout thresholds unchanged (not inflation-adjusted): implement exactly per IRC §24 as amended — do not change thresholds without citing statute

### Earned Income Tax Credit

- Maximum EITC (3+ qualifying children): **$8,231**
- Full EITC table (0 / 1 / 2 / 3+ children, earned-income thresholds, phaseouts, joint vs unmarried): copy from **Rev. Proc. 2025-32** table — attach the table values in the implementation PR body

### AMT exemption (TY2026)

| Status | Exemption | Phaseout begins |
| --- | ---: | ---: |
| Unmarried | $90,100 | $500,000 |
| MFJ | $140,200 | $1,000,000 |

### Year flag

- `/taxYear` (or equivalent constant) must be **2026**
- Leap-year logic must be derived (2026 is not a leap year), not hardcoded from 2024

## Likely code touchpoints (for Dev)

Search and update — do not limit to this list:

1. `direct-file/df-client/df-client-app/src/fact-dictionary/` — modules with dollar constants, `/taxYear`, standard deduction, EITC, CTC/Schedule 8812, tax computation
2. Any `constants.xml` / year meta facts under fact-dictionary
3. `direct-file/df-client/df-client-app/src/test/factDictionaryTests` — culminating-fact tests
4. PDF / MeF mappings if they embed TY2024 form years (`direct-file/backend/.../pdf`, `submit`)
5. Locales / interview copy that say "2024" or "tax year 2024"

## Out of scope for this PR

- New income types (Schedule C/D/E) — separate gap PRs
- Year-config framework (PM #2) — may land later; for now update the active TY2026 values
- Proposed-but-not-enacted bills (e.g. Keep Your Pay Act) — **do not implement**

## Acceptance criteria (Rev review gate)

- [ ] `/taxYear` === 2026
- [ ] Standard deduction matches table above for Single, MFJ, HoH (plus age/blind add-ons per Rev. Proc.)
- [ ] Bracket breakpoints match Rev. Proc. 2025-32 for all filing statuses in scope
- [ ] CTC max $2,200 / ACTC $1,700 with tests
- [ ] EITC maxima and phaseouts match Rev. Proc. 2025-32 table
- [ ] AMT exemption/phaseout match table above
- [ ] Fact-dictionary tests updated; failing TY2024 golden values replaced or year-scoped
- [ ] No reliance on non-enacted legislation
- [ ] Proof: paste test output + cite Rev. Proc. 2025-32 / IR-2025-103 in the PR

## Reviewer notes

High blast radius: every return’s tax computation. @Feat should not merge without Rev compliance writeup + failing→passing test proof.
