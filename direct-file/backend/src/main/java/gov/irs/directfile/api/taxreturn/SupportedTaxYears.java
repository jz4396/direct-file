package gov.irs.directfile.api.taxreturn;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Collections;
import java.util.Optional;
import java.util.SortedMap;
import java.util.SortedSet;
import java.util.TreeMap;
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
 *
 * <p>Each listed year also carries a required {@code enabled} flag. A listed year that is not
 * enabled stays supported (its existing returns can still be read, edited and printed), but no new
 * return can be started for it. This turns a year off for new returns by editing the registry, with
 * no code change. The client reads the same flag (df-client-app {@code taxYearAvailability.ts}).
 */
public final class SupportedTaxYears {
    static final String REGISTRY_RESOURCE = "taxYears/registry.json";

    private static final Registry REGISTRY = load(REGISTRY_RESOURCE);

    private SupportedTaxYears() {}

    /** The registry this build ships. */
    public static Registry registry() {
        return REGISTRY;
    }

    public static boolean isSupported(int taxYear) {
        return REGISTRY.isSupported(taxYear);
    }

    /** True if the year is listed and enabled, i.e. a new return may be started for it. */
    public static boolean acceptsNewReturns(int taxYear) {
        return REGISTRY.acceptsNewReturns(taxYear);
    }

    /** The supported tax years, in ascending order (a copy). */
    public static SortedSet<Integer> years() {
        return REGISTRY.years();
    }

    /** Listed tax years and whether each is enabled for new returns. */
    public record Registry(SortedMap<Integer, Boolean> enabledByYear) {
        public Registry {
            enabledByYear = Collections.unmodifiableSortedMap(new TreeMap<>(enabledByYear));
        }

        public boolean isSupported(int taxYear) {
            return enabledByYear.containsKey(taxYear);
        }

        public boolean acceptsNewReturns(int taxYear) {
            return Boolean.TRUE.equals(enabledByYear.get(taxYear));
        }

        /** The supported tax years, in ascending order (a copy). */
        public SortedSet<Integer> years() {
            return new TreeSet<>(enabledByYear.keySet());
        }

        /** The years a new return can be started for, in ascending order (a copy). */
        public SortedSet<Integer> enabledYears() {
            SortedSet<Integer> result = new TreeSet<>();
            enabledByYear.forEach((year, enabled) -> {
                if (enabled) {
                    result.add(year);
                }
            });
            return result;
        }

        /** Why a new return for {@code taxYear} must be refused, or empty if it may be started. */
        public Optional<String> newReturnRefusal(int taxYear) {
            if (!isSupported(taxYear)) {
                return Optional.of(
                        String.format("Tax year %d is not supported. Supported tax years: %s", taxYear, years()));
            }
            if (!acceptsNewReturns(taxYear)) {
                return Optional.of(String.format(
                        "Tax year %d is not open for new returns. Tax years open for new returns: %s",
                        taxYear, enabledYears()));
            }
            return Optional.empty();
        }
    }

    static Registry load(String resource) {
        try (InputStream in = SupportedTaxYears.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Missing tax year registry: " + resource);
            }
            JsonNode years = new ObjectMapper().readTree(in).path("years");
            SortedMap<Integer, Boolean> result = new TreeMap<>();
            for (JsonNode year : years) {
                JsonNode taxYear = year.get("taxYear");
                if (taxYear == null || !taxYear.canConvertToInt()) {
                    throw new IllegalStateException("Tax year registry entry without an integer taxYear");
                }
                JsonNode enabled = year.get("enabled");
                if (enabled == null || !enabled.isBoolean()) {
                    // No default: a year is only open for new returns when the registry says so.
                    throw new IllegalStateException(
                            "Tax year registry entry " + taxYear.intValue() + " without a boolean enabled flag");
                }
                if (result.put(taxYear.intValue(), enabled.booleanValue()) != null) {
                    throw new IllegalStateException(
                            "Tax year registry lists " + taxYear.intValue() + " more than once");
                }
            }
            if (result.isEmpty()) {
                throw new IllegalStateException("Tax year registry lists no tax years");
            }
            return new Registry(result);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read tax year registry: " + resource, e);
        }
    }
}
