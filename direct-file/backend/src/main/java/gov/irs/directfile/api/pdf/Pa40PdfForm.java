package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #123: PA-40 (2025 form used as the interim template for tax year 2026; see pdf/2026/PA40/en/configuration.yml).
 * Computes the {@code ~pa40*} pseudo-facts for header boxes and ovals that have no fact of their own. Page cites are
 * to the PA-40 IN (2025) instruction booklet.
 */
class Pa40PdfForm extends PaPdfForm {
    static final String PREFIX = "~pa40";
    private static final DateTimeFormatter MONTH_DAY = DateTimeFormatter.ofPattern("MM/dd", Locale.US);

    Pa40PdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        final boolean married = isMarried(facts);
        final boolean joint = isJoint(facts);

        // Name and address boxes, p. 5 ("Print your name - last, first, middle initial, and suffix", upper case).
        facts.put(PREFIX + "LastName", upper(facts, "/primaryFiler/lastName"));
        facts.put(PREFIX + "FirstName", upper(facts, "/primaryFiler/firstName"));
        facts.put(PREFIX + "MiddleInitial", initial(upper(facts, "/primaryFiler/middleInitial")));
        facts.put(PREFIX + "Suffix", enumOrText(facts, "/primaryFiler/suffix"));
        facts.put(PREFIX + "Occupation", upper(facts, "/primaryFiler/occupation"));

        // Spouse boxes: p. 7, (M) "You must include your spouse's SSN even if filing Married, Filing Separately"; the
        // spouse's last name box reads "Only if different from Last Name above".
        final String spouseLast = married ? upper(facts, "/secondaryFiler/lastName") : "";
        facts.put(PREFIX + "SpouseSsn", married ? ssn(facts, "/secondaryFiler/tin") : "");
        facts.put(PREFIX + "SpouseFirstName", married ? upper(facts, "/secondaryFiler/firstName") : "");
        facts.put(
                PREFIX + "SpouseMiddleInitial", married ? initial(upper(facts, "/secondaryFiler/middleInitial")) : "");
        facts.put(
                PREFIX + "SpouseLastName", spouseLast.equals(upper(facts, "/primaryFiler/lastName")) ? "" : spouseLast);
        facts.put(PREFIX + "SpouseSuffix", married ? enumOrText(facts, "/secondaryFiler/suffix") : "");
        facts.put(PREFIX + "SpouseOccupation", married ? upper(facts, "/secondaryFiler/occupation") : "");

        final String primaryName = upper(facts, "/primaryFiler/fullName");
        final String spouseName = upper(facts, "/secondaryFiler/fullName");
        facts.put(PREFIX + "Names", joint && !spouseName.isEmpty() ? primaryName + " & " + spouseName : primaryName);

        final Optional<Object> address = facts.getOptional("/address");
        if (address.isPresent() && address.get() instanceof gov.irs.factgraph.types.Address a) {
            facts.put(PREFIX + "Address1", nullToEmpty(a.streetAddress()).toUpperCase(Locale.US));
            facts.put(PREFIX + "Address2", nullToEmpty(a.streetAddressLine2()).toUpperCase(Locale.US));
            facts.put(PREFIX + "City", nullToEmpty(a.city()).toUpperCase(Locale.US));
            facts.put(PREFIX + "State", nullToEmpty(a.stateOrProvence()).toUpperCase(Locale.US));
            final String zip = nullToEmpty(a.postalCode()).replaceAll("[^0-9]", "");
            facts.put(PREFIX + "Zip", zip.length() > 5 ? zip.substring(0, 5) : zip);
        } else {
            for (String box : new String[] {"Address1", "Address2", "City", "State", "Zip"}) {
                facts.put(PREFIX + box, "");
            }
        }

        // School Code and School District Name, p. 5: "You must enter the five-digit code and name of the school
        // district where you lived on Dec. 31, 2025". /paSchoolCode is the code the filer entered (one of the 500 on
        // pp. 46-47), or 99999 for a PA-to-FL mover (p. 6: "Nonresidents or part-year residents who did not reside in
        // the state as of Dec. 31, 2025, should enter 99999 in the school district code field."), whose name box
        // stays blank.
        final String schoolCode = text(facts, "/paSchoolCode");
        facts.put(PREFIX + "SchoolCode", schoolCode);
        facts.put(PREFIX + "SchoolDistrict", PaSchoolDistricts.name(schoolCode).toUpperCase(Locale.US));
        final boolean partYear = isTrue(facts, "/paResidencyStatusPartYear");
        final boolean movedOut = partYear && isTrue(facts, "/paPartYearMovedOut");

        // Residency Status ovals, p. 6: export values 1 = (R) Pennsylvania Resident, 3 = (P) Part-Year Resident.
        // (N) Nonresident (2) is out of scope.
        facts.put(PREFIX + "Residency", partYear ? "3" : "1");
        facts.put(PREFIX + "PartYearFrom", "");
        facts.put(PREFIX + "PartYearTo", "");
        final Optional<Object> moveDate = facts.getOptional("/paPartYearMoveDate");
        if (partYear && moveDate.isPresent() && moveDate.get() instanceof gov.irs.factgraph.types.Day day) {
            // /paPartYearMoveDate is the first day in the new state: a PA-to-FL mover was a PA resident Jan. 1
            // through the day before it, a FL-to-PA mover from that day through Dec. 31.
            final LocalDate first = day.getDate();
            if (movedOut) {
                facts.put(PREFIX + "PartYearFrom", "01/01");
                facts.put(PREFIX + "PartYearTo", first.minusDays(1).format(MONTH_DAY));
            } else {
                facts.put(PREFIX + "PartYearFrom", first.format(MONTH_DAY));
                facts.put(PREFIX + "PartYearTo", "12/31");
            }
        }

