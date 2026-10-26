package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.node.TextNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;

import gov.irs.directfile.api.config.ConfiguredPdfProperties;
import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.pdf.load.ConfiguredPdfLookup;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 26 U.S.C. 6011(a): a return is made "according to the forms and regulations prescribed by the Secretary." For tax
 * year 2026 the prescribed template is under {@code pdf/2026/}. A Spanish entry that still points at a 2024 template,
 * or any other location outside {@code pdf/2026/}, is refused when that form has a 2026 English template. Language is
 * not a fact, so the guard is template resolution rather than {@link PrintRefusingKnockouts#FACT_PATHS}.
 */
class Ty2026SpanishTemplateRefusalTest {
    static final String FORM_1040_ES = "pdf/2024/IRS1040/es/f1040sp.pdf";
    static final String SCHEDULE_EIC_ES = "pdf/2024/IRS1040EIC/es/f1040sep-p.pdf";
    /** A fact value that must not appear in the refusal log or the exception text. */
    static final String FACT_SENTINEL = "sentinel-fact-value-not-a-template-path";

    static List<ConfiguredPdfProperties> configured;
    static PdfService pdfService;

    @BeforeAll
    static void init() throws Exception {
        configured = applicationYamlPdfs();
        PdfServiceProperties props = new PdfServiceProperties(configured, null, null, false);
        // Fact graph is unused: the refusal happens before facts are read.
        pdfService = new PdfService(props, new IOLocationService(null), null);
    }

    static List<ConfiguredPdfProperties> applicationYamlPdfs() throws Exception {
        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        return Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get()
                .getConfiguredPdfs();
    }

    /**
     * TY2026 {@code es} print: no PDF, HTTP 400, and the body lists template locations. Schedule EIC is included; the
     * guard is not a fixed list of five forms.
     */
    static SubmissionBlockingFactsResponseStatusException assertSpanishPrintRefused(
            PdfService service, TaxReturn taxReturn) throws Exception {
        InputStream[] produced = new InputStream[1];
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> {
                    produced[0] = service.getTaxReturn("es", taxReturn, false);
                });
        assertNull(produced[0], "no PDF bytes");
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(400, e.getStatusCode().value());
        assertNull(e.getCause());
        List<String> paths = blocking(e);
        assertFalse(paths.isEmpty(), "refused template paths");
        assertTrue(paths.contains(FORM_1040_ES), paths.toString());
        assertTrue(paths.contains(SCHEDULE_EIC_ES), paths.toString());
        assertTrue(paths.stream().noneMatch(p -> p.contains("pdf/2026/")), paths.toString());
        assertTrue(paths.stream().noneMatch(p -> p.startsWith("/")), paths.toString());
        assertFalse(e.getMessage().contains(FACT_SENTINEL), e.getMessage());
        return e;
    }

    @SuppressWarnings("unchecked")
    static List<String> blocking(SubmissionBlockingFactsResponseStatusException e) {
        return (List<String>) e.getBody().getProperties().get("blockingFacts");
    }

    @Test
    void everyMisconfiguredSpanishEntryIsRefusedIncludingScheduleEic() {
        List<String> refused = ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2026", "es", configured);
        assertEquals(expectedFromYaml(configured), refused);
        assertTrue(refused.contains(FORM_1040_ES), refused.toString());
        assertTrue(refused.contains(SCHEDULE_EIC_ES), refused.toString());
        assertTrue(refused.stream().anyMatch(p -> p.contains("IRS1040S1/")), refused.toString());
        assertTrue(refused.stream().anyMatch(p -> p.contains("IRS1040S2/")), refused.toString());
        assertTrue(refused.stream().anyMatch(p -> p.contains("IRS1040S3/")), refused.toString());
        assertTrue(refused.stream().anyMatch(p -> p.contains("IRS1040S8812/")), refused.toString());
        assertEquals(List.of(), ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2026", "en", configured));
        assertEquals(List.of(), ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2025", "es", configured));
        assertEquals(List.of(), ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2024", "es", configured));
    }

    /**
     * Forms whose English template is not under {@code pdf/2026/} are unchanged, and a missing {@code es} entry
     * resolves to the 2026 English template, which is not refused.
     */
    @Test
    void priorYearEnglishTemplatesAndEnglishFallbackAreNotRefused() {
        List<String> refused = ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2026", "es", configured);
        assertTrue(refused.stream().noneMatch(p -> p.contains("FORM9000")), refused.toString());
        assertTrue(refused.stream().noneMatch(p -> p.contains("/en/")), refused.toString());
        assertEquals(
                List.of(),
                ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear(
                        "2026", "es", List.of(pdf("IRS1040SD", "en", "pdf/2026/IRS1040SD/en/f1040sd--dft.pdf"))));
        assertEquals(
                List.of(),
                ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear(
                        "2026",
                        "es",
                        List.of(
                                pdf("FORM9000", "en", "pdf/2024/FORM9000/en/f9000_2021.pdf"),
                                pdf("FORM9000", "es", "pdf/2024/FORM9000/es/f9000sp_2021.pdf"))));
    }

    /** Not a fixed form list: any form with a 2026 English template is refused when {@code es} is outside. */
    @Test
    void anyFormOutsidePdf2026IsRefused() {
        assertEquals(
                List.of("pdf/2024/IRS9999/es/f9999sp.pdf"),
                ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear(
                        "2026",
                        "es",
                        List.of(
                                pdf("IRS9999", "en", "pdf/2026/IRS9999/en/f9999--dft.pdf"),
                                pdf("IRS9999", "es", "pdf/2024/IRS9999/es/f9999sp.pdf"))));
        assertEquals(
                List.of("pdf/2025/IRS1040/es/f1040sp.pdf"),
                ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear(
                        "2026",
                        "es",
                        List.of(
                                pdf("IRS1040", "en", "pdf/2026/IRS1040/en/f1040--dft.pdf"),
                                pdf("IRS1040", "es", "pdf/2025/IRS1040/es/f1040sp.pdf"))));
        assertEquals(
                List.of("src/main/resources/pdf/2024/IRS1040/es/f1040sp.pdf"),
                ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear(
                        "2026",
                        "es",
                        List.of(
                                pdf("IRS1040", "en", "src/main/resources/pdf/2026/IRS1040/en/f1040--dft.pdf"),
                                pdf("IRS1040", "es", "src/main/resources/pdf/2024/IRS1040/es/f1040sp.pdf"))));
    }

    /**
     * Mapping Form 1040 (sp) under {@code pdf/2026/} lifts the refusal for that form only. Schedule EIC and every
     * other TY2026 {@code es} entry that still points outside {@code pdf/2026/} stay refused. This does not pin the
     * 2026 Spanish draft.
     */
    @Test
    void mappingForm1040UnderPdf2026LiftsThatFormOnly() {
        List<String> before = ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2026", "es", configured);
        List<ConfiguredPdfProperties> mapped = new ArrayList<>();
        boolean replaced = false;
        for (ConfiguredPdfProperties prop : configured) {
            if ("2026".equals(prop.getYear())
                    && "IRS1040".equals(prop.getName())
                    && "es".equals(prop.getLanguageCode())) {
                mapped.add(copy(prop, "pdf/2026/IRS1040/es/f1040sp--dft.pdf"));
                replaced = true;
            } else {
                mapped.add(prop);
            }
        }
        assertTrue(replaced, "application.yaml has a TY2026 es Form 1040 entry");
        List<String> after = ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2026", "es", mapped);
        assertTrue(before.contains(FORM_1040_ES));
        assertFalse(after.contains(FORM_1040_ES));
        assertFalse(after.contains("pdf/2026/IRS1040/es/f1040sp--dft.pdf"));
        assertTrue(after.contains(SCHEDULE_EIC_ES), after.toString());
        List<String> expected = new ArrayList<>(before);
        assertTrue(expected.remove(FORM_1040_ES));
        assertEquals(expected, after);
        assertEquals(
                List.of(),
                ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear(
                        "2026",
                        "es",
                        List.of(
                                pdf("IRS1040", "en", "src/main/resources/pdf/2026/IRS1040/en/f1040--dft.pdf"),
                                pdf("IRS1040", "es", "src/main/resources/pdf/2026/IRS1040/es/f1040sp--dft.pdf"))));
    }

    /**
     * The refusal log is non-empty and holds only the template path. No fact value, return contents, exception
     * message, or stack trace.
     */
    @Test
    void refusalLogsOnlyTheTemplatePath() throws Exception {
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(Map.of(
                "/filers/#" + UUID.randomUUID() + "/lastName",
                new FactTypeWithItem("gov.irs.factgraph.persisters.StringWrapper", TextNode.valueOf(FACT_SENTINEL))));
        List<String> expected = ConfiguredPdfLookup.templateLocationsOutsidePrescribedYear("2026", "es", configured);

        Logger logger = (Logger) LoggerFactory.getLogger(PdfService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        Level previous = logger.getLevel();
        logger.setLevel(Level.WARN);
        SubmissionBlockingFactsResponseStatusException refused;
        try {
            refused = assertThrows(
                    SubmissionBlockingFactsResponseStatusException.class,
                    () -> pdfService.getTaxReturn("es", taxReturn, true));
        } finally {
            logger.detachAppender(appender);
            logger.setLevel(previous);
        }

        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertEquals(expected, blocking(refused));
        assertFalse(appender.list.isEmpty(), "expected a non-empty log capture");
        List<String> captured = new ArrayList<>();
        for (ILoggingEvent event : appender.list) {
            assertEquals(Level.WARN, event.getLevel());
            assertNull(event.getThrowableProxy(), "no stack trace");
            assertArrayEquals(new Object[] {event.getFormattedMessage()}, event.getArgumentArray());
            String message = event.getFormattedMessage();
            captured.add(message);
            assertFalse(message.contains(FACT_SENTINEL), message);
            assertFalse(message.contains("Exception"), message);
            assertFalse(message.contains("/filers"), message);
            assertFalse(message.contains(" "), message);
        }
        assertEquals(expected, captured, "capture holds only the template path");
        assertTrue(captured.contains(FORM_1040_ES));
        assertTrue(captured.contains(SCHEDULE_EIC_ES));
        assertFalse(refused.getMessage().contains(FACT_SENTINEL), refused.getMessage());
    }

    /**
     * Every TY2026 {@code es} location whose form has a 2026 English template and whose own location is outside
     * {@code pdf/2026/}. Independent of the production predicate: a path is outside when it does not contain
     * {@code pdf/2026/}.
     */
    private static List<String> expectedFromYaml(List<ConfiguredPdfProperties> props) {
        Map<String, String> english2026 = new LinkedHashMap<>();
        for (ConfiguredPdfProperties prop : props) {
            if (!"2026".equals(prop.getYear()) || !"en".equalsIgnoreCase(prop.getLanguageCode())) {
                continue;
            }
            if (prop.getLocation() != null && prop.getLocation().contains("pdf/2026/")) {
                english2026.put(prop.getName().toLowerCase(Locale.ROOT), prop.getLocation());
            }
        }
        List<String> expected = new ArrayList<>();
        for (ConfiguredPdfProperties prop : props) {
            if (!"2026".equals(prop.getYear()) || !"es".equalsIgnoreCase(prop.getLanguageCode())) {
                continue;
            }
            if (!english2026.containsKey(prop.getName().toLowerCase(Locale.ROOT))) {
                continue;
            }
            if (prop.getLocation() != null && prop.getLocation().contains("pdf/2026/")) {
                continue;
            }
            expected.add(prop.getLocation());
        }
        assertFalse(expected.isEmpty());
        return expected;
    }

    private static ConfiguredPdfProperties pdf(String name, String language, String location) {
        return new ConfiguredPdfProperties(
                name, "2026", language, location, "classpath", location + ".yml", "classpath", true, null);
    }

    private static ConfiguredPdfProperties copy(ConfiguredPdfProperties prop, String location) {
        return new ConfiguredPdfProperties(
                prop.getName(),
                prop.getYear(),
                prop.getLanguageCode(),
                location,
                prop.getLocationType(),
                prop.getConfigurationLocation(),
                prop.getConfigurationLocationType(),
                prop.isCacheInMemory(),
                prop.getPagesToInclude());
    }
}
