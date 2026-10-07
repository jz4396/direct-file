# Implementation: Schedule C + SE tax (vertical slice)

**Implements:** [GAP-SCHEDULE-C.md](./GAP-SCHEDULE-C.md) / gap PR [#3](https://github.com/jz4396/direct-file/pull/3)
**Author:** Cod (secondary developer)
**Blast radius:** **high** — AGI, earned income (EITC/ACTC), Schedule 1 § 164(f) adjustment, Schedule 2 / total tax (SE tax).

## What this slice ships

1. Interview gate for self-employment / gig / freelance income
2. One or more Schedule C businesses (name, gross receipts, MVP expense total)
3. Net profit/(loss) → Schedule 1 line 3 path via `/otherIncome`
4. Schedule SE: 92.35% net earnings, 12.4% SS (wage-base coordinated), 2.9% Medicare
5. Deductible half of SE tax under § 164(f)
6. **QBI § 199A:** explicit non-support (knockout) — no silent zero

## Out of scope (explicit)

- Schedule C Part II category-level expense lines
- Farm optional methods / Schedule F
- Additional 0.9% Medicare tax
- QBI § 199A computation
- Full MeF PDF templates for Schedule C / SE
- MFJ spouse wage-base split (MVP: primary filer W-2 OASDI only)

## Primary sources

| Claim | Source | Link |
| --- | --- | --- |
| Gross income | IRC § 61 | https://www.law.cornell.edu/uscode/text/26/61 |
| Expenses | IRC § 162 | https://www.law.cornell.edu/uscode/text/26/162 |
| SE tax | IRC § 1401 | https://www.law.cornell.edu/uscode/text/26/1401 |
| Net earnings | IRC § 1402 | https://www.law.cornell.edu/uscode/text/26/1402 |
| Deductible half | IRC § 164(f) | https://www.law.cornell.edu/uscode/text/26/164#f |
| QBI unsupported | IRC § 199A | https://www.law.cornell.edu/uscode/text/26/199A |
| TY2026 wage base $184,500 | SSA CBB | https://www.ssa.gov/oact/cola/cbb.html |
| Same (FR) | 90 Fed. Reg. Nov 3 2025 | https://www.govinfo.gov/content/pkg/FR-2025-11-03/html/2025-19763.htm |
| Gap evidence | Pub 6048 | https://www.irs.gov/pub/irs-pdf/p6048.pdf |

### Snippet — SSA wage base 2026

> For earnings in 2026, this base is $184,500.

### Proof scenarios (no W-2 OASDI)

| # | Gross | Exp | Net | NESE | SE tax | § 164(f) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 10000 | 2000 | 8000 | 7388 | 1130 | 565 |
| B | 500 | 200 | 300 | 277 | 0 | 0 |
| C | 1000 | 1500 | -500 | 0 | 0 | 0 |

Scenario A: NESE=round(8000×0.9235)=7388; SS=round(7388×0.124)=916; Medicare=round(7388×0.029)=214; SE=1130; half=565.

## Review

Rev compliance writeup → Feat merge. Keep cites intact.
