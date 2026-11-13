package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #93 slice 3: Schedule IL-WIT (2025 form as the interim tax year 2026 template). Rows 1-5 are the primary filer's
 * W-2s and rows 6-10 are the spouse's. Column A is {@code W}. Column D is box 16 and stays 0 when box 16 was left
 * blank. Line 11 is IL-1040 Line 25.
 */
class IlWitPdfForm extends IlPdfForm {
    static final String PREFIX = "~ilwit";

    IlWitPdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        putPerson(facts, "Your", "/primaryFiler");
        if (isTrue(facts, "/isMarried")) {
            putPerson(facts, "Spouse", "/secondaryFiler");
        } else {
            facts.put(PREFIX + "SpouseName", "");
            facts.put(PREFIX + "SpouseSsn3", "");
            facts.put(PREFIX + "SpouseSsn2", "");
            facts.put(PREFIX + "SpouseSsn4", "");
        }

        final List<UUID> ids = facts.getOptional("/formW2s").isPresent()
                ? (List<UUID>) facts.getOptional("/formW2s").get()
                : List.of();
        final Object primary = facts.getOptional("/primaryFiler").orElse(null);
        final List<UUID> primaryRows = new ArrayList<>();
        final List<UUID> spouseRows = new ArrayList<>();
        for (UUID id : ids) {
            final Object filer = facts.getOptional("/formW2s/#" + id + "/filer").orElse(null);
            if (sameItem(primary, filer)) {
                primaryRows.add(id);
            } else {
                spouseRows.add(id);
            }
        }
        for (int row = 1; row <= 10; row++) {
            clearRow(facts, row);
        }
        fillRows(facts, primaryRows, 1);
        fillRows(facts, spouseRows, 6);
        return true;
    }

    /** Collection items arrive as {@code CollectionItem} or as a {@code UUID}. Compare the id either way. */
    private static boolean sameItem(final Object left, final Object right) {
        final String a = itemId(left);
        return !a.isEmpty() && a.equals(itemId(right));
    }

    private static String itemId(final Object value) {
        if (value instanceof UUID uuid) {
            return uuid.toString();
        }
        if (value instanceof gov.irs.factgraph.types.CollectionItem item) {
            return item.id().toString();
        }
        return value == null ? "" : value.toString();
    }

    private static void putPerson(
            final FactEvaluationResult facts, final String who, final String filerPath) {
        final String first = upper(facts, filerPath + "/firstName");
        final String last = upper(facts, filerPath + "/lastName");
        facts.put(PREFIX + who + "Name", (first + " " + last).trim());
        final String ssn = text(facts, filerPath + "/tin").replace("-", "");
        final String digits = ssn.replaceAll("[^0-9]", "");
        facts.put(PREFIX + who + "Ssn3", digits.length() >= 3 ? digits.substring(0, 3) : "");
        facts.put(PREFIX + who + "Ssn2", digits.length() >= 5 ? digits.substring(3, 5) : "");
        facts.put(PREFIX + who + "Ssn4", digits.length() >= 9 ? digits.substring(5, 9) : "");
    }

    private static void fillRows(final FactEvaluationResult facts, final List<UUID> ids, final int firstRow) {
        for (int i = 0; i < ids.size() && i < 5; i++) {
            final int row = firstRow + i;
            final String base = "/formW2s/#" + ids.get(i);
            facts.put(PREFIX + "Type" + row, "W");
            facts.put(PREFIX + "Ein" + row, text(facts, base + "/ein").replace("-", ""));
            facts.put(PREFIX + "Federal" + row, amount(facts, base + "/wages"));
            // Column D is box 16. A blank box 16 prints 0. It is not copied from box 1.
            facts.put(PREFIX + "StateWages" + row, amountOrZero(facts, base + "/stateWages"));
            facts.put(PREFIX + "Withheld" + row, amount(facts, base + "/stateWithholding"));
        }
    }

    private static void clearRow(final FactEvaluationResult facts, final int row) {
        for (String col : new String[] {"Type", "Ein", "Federal", "StateWages", "Withheld"}) {
            facts.put(PREFIX + col + row, "");
        }
    }

    private static String amount(final FactEvaluationResult facts, final String path) {
        final Optional<BigDecimal> value = dollars(facts, path);
        return value.map(IlPdfForm::wholeDollars).orElse("");
    }

    private static String amountOrZero(final FactEvaluationResult facts, final String path) {
        return dollars(facts, path).map(IlPdfForm::wholeDollars).orElse("0");
    }
}
