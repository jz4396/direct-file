# Direct File (community fork)

**This is a public fork and expansion of the archived IRS [Direct File](https://github.com/IRS-Public/direct-file) codebase.** It is not an official IRS product, and it is not affiliated with the United States Government.

Upstream source: [IRS-Public/direct-file](https://github.com/IRS-Public/direct-file) (tax logic and interview content as of Tax Year 2024).

## Goals

We are evolving this codebase toward a free, open tax product that can:

1. **Target Tax Year 2026** (returns filed in calendar year 2027), keeping federal rules current.
2. **Cover a full return end-to-end** — beyond the original Direct File scope — including broader income, deductions, credits, schedules, and state/local handoff where feasible.
3. **Match or beat commercial UX** (clarity, accessibility, mobile-first interview flow) while staying free and open source.
4. **File or print** — submit via IRS Modernized e-File (MeF) APIs where authorized, and/or produce printable IRS forms/PDFs.

### Product requirements (in progress)

- **Host + local:** easy local run, plus a free/low-cost public host (Cloudflare domain under evaluation for static/client-heavy deploy).
- **Year configs:** enable, disable, or change tax-code modules and variables per tax year without forking the logic tree.
- **Client-side save state:** one save format shared by web and local app, with **no server-side storage of taxpayer data** (export/import, local persistence, optional encrypted cloud of the user’s choosing later).
- **Electron app (nice-to-have):** desktop wrapper that reuses the same client and save state as the web build.

## Status

Early bootstrap. First changes are documentation and process; tax-year updates and feature work land via pull requests reviewed for IRS-code compliance.

**Upstream was archived and is no longer maintained by the IRS.** Treat historical code as reference: it may contain unpatched vulnerabilities and must not be used as a production filing system until reviewed, hardened, and brought current.

## Where do I start?

See [ONBOARDING.md](/ONBOARDING.md) to run Direct File locally (upstream docs still apply to the base stack).

## Exempted code (from upstream)

Not all source used in the original Direct File is in this repository. Code or data considered PII, FTI, SBU, or developed for National Security Systems (40 U.S.C. § 11103) was exempted upstream. Some functionality was removed or rewritten for that reason.

## About upstream Direct File

[Direct File](https://directfile.irs.gov) was a U.S. Government service for free federal e-filing via an interview UI (English/Spanish, mobile-friendly). It translates plain-language answers into tax forms and MeF XML, and includes the **Fact Graph** (Scala / Scala.js) for reasoning over incomplete returns. Federal-only filing; state handoff used a State API.

Built in-house at the IRS with support from [USDS](https://www.usds.gov), [GSA](https://www.gsa.gov/), and vendors including TrussWorks, Coforma, and ATI. Background: [IRS Pub 5969](https://www.irs.gov/pub/irs-pdf/p5969.pdf) and [IRS Direct File overview](https://www.irs.gov/filing/irs-direct-file-for-free).

## Authorities (upstream)

Legal foundations cited by the original project include:

- Source code Harmonization And Reuse in Information Technology Act of 2024, Public Law 118-187
- OMB Memorandum M-16-21, Federal Source Code Policy
- FAR Part 27 – Patents, Data, and Copyrights
- Digital Government Strategy (2012)
- FITARA (FY2015 NDAA)
- E-Government Act of 2002, Public Law 107-347
- Clinger-Cohen Act of 1996, Public Law 104-106
