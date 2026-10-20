package gov.irs.directfile.api.taxreturn;

import java.lang.reflect.Method;
import java.util.List;
import java.util.SortedSet;
import java.util.TreeSet;

import jakarta.annotation.PostConstruct;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Component;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The supported-year registry is loaded at startup, and a missing or empty registry is an error, not a fallback. */
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

    @Test
    void emptyRegistryFails() {
        IllegalStateException e = assertThrows(
                IllegalStateException.class, () -> SupportedTaxYears.load("taxYears-test/empty-registry.json"));
        assertTrue(e.getMessage().contains("lists no tax years"));
    }
}
