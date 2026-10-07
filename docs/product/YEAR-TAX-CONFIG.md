# Spec: Per-year tax configuration

**Status:** product requirement (Joshua / Feat)  
**Owner implementer:** Dev or Cod  
**Review:** Rev (any dollar amounts) + Feat merge

## Goal
Enable, disable, or change tax-code modules and numeric variables **per tax year** without forking the entire logic tree. Operators (and tests) must be able to select a year profile that turns features on/off and swaps parameters.

## Normative sources (audit trail)
- Product requirement: Joshua → Feat, Oct 2026 ("clear ability to expand change and disable parts of the tax code so we can set configs per year").
- Upstream architecture: Fact Dictionary / Fact Graph as declarative tax logic ([IRS-Public/direct-file Fact Graph tutorial](https://github.com/IRS-Public/direct-file/blob/main/direct-file/fact-graph-scala/shared/src/main/scala/_tutorial/01_introduction.worksheet.sc); [tax-logic testing ADR](https://github.com/IRS-Public/direct-file/blob/main/docs/adr/tax-logic-testing-strategy.md)).
- Year-specific amounts must still cite IRS publications when set (e.g. [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) for TY2026).

## Requirements
1. **Year profile** — a versioned config (YAML/JSON/XML) keyed by tax year (e.g. `2024`, `2026`) that includes:
   - Feature flags: schedule/module enablement (e.g. Schedule C, D, E, credits).
   - Parameter table: standard deduction, brackets, credit caps, etc., each row carrying a **cite** field (PDF URL + page or IRC §).
2. **Runtime selection** — app boots with an active year; switching year loads that profile (no silent fallback to another year’s dollars).
3. **Disable path** — disabled modules must not appear in the interview flow and must not contribute to MeF/print output.
4. **Tests** — unit tests prove (a) flag off removes flow/facts, (b) parameter swap changes culminating facts, (c) missing cite on a dollar fails CI.

## Non-goals (this PR)
- Full TY2026 parameter migration (see gap PR #2).
- Electron wrapper.

## Acceptance
- [ ] Spec checked in under `docs/product/`
- [ ] Minimal scaffold: one year profile + loader stub + failing tests listing TODOs for Dev/Cod
- [ ] Every dollar in profile has cite metadata
- [ ] Rev signs off on cite schema; Feat merges
