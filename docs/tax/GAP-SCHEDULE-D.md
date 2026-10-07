# Gap: Schedule D + Form 8949 (capital gains/losses)

**Status:** Gap PR (spec + acceptance criteria). Implementation by Dev.
**Tax year target:** 2026

## Audit sources (required on every claim)

### Statute (HTML)

- Capital gains rates / stacking: [26 U.S.C. § 1(h)](https://www.law.cornell.edu/uscode/text/26/1#h)
- Capital loss limitation: [26 U.S.C. § 1211](https://www.law.cornell.edu/uscode/text/26/1211)
- Capital asset / holding period concepts: [26 U.S.C. § 1221](https://www.law.cornell.edu/uscode/text/26/1221), [§ 1222](https://www.law.cornell.edu/uscode/text/26/1222)

### Inflation / TY2026 breakpoints (PDF)

- [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf), **p. 13**, §4.03 *Maximum Capital Gains Rate*

> For taxable years beginning in 2026, the maximum zero rate amounts and maximum 15 percent rate amounts under § 1(j)(5)(B) … are as follows:  
> MFJ / Surviving Spouse — Maximum Zero **$98,900** · Maximum 15% **$613,700**  
> MFS — **$49,450** / **$306,850**  
> HoH — **$66,200** / **$579,600**  
> All Other Individuals — **$49,450** / **$545,500**

### Forms / instructions (PDF)

- [Instructions for Schedule D](https://www.irs.gov/instructions/i1040sd) → cite **page** for netting worksheet / Form 1040 line mapping
- [Instructions for Form 8949](https://www.irs.gov/instructions/i8949) → cite **page** for boxes A–F

### Snippet — IRC § 1211(b) (loss limit)

> In the case of a taxpayer other than a corporation, losses from sales or exchanges of capital assets shall be allowed only to the extent of the gains from such sales or exchanges, plus (if such losses exceed such gains) the lower of— (1) $3,000 ($1,500 in the case of a married individual filing a separate return), or (2) the excess of such losses over such gains.

Source: [26 U.S.C. § 1211(b)](https://www.law.cornell.edu/uscode/text/26/1211#b).

**Standing rule:** every rate breakpoint and loss limit in code must cite Rev. Proc. page or IRC subsection in the PR.

## Current behavior (upstream)

No Schedule D / 8949 path. Commercial parity requires it.

## Product intent (MVP)

Manual transactions → 8949 boxes → Schedule D → 1040; apply § 1211(b); apply TY2026 § 1(h)/1(j)(5) breakpoints from Rev. Proc. p. 13.

## Dependency

Land **TY2026 parameters** (#2) first where possible — ordinary brackets + this p. 13 table share one source PDF.

## Acceptance criteria (Rev review gate)

- [ ] Breakpoints cite Rev. Proc. 2025-32 **p. 13**
- [ ] Loss limit cites § 1211(b)
- [ ] ST / LT / mixed scenarios with worked examples
- [ ] 8949 box rules cite instruction PDF pages
- [ ] No-capital-activity regression
- [ ] Proof in PR body

## Reviewer notes

High blast radius. Feat merges only after Rev writeup.