        // Filing Status ovals, pp. 6-7: export values 1 = (S) Single (not married on Dec. 31), 2 = (J) Married,
        // Filing Jointly, 3 = (M) Married, Filing Separately.
        facts.put(PREFIX + "FilingStatus", married ? (joint ? "2" : "3") : "1");

        // Line 4, p. 17, LINE 4 / Tax Reform Code of 1971 §303(a)(2): "Net profits. The net income from the operation
        // of a business, profession, or other activity…" /paLine4 is federal Schedule C line 31 plus the PA 100% meals
        // add-back for a full-year resident. $0 prints blank. A loss fills the oval and the amount box shows the size
        // (p. 15). This slice does not produce a PA Schedule C PDF; the federal Schedule C PDF is not the PA schedule.
        final Optional<BigDecimal> line4 = dollars(facts, "/paLine4");
        facts.put(
                PREFIX + "Line4",
                line4.filter(v -> v.signum() != 0).map(v -> paAmount(v.abs())).orElse(""));
        facts.put(
                PREFIX + "Line4Loss",
                line4.map(v -> paAmount(v).startsWith("-")).orElse(false));

        // Line 5, p. 15: "Under PA law, losses may only be reported on Lines 4, 5, and 6. If entering a loss, fill in
        // the oval next to the line." The amount box takes the size of the loss.
        final Optional<BigDecimal> line5 = dollars(facts, "/paLine5");
        facts.put(PREFIX + "Line5", line5.map(v -> paAmount(v.abs())).orElse(""));
        facts.put(
                PREFIX + "Line5Loss",
                line5.map(v -> paAmount(v).startsWith("-")).orElse(false));

        // Line 6, p. 18, LINE 6: "You may use federal Schedule E, if using only Part I, and with the following
        // adjustments". Tax Reform Code of 1971 §303(a)(4): "Net gains or income derived from or in the form of rents,
        // royalties, patents and copyrights." /paLine6 is that federal Part I net for a full-year resident. $0 prints
        // blank. A loss fills the oval and the amount box shows the size (p. 15). A supported return has no loss.
        final Optional<BigDecimal> line6 = dollars(facts, "/paLine6");
        facts.put(
                PREFIX + "Line6",
                line6.filter(v -> v.signum() != 0).map(v -> paAmount(v.abs())).orElse(""));
        facts.put(
                PREFIX + "Line6Loss",
                line6.map(v -> paAmount(v).startsWith("-")).orElse(false));

        // Lines 19a, 19b and 20, p. 22: copied from PA Schedule SP Section I, Section II line 2 and Section III line 11
        // when Tax Forgiveness is claimed on line 21. Line 19a export values: 1 = Unmarried or Separated, 2 = Married.
        final boolean forgiveness = claimsTaxForgiveness(facts);
        facts.put(PREFIX + "TaxForgivenessStatus", forgiveness ? (married ? "2" : "1") : "");
        final String children = text(facts, "/paSpDependentChildCount");
        facts.put(
                PREFIX + "DependentChildren",
                forgiveness && !children.isEmpty() && !"0".equals(children) ? children : "");
        facts.put(
                PREFIX + "EligibilityIncome",
                forgiveness
                        ? dollars(facts, "/paSpLine11").map(PaPdfForm::paAmount).orElse("")
                        : "");

        // Line 15, p. 21, LINE 15: "Enter your total 2025 estimated payments." Pennsylvania estimated installment
        // payments only (/paLine15). Not Form 2210 and not federal estimated tax. $0 prints blank. The line 15 oval
        // is Form REV-459B; that form stays stopped, so the oval is left blank.
        facts.put(PREFIX + "Line15", paAmountOrBlank(dollars(facts, "/paLine15")));
        // Line 18, p. 21, LINE 18: "Add only Lines 14, 15, 16, and 17." Lines 14, 16, and 17 stay stopped, so a
        // printed return's line 18 equals line 15. $0 prints blank.
        facts.put(PREFIX + "Line18", paAmountOrBlank(dollars(facts, "/paLine18")));
        return true;
    }

    /** Whole dollars, half-up (p. 4). $0 prints blank. */
    static String paAmountOrBlank(final Optional<BigDecimal> amount) {
        return amount.filter(v -> v.setScale(0, RoundingMode.HALF_UP).signum() != 0)
                .map(PaPdfForm::paAmount)
                .orElse("");
    }

    /** The MI box holds one letter (MaxLen 1). */
    static String initial(final String s) {
        return s.length() > 1 ? s.substring(0, 1) : s;
    }

    static String nullToEmpty(final String s) {
        return s == null ? "" : s.trim();
    }

    /** A suffix is an Enum fact (/suffixOptions); print its value. */
    static String enumOrText(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isEmpty()) {
            return "";
        }
        if (opt.get() instanceof gov.irs.factgraph.types.Enum e) {
            return e.value().isEmpty() ? "" : e.value().get().toUpperCase(Locale.US);
        }
        return opt.get().toString().trim().toUpperCase(Locale.US);
    }
}
