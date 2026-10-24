package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.tin;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The printed package is the return, so a knockout that stops filing also stops the PDF. A return that claims the
 * earned income credit with a qualifying child needs Schedule EIC with each child's name, age and TIN (26 U.S.C.
 * 32(c)(3)(D)(i)), and the 2026 Form 1040 says to attach Schedule 3-A for an amount on line 27a, which has no template
 * yet (#89). The 2026 Schedule EIC itself prints ({@link ScheduleEicTy2026PdfSmokeTest}), but {@link
 * PdfService#getTaxReturn} refuses that return rather than print an incomplete package: every EIC return is refused by
 * the Schedule 3-A knockout as well, so lifting the Schedule EIC knockout alone would not make it printable. Returns
 * without those knockouts still build.
 */
class PdfKnockoutRefusalTest {
    static final ObjectMapper MAPPER = new ObjectMapper();
    static final String SCHEDULE_EIC_KNOCKOUT = "/flowKnockoutScheduleEicWithoutTy2026Template";
    /** Head of household, two qualifying children, $50,000 of W-2 wages, child care expenses. */
    static final String FAMILY = "hoh-cdcc.json";
    /** Group 00 is never assigned by the SSA, so these are valid-format test SSNs that no person has. */
    static final String FILER_SSN = tin("444", "00", "4444");

    static FactGraphService factGraphService;
    static PdfService pdfService;

    @BeforeAll
    static void init() throws Exception {
        factGraphService = CreditFormsTy2026PdfSmokeTest.factGraphService();
        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        pdfService = new PdfService(props, new IOLocationService(null), factGraphService);
    }

    /** The family scenario with group-00 test SSNs for the filer, the W-2 and each child, so the EIC applies. */
    static Map<String, FactTypeWithItem> familyWithSsns() throws Exception {
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(FAMILY);
        Map<String, String> m = new HashMap<>();
        int child = 0;
        for (String k : new ArrayList<>(facts.keySet())) {
            if (k.startsWith("/filers/#") && k.endsWith("/tin")) {
                m.put(k, FILER_SSN);
            }
            if (k.startsWith("/formW2s/#") && k.endsWith("/filer")) {
                m.put(k.substring(0, k.length() - "/filer".length()) + "/tin", FILER_SSN);
            }
            if (k.startsWith("/familyAndHousehold/#") && k.endsWith("/tin")) {
                child++;
                m.put(k, tin("444", "00", String.valueOf(child).repeat(4)));
            }
        }
        assertEquals(2, child, FAMILY + " has two dependents");
        for (var e : m.entrySet()) {
            facts.put(e.getKey(), MAPPER.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return facts;
    }

    static TaxReturn taxReturn(Map<String, FactTypeWithItem> facts) {
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        return taxReturn;
    }

    static void assertKnockout(Map<String, FactTypeWithItem> facts, boolean expected) throws Exception {
        var r = factGraphService.getGraph(facts).get(SCHEDULE_EIC_KNOCKOUT);
        assertTrue(r.complete(), SCHEDULE_EIC_KNOCKOUT + " is complete");
        assertEquals(expected, r.get(), SCHEDULE_EIC_KNOCKOUT);
    }

    static void assertBuilds(Map<String, FactTypeWithItem> facts) throws Exception {
        for (String language : List.of("en", "es")) {
            try (InputStream in = pdfService.getTaxReturn(language, taxReturn(facts), false);
                    PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
                assertTrue(doc.getNumberOfPages() > 0, language + " package has pages");
            }
        }
    }

    @Test
    void eicWithQualifyingChildIsRefused() throws Exception {
        Map<String, FactTypeWithItem> facts = familyWithSsns();
        var graph = factGraphService.getGraph(facts);
        var eic = graph.get("/earnedIncomeCredit");
        assertTrue(eic.complete() && ((Number) eic.get()).doubleValue() > 0, "EIC is claimed: " + eic);
        assertTrue(Boolean.TRUE.equals(graph.get("/pdfIncludeScheduleEic").get()), "Schedule EIC would print");
        assertKnockout(facts, true);
        assertTrue(Boolean.TRUE.equals(graph.get("/flowIsKnockedOut").get()), "/flowIsKnockedOut");

        for (String language : List.of("en", "es")) {
            SubmissionBlockingFactsResponseStatusException e = assertThrows(
                    SubmissionBlockingFactsResponseStatusException.class,
                    () -> pdfService.getTaxReturn(language, taxReturn(facts), false));
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
            // The EIC (Form 1040 line 27a) also needs Schedule 3-A (#89).
            assertEquals(
                    List.of(SCHEDULE_EIC_KNOCKOUT, PrintRefusingKnockoutsTest.SCHEDULE_3A_KNOCKOUT),
                    e.getBody().getProperties().get("blockingFacts"));
        }
    }

    /**
     * #89: the print path refuses with exactly {@code knockout}, in English and Spanish; with that one entry left out
     * of the refusal check the same return prints, so taking it out of FACT_PATHS would print without the form.
     */
    static void assertRefusedOnlyBy(Map<String, FactTypeWithItem> facts, String knockout) throws Exception {
        assertTrue(
                Boolean.TRUE.equals(factGraphService
                        .getGraph(facts)
                        .get("/flowIsKnockedOut")
                        .get()),
                "/flowIsKnockedOut");
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !p.equals(knockout))
                .toList();
        for (String language : List.of("en", "es")) {
            SubmissionBlockingFactsResponseStatusException e = assertThrows(
                    SubmissionBlockingFactsResponseStatusException.class,
                    () -> pdfService.getTaxReturn(language, taxReturn(facts), false));
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
            assertEquals(List.of(knockout), e.getBody().getProperties().get("blockingFacts"));
            try (InputStream in = pdfService.getTaxReturn(language, taxReturn(facts), false, without);
                    PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
                assertTrue(doc.getNumberOfPages() > 0, language + " would print without " + knockout);
            }
        }
    }

    /**
     * Instructions for Schedule C (2025), PDF p. 2: "Use Schedule C (Form 1040) to report income or (loss) from a
     * business you operated or a profession you practiced as a sole proprietor." No Schedule C template is configured,
     * so a return with a business is refused.
     */
    @Test
    void scheduleCBusinessIsRefused() throws Exception {
        assertRefusedOnlyBy(PrintRefusingKnockoutsTest.scheduleCOnly(), PrintRefusingKnockoutsTest.SCHEDULE_C_KNOCKOUT);
    }

    /**
     * 2026 draft Form 1040, lines 32a-32c: "If you entered an amount on line 27a, 28, 29, or 30, attach Sch. 3-A".
     * An ACTC (line 28, 26 U.S.C. 24(d)) with no EIC is refused, since Schedule 3-A has no template and line 32b no
     * fact.
     */
    @Test
    void additionalChildTaxCreditWithoutEicIsRefused() throws Exception {
        assertRefusedOnlyBy(
                PrintRefusingKnockoutsTest.schedule3AOnly(), PrintRefusingKnockoutsTest.SCHEDULE_3A_KNOCKOUT);
    }

    @Test
    void familyWithoutEicStillBuilds() throws Exception {
        // The scenario's own 9xx TINs: an ITIN filer gets no EIC (26 U.S.C. 32(c)(1)(E), (m)).
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(FAMILY);
        assertKnockout(facts, false);
        assertBuilds(facts);
    }

    /**
     * Form 2210 (2026) draft, p. 1: "If box B, C, or D applies, you must figure your penalty and file Form 2210." A
     * Part II box answered yes refuses the package through the real print path; with every answer no it builds.
     */
    @Test
    void form2210PartIIYesIsRefusedByThePrintPath() throws Exception {
        Map<String, FactTypeWithItem> facts =
                CreditFormsTy2026PdfSmokeTest.scenarioFacts(PrintRefusingKnockoutsTest.FORM_2210_SCENARIO);
        assertBuilds(facts);
        facts.put(
                "/form2210WaiverRequested",
                MAPPER.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}",
                        FactTypeWithItem.class));
        for (String language : List.of("en", "es")) {
            SubmissionBlockingFactsResponseStatusException e = assertThrows(
                    SubmissionBlockingFactsResponseStatusException.class,
                    () -> pdfService.getTaxReturn(language, taxReturn(facts), false));
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
            assertEquals(
                    List.of(PrintRefusingKnockoutsTest.FORM_2210_KNOCKOUT),
                    e.getBody().getProperties().get("blockingFacts"));
        }
    }

    @Test
    void goldenReturnStillBuilds() throws Exception {
        Map<String, FactTypeWithItem> facts = SubmissionBlockingFactsTest.golden();
        assertKnockout(facts, false);
        assertBuilds(facts);
    }

    @Test
    void printRefusingKnockoutsAreSubmissionBlockingFacts() throws Exception {
        assertTrue(PrintRefusingKnockouts.FACT_PATHS.stream()
                .allMatch(p -> factGraphService.getDigest().getSubmissionBlockingFacts().stream()
                        .anyMatch(f -> f.path().equals(p))));
    }
}
