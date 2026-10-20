package gov.irs.directfile.api.taxreturn;

import java.lang.reflect.Method;
import java.util.List;
import java.util.SortedSet;
import java.util.TreeSet;

import jakarta.annotation.PostConstruct;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.stereotype.Component;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The supported-year registry is loaded at startup. A missing or empty registry, or a year without an explicit
 * boolean {@code enabled} flag, is an error, not a fallback.
 */
class SupportedTaxYearsStartupCheckTest {

    @Test
    void startupCheckIsAnEagerSpringBean() throws Exception {
        assertTrue(SupportedTaxYearsStartupCheck.class.isAnnotationPresent(Component.class));
        Method m = SupportedTaxYearsStartupCheck.class.getDeclaredMethod("loadRegistry");
        assertTrue(m.isAnnotationPresent(PostConstruct.class));
    }

    @Test
    void startupCheckLoadsTheRegistry() {
        SortedSet<Integer> years = new SupportedTaxYearsStartupCheck().loadRegistry();
        assertEquals(new TreeSet<>(List.of(2026)), years);
    }

    @Test
    void missingRegistryFails() {
        IllegalStateException e =
                assertThrows(IllegalStateException.class, () -> SupportedTaxYears.load("taxYears-test/missing.json"));
        assertTrue(e.getMessage().contains("Missing tax year registry"));
    }

    @ParameterizedTest
    @CsvSource({
        "taxYears-test/missing-enabled.json, without a boolean enabled flag",
        "taxYears-test/string-enabled.json, without a boolean enabled flag",
        "taxYears-test/duplicate-year.json, more than once"
    })
    void registryWithoutAnExplicitEnabledFlagOrWithADuplicateYearFails(String resource, String message) {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> SupportedTaxYears.load(resource));
        assertTrue(e.getMessage().contains(message), e.getMessage());
    }

    @Test
    void shippedRegistryKeepsTy2026Enabled() {
        assertTrue(SupportedTaxYears.acceptsNewReturns(2026));
        assertEquals(new TreeSet<>(List.of(2026)), SupportedTaxYears.registry().enabledYears());
    }

    @Test
    void disabledYearStaysSupportedButAcceptsNoNewReturns() {
        SupportedTaxYears.Registry r = SupportedTaxYears.load("taxYears-test/two-years-one-disabled.json");
        assertEquals(new TreeSet<>(List.of(2026, 2027)), r.years());
        assertEquals(new TreeSet<>(List.of(2026)), r.enabledYears());
        assertTrue(r.isSupported(2027));
        assertFalse(r.acceptsNewReturns(2027));
        assertTrue(r.acceptsNewReturns(2026));
        assertFalse(r.acceptsNewReturns(2025));
        assertTrue(r.newReturnRefusal(2026).isEmpty());
        assertTrue(r.newReturnRefusal(2027).orElseThrow().contains("Tax year 2027 is not open for new returns"));
        assertTrue(r.newReturnRefusal(2025).orElseThrow().contains("Tax year 2025 is not supported"));
    }

    @Test
    void emptyRegistryFails() {
        IllegalStateException e = assertThrows(
                IllegalStateException.class, () -> SupportedTaxYears.load("taxYears-test/empty-registry.json"));
        assertTrue(e.getMessage().contains("lists no tax years"));
    }
}
