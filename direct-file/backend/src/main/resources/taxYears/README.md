# Tax year parameter files

`registry.json` lists the tax years this build supports and the parameter file for each.
`currentTaxYear` must be one of them, and must match `CURRENT_TAX_YEAR` in
`df-client-app/src/constants/taxConstants.ts` and the `/taxYear` fact. A year that is not
listed is an error (`UnknownTaxYearError`); there is no fallback to another year.
The backend reads the same list (`SupportedTaxYears`): creating a return for a year that is not
listed is refused with a 400, so a return can never reach PDF generation for a year that has no
parameters or templates (for example TY2025).

`tyYYYY.json` is the source of truth for the year's parameters:

- `parameters` has one entry per fact tagged `<TaxYear>YYYY</TaxYear>` in `../tax/*.xml`.
  `values` lists the fact's literals (`<Dollar>`, `<Int>`, `<Day>`, `<Rational>`, `<Decimal>`,
  `<String>`) in document order as `Type:text`. `valuesFrom` reuses another parameter's values
  for a fact that duplicates it (the QDCG worksheet line 22 reuses the § 1(j)(2) rate tables).
- Every parameter has at least one `cite`. A cite names a `sources` entry and gives a `quote`.
  PDF sources also need a `page` (and `pageEnd` if the quote crosses a page); IRC cites need a
  `section` such as `§ 1211(b)(1)` and its section URL. `form: "table"` marks a row-by-row
  transcription of a table rather than verbatim prose.
- Every dollar amount and percentage rate a parameter holds must appear in one of its quotes,
  written as the source prints it (`$32,200`, `$206,583.50`, `22%`).
- `pendingReview` lists facts that are still tagged with an earlier year, with their TY status
  (`current`, `stale`, `structural`, `unverified`), a note and the tracking issue. A `current`
  entry needs a cite like a parameter.

To change a value: edit the parameter file (value and quote), then run
`npm run apply-year-config` in `df-client-app` to write it into the XML.
`npm run apply-year-config -- --check` exits non-zero if the XML and the file disagree.
`src/test/factDictionaryTests/yearConfig.test.ts` runs the same checks in the fact dictionary
tests.
