package gov.irs.directfile.api.pdf;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.pdf.load.ConfiguredPdfLookup;
import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #208: 2026 draft Schedule EIC (https://www.irs.gov/pub/irs-dft/f1040sei--dft.pdf) filled from the fact graph with
 * the field map in pdf/2026/IRS1040EIC/en/configuration.yml. Draft-based field map: re-verify when the final form is
 * released.
 *
 * <p>The return package still refuses an EIC return with a qualifying child ({@link PdfKnockoutRefusalTest}) because
 * Schedule EIC's 26 U.S.C. 152(c)(4) tie-breaker is not computed. Schedule 3-A prints with the EIC or ACTC (#239). This
 * test fills Schedule EIC on its own, with the same configuration lookup, fact extraction and
 * {@link IrsScheduleEicPdfForm} that {@link PdfService#getTaxReturn} uses.
 *
 * <p>Golden end-to-end scenario (synthetic data): the head-of-household family scenario with group-00 test SSNs
 * ({@link PdfKnockoutRefusalTest#familyWithSsns}); the SSA never assigns group 00
 * (https://www.ssa.gov/employer/randomization.html).
 */
class ScheduleEicTy2026PdfSmokeTest {
    static final String CONFIG = "pdf/2026/IRS1040EIC/en/configuration.yml";
    static final String P = "topmostSubform[0].Page1[0].";

    static ConfiguredPdfLookup lookup;

    @BeforeAll
    static void init() throws Exception {
        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        lookup = new ConfiguredPdfLookup(new IOLocationService(null), props.getConfiguredPdfs());
    }

    /** Fills Schedule EIC for the given facts, as {@link PdfService#getTaxReturn} does for one template. */
    static List<PDDocument> fill(Map<String, FactTypeWithItem> typed) throws Exception {
        var blank = lookup.getBlankPdfStream("2026", "IRS1040EIC", "en");
        PdfConfiguration config = blank.getConfig();
        Set<String> paths = config.getFactPathsForPdf().stream()
                .filter(path -> !FactEvaluationResult.isPseudoPath(path))
                .map(FactEvaluationResult::collectionIndexToWildcard)
                .collect(Collectors.toSet());
        var fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        FactEvaluationResult facts = fgs.extractFacts(paths, fgs.getGraph(typed));
        return new IrsScheduleEicPdfForm("IRS1040EIC")
                .generateDocuments(facts, blank.getBlankPDF().readAllBytes(), config, PdfLanguages.EN);
    }

    static Map<String, String> values(PDDocument doc) {
        Map<String, String> m = new TreeMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            if (f instanceof PDCheckBox cb) {
                m.put(f.getFullyQualifiedName(), cb.isChecked() ? "X" : "");
            } else if (f.getValueAsString() != null && !f.getValueAsString().isEmpty()) {
                m.put(f.getFullyQualifiedName(), f.getValueAsString());
            }
        }
        return m;
    }

    static void assertField(Map<String, String> v, String field, String expected) {
        assertEquals(expected, v.getOrDefault(P + field, ""), field);
    }

    /** Header, lines 1-3, 5 and 6 for the two children; the third column stays blank. */
    static void assertCommonFields(Map<String, String> v) {
        assertField(v, "f1_01[0]", "Test E Testerface");
        assertField(v, "f1_02[0]", "444-00-4444");
        assertField(v, "f1_03[0]", "Uno E testerface");
        assertField(v, "f1_04[0]", "Duo E testerface");
        assertField(v, "f1_06[0]", "444-00-1111");
        assertField(v, "f1_07[0]", "444-00-2222");
        assertField(v, "f1_21[0]", "Child");
        assertField(v, "f1_22[0]", "Child");
        assertField(v, "Line6_Child1_ReadOrder[0].f1_24[0]", "12");
        assertField(v, "Line6_Child2_ReadOrder[0].f1_25[0]", "12");
        for (String f : List.of(
                "f1_05[0]",
                "f1_08[0]",
                "f1_17[0]",
                "f1_18[0]",
                "f1_19[0]",
                "f1_20[0]",
                "f1_23[0]",
                "f1_26[0]",
                "Line4a_Child3_Yes_ReadOrder[0].c1_3[0]",
                "c1_3[0]",
                "Line4b_Child3_Yes_ReadOrder[0].c1_6[0]",
                "c1_6[0]")) {
            assertField(v, f, "");
        }
        // Line 4b "No" means "The child is not a qualifying child", so it never applies to a listed child.
        assertField(v, "Line4b_Child1_ReadOrder[0].c1_4[0]", "");
        assertField(v, "Line4b_Child2_ReadOrder[0].c1_5[0]", "");
    }

    static Map<String, String> fillOne(Map<String, FactTypeWithItem> facts) throws Exception {
        List<PDDocument> docs = fill(facts);
        assertEquals(1, docs.size(), "one Schedule EIC");
        try (PDDocument doc = docs.get(0)) {
            assertEquals(1, doc.getNumberOfPages(), "cover sheet and instructions page dropped");
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("SCHEDULE EIC"), "Schedule EIC page");
            assertTrue(text.contains("Qualifying Child Information"), "form page 1");
            assertTrue(text.contains(CreditFormsTy2026PdfSmokeTest.DRAFT_MARK), "2026 draft");
            assertFalse(text.contains(CreditFormsTy2026PdfSmokeTest.COVER_SHEET), "no cover sheet");
            assertFalse(text.contains("Purpose of Schedule"), "no instructions page");
            return values(doc);
        }
    }

    /**
     * Both children were born after 2007 and are younger than the filer, so the form says "skip lines 4a and 4b; go to
     * line 5" and every line 4 box stays blank.
     */
    @Test
    void familyScenarioFillsTwoChildrenAndSkipsLine4() throws Exception {
        Map<String, String> v = fillOne(PdfKnockoutRefusalTest.familyWithSsns());
        assertCommonFields(v);
        assertEquals("2016", digits(v, "Year1_ReadOrder[0].f1_", 9));
        assertEquals("2019", digits(v, "Year2_ReadOrder[0].f1_", 13));
        for (String f : List.of(
                "Line4a_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_1[0]",
                "Line4a_Child1_ReadOrder[0].c1_1[0]",
                "Line4a_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_2[0]",
                "Line4a_Child2_ReadOrder[0].c1_2[0]",
                "Line4b_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_4[0]",
                "Line4b_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_5[0]")) {
            assertField(v, f, "");
        }
    }

    static final String UNO = "/familyAndHousehold/#60c874b4-bb7b-4c82-8550-5555b2b585f8/";
    static final String DUO = "/familyAndHousehold/#93e7961f-dd7b-4c7f-9430-bb597123935f/";

    static FactTypeWithItem fact(String json) throws Exception {
        return new ObjectMapper().readValue(json, FactTypeWithItem.class);
    }

    static FactTypeWithItem day(String date) throws Exception {
        return fact("{\"$type\":\"gov.irs.factgraph.persisters.DayWrapper\",\"item\":{\"date\":\"" + date + "\"}}");
    }

    static FactTypeWithItem bool(boolean b) throws Exception {
        return fact("{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":" + b + "}");
    }

    static String digits(Map<String, String> v, String prefix, int first) {
        StringBuilder b = new StringBuilder();
        for (int i = first; i < first + 4; i++) {
            b.append(v.getOrDefault(P + prefix + String.format("%02d[0]", i), ""));
        }
        return b.toString();
    }

    /**
     * Child 1 is 20 at the end of 2026 and a full-time student: line 4a "Yes". Child 2 is 26, not a student, and
     * permanently and totally disabled: line 4a "No", line 4b "Yes". 26 U.S.C. 152(c)(3)
     * (https://www.law.cornell.edu/uscode/text/26/152): the age test is met by a child who "has not attained the age of
     * 24 as of the close of such calendar year" and is a student, and "in the case of an individual who is permanently
     * and totally disabled ... at any time during such calendar year", regardless of age.
     */
    @Test
    void studentAndDisabledChildrenFillLines4aAnd4b() throws Exception {
        Map<String, FactTypeWithItem> facts = PdfKnockoutRefusalTest.familyWithSsns();
        facts.put(UNO + "dateOfBirth", day("2006-11-11"));
        facts.put(UNO + "fullTimeStudent", bool(true));
        facts.put(DUO + "dateOfBirth", day("2000-11-11"));
        facts.put(DUO + "fullTimeStudent", bool(false));
        facts.put(DUO + "permanentTotalDisability", bool(true));
        var graph = CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
        for (String c : List.of(UNO, DUO)) {
            var qc = graph.get(c + "eitcQualifyingChild");
            assertTrue(qc.complete() && Boolean.TRUE.equals(qc.get()), c + "eitcQualifyingChild");
        }

        Map<String, String> v = fillOne(facts);
        assertCommonFields(v);
        assertEquals("2006", digits(v, "Year1_ReadOrder[0].f1_", 9));
        assertEquals("2000", digits(v, "Year2_ReadOrder[0].f1_", 13));
        assertField(v, "Line4a_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_1[0]", "X");
        assertField(v, "Line4a_Child1_ReadOrder[0].c1_1[0]", "");
        assertField(v, "Line4b_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_4[0]", "");
        assertField(v, "Line4a_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_2[0]", "");
        assertField(v, "Line4a_Child2_ReadOrder[0].c1_2[0]", "X");
        assertField(v, "Line4b_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_5[0]", "X");
    }

    /** Each mapped field's tooltip in the 2026 draft names the line and child column the configuration fills. */
    @Test
    void everyMappedFieldTooltipNamesItsLine() throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("f1_01[0]", "Name(s) shown on return");
        expected.put("f1_02[0]", "Your social security number");
        expected.put("f1_03[0]", "Child 1. First name. Last name.");
        expected.put("f1_04[0]", "1. Child 2. First name. Last name.");
        expected.put("f1_05[0]", "1. Child 3. First name. Last name.");
        expected.put("f1_06[0]", "2. Child's S S N.");
        expected.put("f1_07[0]", "2. Child 2.");
        expected.put("f1_08[0]", "2. Child 3.");
        expected.put("Year1_ReadOrder[0].f1_09[0]", "3. Child's year of birth. Child 1. Year. Digit 1 of 4.");
        expected.put("Year1_ReadOrder[0].f1_10[0]", "3. Digit 2 of 4.");
        expected.put("Year1_ReadOrder[0].f1_11[0]", "3. Digit 3 of 4.");
        expected.put("Year1_ReadOrder[0].f1_12[0]", "3. Digit 4 of 4.");
        expected.put("Year2_ReadOrder[0].f1_13[0]", "3. Child 2. Year. Digit 1 of 4.");
        expected.put("Year2_ReadOrder[0].f1_14[0]", "3. Digit 2 of 4.");
        expected.put("Year2_ReadOrder[0].f1_15[0]", "3. Digit 3 of 4.");
        expected.put("Year2_ReadOrder[0].f1_16[0]", "3. Digit 4 of 4.");
        expected.put("f1_17[0]", "3. Child 3. Year. Digit 1 of 4.");
        expected.put("f1_18[0]", "3. Digit 2 of 4.");
        expected.put("f1_19[0]", "3. Digit 3 of 4.");
        expected.put("f1_20[0]", "3. Digit 4 of 4.");
        expected.put("Line4a_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_1[0]", "Child 1. Yes. Go to line 5.");
        expected.put("Line4a_Child1_ReadOrder[0].c1_1[0]", "4a. No. Go to line 4b.");
        expected.put("Line4a_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_2[0]", "4a. Child 2. Yes. Go to line 5.");
        expected.put("Line4a_Child2_ReadOrder[0].c1_2[0]", "4a. No. Go to line 4b.");
        expected.put("Line4a_Child3_Yes_ReadOrder[0].c1_3[0]", "4a. Child 3. Yes. Go to line 5.");
        expected.put("c1_3[0]", "4a. No. Go to line 4b.");
        expected.put(
                "Line4b_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_4[0]",
                "4b. Was the child permanently and totally disabled during any part of 2026? Child 1. Yes.");
        expected.put("Line4b_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_5[0]", "4b. Child 2. Yes. Go to line 5.");
        expected.put("Line4b_Child3_Yes_ReadOrder[0].c1_6[0]", "4b. Child 3. Yes. Go to line 5.");
        expected.put("f1_21[0]", "5. Child's relationship to you");
        expected.put("f1_22[0]", "5. Child 2.");
        expected.put("f1_23[0]", "5. Child 3.");
        expected.put(
                "Line6_Child1_ReadOrder[0].f1_24[0]",
                "6. Number of months child lived with you in the United States during 2026.");
        expected.put("Line6_Child2_ReadOrder[0].f1_25[0]", "6. Child 2. months.");
        expected.put("f1_26[0]", "6. Child 3. months.");

        Map<String, String> mapped = mappedFields();
        assertEquals(expected.keySet(), mapped.keySet(), "mapped fields");
        var blank = lookup.getBlankPdfStream("2026", "IRS1040EIC", "en");
        try (PDDocument doc = Loader.loadPDF(blank.getBlankPDF().readAllBytes())) {
            var form = doc.getDocumentCatalog().getAcroForm();
            for (var e : expected.entrySet()) {
                PDField field = form.getField(P + e.getKey());
                assertNotNull(field, e.getKey() + " exists in the draft");
                String tooltip = field.getAlternateFieldName().replaceAll("\\s+", " ");
                assertTrue(
                        tooltip.contains(e.getValue()),
                        e.getKey() + ": expected \"" + e.getValue() + "\" in \"" + tooltip + "\"");
            }
        }
    }

    /** Field (relative to {@link #P}) to fact expression, read from the configuration's nested form map. */
    static Map<String, String> mappedFields() throws Exception {
        String yaml = new String(new ClassPathResource(CONFIG).getContentAsByteArray(), StandardCharsets.UTF_8);
        Map<String, Object> root = new Yaml().load(yaml);
        Map<String, Object> page = nested(nested(nested(root, "form"), "topmostSubform[0]"), "Page1[0]");
        Map<String, String> out = new LinkedHashMap<>();
        flatten("", page, out);
        return out;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> nested(Map<String, Object> m, String key) {
        return (Map<String, Object>) m.get(key);
    }

    @SuppressWarnings("unchecked")
    static void flatten(String prefix, Map<String, Object> m, Map<String, String> out) {
        for (var e : m.entrySet()) {
            if (e.getValue() instanceof Map<?, ?> child) {
                flatten(prefix + e.getKey() + ".", (Map<String, Object>) child, out);
            } else {
                out.put(prefix + e.getKey(), String.valueOf(e.getValue()));
            }
        }
    }
}
