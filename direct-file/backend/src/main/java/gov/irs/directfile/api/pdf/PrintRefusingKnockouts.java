package gov.irs.directfile.api.pdf;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import lombok.extern.slf4j.Slf4j;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

/**
 * Knockouts that stop the printed package as well as sign and submit. {@link PdfService#getTaxReturn} builds no PDF
 * unless every one of them is complete and false, and the PDF endpoint answers 400 with every refusing path as
 * {@code blockingFacts}.
 *
 * <p>Each entry must be a {@code <BlockSubmissionOnTrue />} knockout listed in {@code /flowIsKnockedOut}, and is
 * removed when the form it waits for has a template and field map. One path per line.
 */
@Slf4j
public final class PrintRefusingKnockouts {
    /** In the order they are reported. */
    public static final List<String> FACT_PATHS = List.of(
            // Form 8949 code Q (section 1202 exclusion): section 1202 gain is 28-percent rate gain
            // (26 U.S.C. 1(h)(4)(A)(ii), 1(h)(7)) on Schedule D line 18, which needs the Schedule D Tax Worksheet.
            "/flowKnockoutForm8949CodeQ",
            // Schedule EIC has no TY2026 template; a qualifying child counts only if the return gives the child's
            // name, age and TIN (26 U.S.C. 32(c)(3)(D)(i)), which Schedule EIC carries.
            "/flowKnockoutScheduleEicWithoutTy2026Template",
            // Form 2210 Part II box applies: Form 2210 (2026) draft, p. 1, "If box B, C, or D applies, you must figure
            // your penalty and file Form 2210." and "If box A or E applies (but not B, C, or D), file only page 1 of
            // Form 2210." There is no Form 2210 template, so the package would omit it and leave line 38 blank.
            "/flowKnockoutForm2210");

    private PrintRefusingKnockouts() {}

    /** The {@link #FACT_PATHS} that refuse the print on the graph. */
    public static List<String> refusingPaths(Graph graph) {
        return refusingPaths(FACT_PATHS, path -> graph.get(path));
    }

    /**
     * The given paths that refuse the print, in the given order. This fails closed: only a complete false value lets
     * the package print. True (complete or placeholder), a placeholder false, no value, a path the graph does not
     * have, and an evaluation error all refuse.
     */
    static List<String> refusingPaths(List<String> paths, Function<String, Result<Object>> evaluate) {
        List<String> out = new ArrayList<>();
        for (String path : paths) {
            if (!allowsPrinting(path, evaluate)) {
                out.add(path);
            }
        }
        return out;
    }

    private static boolean allowsPrinting(String path, Function<String, Result<Object>> evaluate) {
        try {
            Result<Object> result = evaluate.apply(path);
            return result != null && result.complete() && Boolean.FALSE.equals(result.get());
        } catch (RuntimeException e) {
            // Only the path: no fact value, exception message, class name or stack trace.
            log.warn("Print-refusing knockout {} could not be evaluated", path);
            return false;
        }
    }
}
