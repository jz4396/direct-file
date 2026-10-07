# Gap: Schedule C + self-employment tax

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev.
**Tax year target:** 2026
**Authority:** IRC §§61, 1401–1402, 162; Form 1040 Schedule C; Schedule SE; Form 1099-NEC / 1099-K reporting rules as applicable for TY2026.

## Current behavior (upstream)

IRS Direct File (TY2024 / filing season 2025) **did not support** gig, rental, or business income. Eligibility docs (Pub 6048 / 6035 / 5949) list W-2, SSA-1099, 1099-G, 1099-INT, 1099-R, Alaska APFD only. Taxpayers with Schedule C income were out of scope.

This fork’s goal is full-return coverage. Schedule C + SE is the largest commercial-parity gap after TY2026 parameters.

## Product intent (MVP for this PR series)

Phase 1 (this PR’s implementation target):

1. Interview flow: "Did you have self-employment / gig / freelance income?"
2. Capture one or more businesses (name, EIN/SSN, principal business code optional for MVP)
3. Income: gross receipts (cash / 1099-NEC / 1099-K) with clear sourcing questions
4. Expenses: common Schedule C Part II categories (MVP subset allowed if documented; full Part II is preferred)
5. Net profit/loss → Form 1040 Schedule 1 → AGI
6. Schedule SE: SE tax on net earnings; deductible half of SE tax as adjustment
7. QBI (IRC §199A) — **stub or out-of-scope flag** for Phase 1 unless Dev can prove simple cases; do not silently omit if income is in scope — either implement simplified QBI or hard-block with explanation

Phase 2 (follow-up PRs, do not block Phase 1 merge on these):

- Home office, vehicle actual vs standard mileage, depreciation, inventory, multi-state apportionment
- PDF + MeF for Schedule C / SE
- 1099-K de minimis / reporting thresholds for TY2026

## Fact-graph / code touchpoints

1. New fact-dictionary module(s) under `direct-file/df-client/df-client-app/src/fact-dictionary/`
2. Flow screens under `.../src/flow` and locales
3. Culminating facts: Schedule C net profit, SE tax, deductible SE tax, AGI linkage
4. Eligibility / "out of scope" gates that currently reject business income — remove or re-gate
5. PDF: extend `direct-file/backend/.../pdf` (no Schedule C form today)
6. MeF XML in `submit` when filing path is ready

## Acceptance criteria (Rev review gate)

- [ ] Taxpayers with only in-scope W-2 (+ existing DF income) still compute identically (regression)
- [ ] Simple cash Schedule C (receipts − expenses = profit) flows to AGI correctly
- [ ] Schedule SE tax and deductible half match IRC §1401/1402 for the TY2026 SE rate and wage base (cite Rev. Proc. / SSA for wage base in PR)
- [ ] Negative net → no SE tax; loss handling documented
- [ ] QBI: implemented for simple case **or** explicit non-support with user-facing block (no silent zero)
- [ ] Fact-dictionary tests for culminating facts
- [ ] Proof: scenario table (inputs → Schedule C net, SE tax, AGI) in PR body

## Reviewer notes

High blast radius on AGI and credits (EITC/CTC phaseouts). Requires Rev compliance writeup before @Feat merge. Prefer vertical slice (one business, cash basis, standard mileage optional) over incomplete full Schedule C.
