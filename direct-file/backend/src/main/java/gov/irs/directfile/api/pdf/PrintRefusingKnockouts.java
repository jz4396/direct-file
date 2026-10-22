package gov.irs.directfile.api.pdf;

import java.util.ArrayList;
import java.util.List;

import gov.irs.factgraph.Graph;

/**
 * Evaluates the knockout facts that stop the printed package as well as submission. The tool is print-only, so a
 * return that one of these knocks out gets no PDF rather than a package with wrong amounts. The list itself is
 * {@link PdfService#PRINT_REFUSING_KNOCKOUTS}.
 *
 * <p>Fails closed: a listed fact prints only when it is complete and false. True, incomplete (including a placeholder
 * value), not a boolean, missing from the dictionary, or throwing during evaluation all refuse the print.
 */
final class PrintRefusingKnockouts {
    private PrintRefusingKnockouts() {}

    /** The paths, in list order, that do not evaluate to complete false on the graph. Paths only, never values. */
    static List<String> refusing(Graph graph, List<String> knockoutPaths) {
        List<String> refusing = new ArrayList<>();
        for (String path : knockoutPaths) {
            if (!completeFalse(graph, path)) {
                refusing.add(path);
            }
        }
        return refusing;
    }

    @SuppressWarnings("PMD.AvoidCatchingGenericException") // any evaluation failure must refuse, not print
    private static boolean completeFalse(Graph graph, String path) {
        try {
            var result = graph.get(path);
            return result.complete() && Boolean.FALSE.equals(result.get());
        } catch (RuntimeException e) {
            return false;
        }
    }
}
