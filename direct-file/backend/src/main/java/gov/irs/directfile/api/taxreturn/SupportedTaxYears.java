package gov.irs.directfile.api.taxreturn;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Collections;
import java.util.SortedSet;
import java.util.TreeSet;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The tax years this build can compute and print, read from {@code taxYears/registry.json}.
 *
 * <p>The fact dictionary, its parameters and the PDF templates target the years listed there and
 * nothing else; there is no fallback to another year's rules. A return for any other year (for
 * example TY2025, which has neither TY2025 parameters nor TY2025 PDF templates) must not be
 * started, because it would be computed with another year's figures and could not be printed.
 */
public final class SupportedTaxYears {
    static final String REGISTRY_RESOURCE = "taxYears/registry.json";

    private static final SortedSet<Integer> YEARS = load(REGISTRY_RESOURCE);

    private SupportedTaxYears() {}

    public static boolean isSupported(int taxYear) {
        return YEARS.contains(taxYear);
    }

    /** The supported tax years, in ascending order (a copy). */
    public static SortedSet<Integer> years() {
        return new TreeSet<>(YEARS);
    }

    static SortedSet<Integer> load(String resource) {
        try (InputStream in = SupportedTaxYears.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Missing tax year registry: " + resource);
            }
            JsonNode years = new ObjectMapper().readTree(in).path("years");
            SortedSet<Integer> result = new TreeSet<>();
            for (JsonNode year : years) {
                JsonNode taxYear = year.get("taxYear");
                if (taxYear == null || !taxYear.canConvertToInt()) {
                    throw new IllegalStateException("Tax year registry entry without an integer taxYear");
                }
                result.add(taxYear.intValue());
            }
            if (result.isEmpty()) {
                throw new IllegalStateException("Tax year registry lists no tax years");
            }
            return Collections.unmodifiableSortedSet(result);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read tax year registry: " + resource, e);
        }
    }
}
