package gov.irs.directfile.api.pdf;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import lombok.extern.slf4j.Slf4j;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

/**
 * Knockouts that stop the printed package as well as sign and submit. {@link PdfService#getTaxReturn} builds no PDF
 * while any of them is true, and the PDF endpoint answers 400 with every true path as {@code blockingFacts}.
 *
 * <p>Each entry must be a {@code <BlockSubmissionOnTrue />} knockout listed in {@code /flowIsKnockedOut}, and is
 * removed when the form it waits for has a template and field map. One path per line.
 */
@Slf4j
public final class PrintRefusingKnockouts {
    /** In the order they are reported. */
    public static final List<String> FACT_PATHS = List.of(
            // Schedule EIC has no TY2026 template; a qualifying child counts only if the return gives the child's
            // name, age and TIN (26 U.S.C. 32(c)(3)(D)(i)), which Schedule EIC carries.
            "/flowKnockoutScheduleEicWithoutTy2026Template");

    private PrintRefusingKnockouts() {}

    /** The {@link #FACT_PATHS} that are true on the graph. */
    public static List<String> truePaths(Graph graph) {
        return truePaths(FACT_PATHS, path -> graph.get(path));
    }

    /**
     * The given paths whose value is true, complete or placeholder, in the given order. A path that fails to evaluate
     * counts as true, so an unreadable knockout refuses rather than prints.
     */
    static List<String> truePaths(List<String> paths, Function<String, Result<Object>> evaluate) {
        List<String> out = new ArrayList<>();
        for (String path : paths) {
            try {
                Result<Object> result = evaluate.apply(path);
                if (result != null && result.hasValue() && Boolean.TRUE.equals(result.get())) {
                    out.add(path);
                }
            } catch (RuntimeException e) {
                log.warn(
                        "Print-refusing knockout {} could not be evaluated ({})",
                        path,
                        e.getClass().getSimpleName());
                out.add(path);
            }
        }
        return out;
    }
}
