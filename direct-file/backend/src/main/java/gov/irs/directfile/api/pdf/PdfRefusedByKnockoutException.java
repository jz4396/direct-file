package gov.irs.directfile.api.pdf;

import java.util.List;

/**
 * The return has a true knockout that stops the printed package, so no PDF is built. Carries the knockout fact paths
 * (never their values).
 */
public class PdfRefusedByKnockoutException extends PdfCreationException {
    private final List<String> knockoutFactPaths;

    public PdfRefusedByKnockoutException(List<String> knockoutFactPaths) {
        super("PDF refused by knockout " + String.join(", ", knockoutFactPaths));
        this.knockoutFactPaths = List.copyOf(knockoutFactPaths);
    }

    public List<String> getKnockoutFactPaths() {
        return knockoutFactPaths;
    }
}
