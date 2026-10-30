package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.tin;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.Ty2026PdfPackageTest.checked;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #89: Form 8862 Rev. December 2025 (https://www.irs.gov/pub/irs-pdf/f8862.pdf, continuous-use final, SHA-256
 * fd783d1f46f1f286cd1d7a2cca8812fc2ec05760478359873e22ba9d05d5f3b5) through the real PdfService, fact dictionary and
 * application.yaml. Year-based field map carried over from the 2024 template (identical AcroForm field names); line
 * captions were checked against the Rev. 12-2025 face text (26 U.S.C. 32(k)(2) / 24(g); Form 8862 Rev. 12-2025 p. 1).
 *
 * <p>Golden end-to-end scenarios (synthetic data):
 *
 * <ul>
 *   <li>EITC without qualifying children: single, $10,000 W-2, born 1987, prior EITC disallowance notice expired so
 *       Form 8862 is required ({@link #eitcWithoutChildren}). Public print includes Form 8862 Part II Section B.
 *   <li>EITC with qualifying children: {@code 8862-eitc-no-ctc.json} with group-00 test SSNs. Public print is refused
 *       only by {@code /flowKnockoutScheduleEicWithoutTy2026Template}; with that path left out of the refusal check,
 *       Form 8862 Part II Section A prints.
 * </ul>
 *
 * CTC/ODC statement attachments and the Spanish Form 8862 stay on pdf/2024 templates.
 */
class Form8862Ty2026PdfSmokeTest {
    static final String FORM_8862_MARK = "Form 8862 (Rev. 12-2025)";
    static final String WITH_CHILDREN_SCENARIO = "8862-eitc-no-ctc.json";
    static final String SCHEDULE_EIC_KNOCKOUT = PrintRefusingKnockoutsTest.SCHEDULE_EIC_KNOCKOUT;
    static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * Childless EIC that must attach Form 8862: same wages and age as {@link
     * Schedule3ATy2026PdfSmokeTest#childlessEic}, plus an expired two-year EITC disallowance notice (26 U.S.C.
     * 32(k)(2)).
     */
    static Map<String, String> eitcWithoutChildren() {
        Map<String, String> m = new HashMap<>(Schedule3ATy2026PdfSmokeTest.childlessEic(true, true));
        m.put("/eitcHadImproperClaims", bool(true));
        m.put("/eitcImproperClaimsDueToQc", bool(false));
        m.put("/eitcImproperClaimTakenSinceDisallowal", bool(false));
        m.put("/eitcReceivedImproperClaimsNotice", enumValue("twoYears", "/improperClaimsNoticeOptions"));
        m.put("/eitcImproperClaimsNoticeExpired", bool(true));
        return m;
    }

    /**
     * EITC with two qualifying children that must attach Form 8862. Every TIN from the scenario file is first moved to
     * a 9xx test area by {@link CreditFormsTy2026PdfSmokeTest#scenarioFacts}; the filer and each dependent then get a
     * group-00 test SSN so 26 U.S.C. 32(c)(1)(E) and (m) are met (the SSA never assigns group 00).
     */
    static Map<String, FactTypeWithItem> eitcWithChildren() throws Exception {
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(WITH_CHILDREN_SCENARIO);
        String primary = null;
        for (var e : facts.entrySet()) {
            if (e.getKey().startsWith("/filers/#")
                    && e.getKey().endsWith("/isPrimaryFiler")
                    && e.getValue().item().asBoolean(false)) {
                primary = e.getKey().substring("/filers/#".length(), e.getKey().length() - "/isPrimaryFiler".length());
            }
        }
        assertTrue(primary != null, WITH_CHILDREN_SCENARIO + " has a primary filer");
        Map<String, String> overrides = new LinkedHashMap<>();
        overrides.put("/filers/#" + primary + "/tin", tin("444", "00", "4444"));
        for (String k : new ArrayList<>(facts.keySet())) {
            if (k.startsWith("/formW2s/#") && k.endsWith("/filer")) {
                overrides.put(k.substring(0, k.length() - "/filer".length()) + "/tin", tin("444", "00", "4444"));
            }
        }
        int child = 0;
        List<String> childSerials = List.of("1111", "2222", "3333");
        for (String k : new ArrayList<>(facts.keySet())) {
            if (k.startsWith("/familyAndHousehold/#") && k.endsWith("/tin")) {
                overrides.put(k, tin("444", "00", childSerials.get(child++)));
            }
        }
        // Schedule 3-A lines 7 and 8 so a TY2026 EIC return can print Schedule 3-A with the credit.
        overrides.put("/schedule3AWantsFederalPublicBenefit", bool(true));
        overrides.put("/schedule3AIsCitizenNationalOrQualifiedAlien", bool(true));
        for (var e : overrides.entrySet()) {
            facts.put(e.getKey(), MAPPER.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return facts;
    }

    @Test
    void eitcWithoutChildrenPrintsForm8862SectionB() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, FactTypeWithItem> facts = PrintRefusingKnockoutsTest.smoke(eitcWithoutChildren());
        Graph graph = fgs.getGraph(facts);
        assertEquals(Boolean.TRUE, graph.get("/pdfIncludeForm8862").get());
        assertEquals(Boolean.TRUE, graph.get("/eitc8862Required").get());
        assertEquals(
                Boolean.TRUE,
                graph.get("/form8862RequiredAndHasNoQualifyingChildren").get());
        assertEquals(
                Boolean.FALSE,
                graph.get("/form8862RequiredAndHasQualifyingChildren").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = generatePublicPrint(eitcWithoutChildren());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "form8862-ty2026-eitc-without-children-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains(FORM_8862_MARK), "Rev. 12-2025 Form 8862");
            assertTrue(text.contains("Information To Claim Certain Credits After Disallowance"), "form title");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "no draft cover");
            assertFalse(text.contains("DRAFT—NOT FOR FILING"), "final continuous-use form");

            Map<String, String> f = fieldsOnPages(doc, FORM_8862_MARK);
            assertFalse(f.isEmpty(), "Form 8862 is included when /pdfIncludeForm8862");
            assertTrue(field(f, "f1_01[0]").toUpperCase().contains("EXAMPLETON"), "name");
            assertEquals("444-00-4444", field(f, "f1_02[0]"), "test-only SSN");
            assertEquals("2026", field(f, "Line1_CombField[0].f1_03[0]"), "line 1 tax year");
            assertTrue(checked(f, "Checkbox1_ReadOrder[0].c1_1[0]"), "line 2 EIC");
            assertFalse(checked(f, "Checkbox2_ReadOrder[0].c1_2[0]"), "line 2 CTC/ODC off");
            assertTrue(checked(f, "c1_4[1]"), "line 3 No");
            assertTrue(checked(f, "c1_5[1]"), "line 4 No");
            assertFalse(checked(f, "c1_6[0]"), "Section A off");
            assertTrue(checked(f, "c1_6[1]"), "Section B on");
            assertEquals("", field(f, "f1_04[0]"), "no Child 1 name without QC");
            assertFalse(field(f, "Ln9a_CombField[0].f2_01[0]").isEmpty(), "9a days main home in the U.S.");
            assertFalse(field(f, "f2_03[0]").isEmpty(), "10a age");
        }
    }

    @Test
    void eitcWithChildrenPrintsForm8862SectionAWhenScheduleEicKnockoutIsSkipped() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        PdfService pdfService = CreditFormsTy2026PdfSmokeTest.pdfService(fgs);
        Map<String, FactTypeWithItem> facts = eitcWithChildren();
        Graph graph = fgs.getGraph(facts);
        assertEquals(Boolean.TRUE, graph.get("/pdfIncludeForm8862").get());
        assertEquals(Boolean.TRUE, graph.get("/eitc8862Required").get());
        assertEquals(
                Boolean.TRUE,
                graph.get("/form8862RequiredAndHasQualifyingChildren").get());
        assertEquals(
                Boolean.FALSE,
                graph.get("/form8862RequiredAndHasNoQualifyingChildren").get());
        assertEquals(Boolean.TRUE, graph.get("/pdfIncludeScheduleEic").get());
        assertEquals(List.of(SCHEDULE_EIC_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(graph));

        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        SubmissionBlockingFactsResponseStatusException refused = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn, false));
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertEquals(
                List.of(SCHEDULE_EIC_KNOCKOUT),
                refused.getBody().getProperties().get("blockingFacts"));

        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !SCHEDULE_EIC_KNOCKOUT.equals(p))
                .toList();
        byte[] bytes;
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false, without)) {
            bytes = in.readAllBytes();
        }
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "form8862-ty2026-eitc-with-children-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains(FORM_8862_MARK), "Rev. 12-2025 Form 8862");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "no draft cover");

            Map<String, String> f = fieldsOnPages(doc, FORM_8862_MARK);
            assertFalse(f.isEmpty(), "Form 8862 prints when Schedule EIC is left out of the refusal check");
            assertTrue(checked(f, "Checkbox1_ReadOrder[0].c1_1[0]"), "line 2 EIC");
            assertTrue(checked(f, "c1_6[0]"), "Section A on");
            assertFalse(checked(f, "c1_6[1]"), "Section B off");
            assertFalse(field(f, "f1_04[0]").isEmpty(), "5a Child 1 name");
            assertFalse(field(f, "f1_05[0]").isEmpty(), "5b Child 2 name");
            assertFalse(field(f, "Child1_CombField[0].f1_07[0]").isEmpty(), "7 Child 1 days in the U.S.");
        }
    }

    @Test
    void configurationIsYearBasedAndPointsAtThe2026Template() throws Exception {
        String config = new String(
                new ClassPathResource("pdf/2026/IRS8862/en/configuration.yml").getContentAsByteArray(),
                StandardCharsets.UTF_8);
        assertTrue(config.contains("YEAR-BASED MAPPING"), "field map is flagged as year-based");
        assertTrue(config.contains("fd783d1f46f1f286cd1d7a2cca8812fc2ec05760478359873e22ba9d05d5f3b5"), "pinned sha");
        assertTrue(config.contains("Rev. December 2025") || config.contains("Rev. 12-2025"), "revision cite");
        assertFalse(
                config.lines().anyMatch(l -> l.trim().startsWith("location:") && l.contains("pdf/2024/")),
                "field map does not point at the 2024 PDF");
        assertTrue(config.contains("includeWhen: /pdfIncludeForm8862"), "includeWhen");
    }

    static String field(Map<String, String> fields, String suffix) {
        String found = null;
        for (var e : fields.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field suffix is unique: " + suffix);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present: " + suffix);
        return found;
    }
}
