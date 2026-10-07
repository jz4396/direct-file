# Gap: Schedule D + Form 8949 (capital gains/losses)

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev.
**Tax year target:** 2026
**Authority:** IRC §§1(h), 1211, 1221–1222; Form 8949; Schedule D; Form 1099-B basis reporting rules.

## Current behavior (upstream)

Direct File scope excluded investment sales / brokerage capital gains. No Schedule D or Form 8949 path. Commercial products treat this as table-stakes for "do all my taxes."

## Product intent (MVP)

Phase 1:

1. Detect capital asset sales (user affirms 1099-B / crypto broker / other)
2. Transaction entry (manual MVP): description, acquired, sold, proceeds, cost basis, adjustments, short vs long term
3. Form 8949 boxes A–F routing (covered/noncovered, basis reported/not) — implement at least boxes needed for common brokerage 1099-B
4. Schedule D totals → Form 1040 capital gain/loss line; apply $3,000 net capital loss limitation against ordinary income (IRC §1211(b))
5. Preferential LTCG / qualified dividends tax computation integration with TY2026 brackets
6. Wash-sale adjustments: capture adjustment code **or** document Phase-2 deferral with warning

Phase 2:

- 1099-B CSV / broker import
- Crypto-specific lots and Form 1099-DA if required for TY2026
- PDF + MeF for 8949 / Schedule D
- Carryforward capital loss tracking across years (needs year-config / save-state)

## Fact-graph / code touchpoints

1. New fact-dictionary module for transactions + Schedule D aggregates
2. Tax computation module: capital gains rates / stacking with ordinary brackets for TY2026
3. Flow + locales for interview
4. PDF templates under `direct-file/backend/.../pdf`
5. Tests in `factDictionaryTests`

## Acceptance criteria (Rev review gate)

- [ ] Short-term only, long-term only, and mixed scenarios compute Schedule D correctly
- [ ] Net capital loss limited to $3,000 ($1,500 MFS) against ordinary income
- [ ] LTCG preferential rates applied correctly for TY2026 breakpoints (cite Rev. Proc. 2025-32)
- [ ] 8949 box classification documented for each MVP path
- [ ] Regression: returns with no capital activity unchanged
- [ ] Proof: worked examples with Form 8949 → Schedule D → 1040 line mapping

## Reviewer notes

High blast radius on tax computation. Coordinate with `rev/ty2026-parameters` — capital gains rate breakpoints depend on TY2026 parameter PR. Prefer landing parameters first if both open.
