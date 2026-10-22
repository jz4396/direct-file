package gov.irs.directfile.api.pdf;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import lombok.extern.slf4j.Slf4j;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

/**
 * Knockouts that stop the printed package as well as sign and submit. {@link PdfService#getTaxReturn} builds no PDF
 * while any of them is true, and the PDF endpoint answers 400 with those paths as {@code blockingFacts}.
 *
 * <p>Each entry must be a {@code <BlockSubmissionOnTrue />} knockout listed in {@code /flowIsKnockedOut} that is
 * complete and false on clean returns. One path per line.
 *
 * <p>Fails closed: a listed fact lets the return print only when it is complete and false. Incomplete (including a
 * placeholder), not a boolean, missing from the dictionary, or failing evaluation counts as true. The warning for
 * those cases logs the fact path only, never a value or exception text.
 */
@Slf4j
public final class PrintRefusingKnockouts {
    /** In the order they are reported. */
    public static final List<String> FACT_PATHS = List.of(
            // Form 8949 code Q (section 1202 exclusion): section 1202 gain is 28-percent rate gain
            // (26 U.S.C. 1(h)(4)(A)(ii), 1(h)(7)) on Schedule D line 18, which needs the Schedule D Tax Worksheet.
            "/flowKnockoutForm8949CodeQ");

    private PrintRefusingKnockouts() {}

    /** The {@link #FACT_PATHS} that refuse the print: everything except complete false (placeholders refuse too). */
    public static List<String> refusingPaths(Graph graph) {
        return refusingPaths(FACT_PATHS, path -> graph.get(path));
    }

    /** The given paths, in the given order, that do not evaluate to complete false. */
    @SuppressWarnings("PMD.AvoidCatchingGenericException") // any evaluation failure must refuse, not print
    static List<String> refusingPaths(List<String> paths, Function<String, Result<Object>> evaluate) {
        List<String> out = new ArrayList<>();
        for (String path : paths) {
            Result<Object> result;
            try {
                result = evaluate.apply(path);
            } catch (RuntimeException e) {
                log.warn("Print-refusing knockout {} could not be evaluated; refusing the print", path);
                out.add(path);
                continue;
            }
            if (result == null || !result.complete()) {
                log.warn(
                        "Print-refusing knockout {} is missing, incomplete or a placeholder; refusing the print", path);
                out.add(path);
            } else if (!Boolean.FALSE.equals(result.get())) {
                if (!Boolean.TRUE.equals(result.get())) {
                    log.warn("Print-refusing knockout {} is not a boolean; refusing the print", path);
                }
                out.add(path);
            }
        }
        return out;
    }
}
