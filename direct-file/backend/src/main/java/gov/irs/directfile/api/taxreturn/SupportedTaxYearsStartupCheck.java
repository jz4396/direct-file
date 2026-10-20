package gov.irs.directfile.api.taxreturn;

import java.util.SortedSet;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Loads {@link SupportedTaxYears} while the application context starts, so a missing, unreadable or empty
 * {@code taxYears/registry.json} stops startup instead of surfacing as an error on the first tax return create.
 */
@Slf4j
@Component
public class SupportedTaxYearsStartupCheck {

    @PostConstruct
    SortedSet<Integer> loadRegistry() {
        // First use of SupportedTaxYears runs its static load; a bad registry throws here and fails the bean.
        SortedSet<Integer> years = SupportedTaxYears.years();
        log.info("Supported tax years: {}", years);
        return years;
    }
}
