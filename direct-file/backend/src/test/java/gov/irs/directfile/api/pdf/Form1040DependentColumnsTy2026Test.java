package gov.irs.directfile.api.pdf;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.pdf.load.ConfiguredPdfLookup;
import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #89: Form 1040 dependents rows (5)(a)/(b) and (6). The 2026 draft tooltips name row (5) "Check if lived with you
 * more than half of 2026" boxes (a) Yes and (b) And in the U.S., and row (6) "Full-time student" and "Permanently and
 * totally disabled".
 *
 * <p>Instructions for Form 1040 (2025) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf SHA-256
 * 482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a are still the published instructions. PDF p. 17:
 * check (5)(a) when the child lived with you for more than half of 2025, and check row (6) when the child is a
 * full-time student or is permanently and totally disabled. PDF p. 41: check both (5)(a) and (5)(b) when the child
 * lived with you in the United States for more than half of 2025. The quoted year is 2025; the draft form asks the
 * same questions for 2026. 26 U.S.C. 152(c)(1)(B), 152(c)(3), 32(c)(3)(C).
 */
class Form1040DependentColumnsTy2026Test {

    static final String UNO = "/familyAndHousehold/#60c874b4-bb7b-4c82-8550-5555b2b585f8/";
    static final String DUO = "/familyAndHousehold/#93e7961f-dd7b-4c7f-9430-bb597123935f/";
    static final String TABLE = "topmostSubform[0].Page1[0].Table_Dependents[0].";

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

    /**
     * Uno lived in the U.S. all year and is a full-time student. Duo lived with the filer, not recorded as in the
     * U.S., and is permanently and totally disabled.
     */
    @Test
    void rowsFiveAndSixPrintLivedWithStudentAndDisabled() throws Exception {
        Map<String, FactTypeWithItem> facts = PdfKnockoutRefusalTest.familyWithSsns();
        facts.put(UNO + "fullTimeStudent", ScheduleEicTy2026PdfSmokeTest.bool(true));
        facts.put(UNO + "permanentTotalDisability", ScheduleEicTy2026PdfSmokeTest.bool(false));
        facts.put(DUO + "dateOfBirth", ScheduleEicTy2026PdfSmokeTest.day("2000-11-11"));
        facts.put(DUO + "fullTimeStudent", ScheduleEicTy2026PdfSmokeTest.bool(false));
        facts.put(DUO + "permanentTotalDisability", ScheduleEicTy2026PdfSmokeTest.bool(true));
        facts.remove(DUO + "monthsLivedWithTPInUS");

        var graph = CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
        assertBool(graph, UNO + "residencyTest", true);
        assertBool(graph, UNO + "livedWithTpInUsMostOfYear", true);
        assertBool(graph, UNO + "fullTimeStudent", true);
        assertBool(graph, UNO + "permanentTotalDisability", false);
        assertBool(graph, DUO + "residencyTest", true);
        assertNotTrue(graph, DUO + "livedWithTpInUsMostOfYear");
        assertBool(graph, DUO + "fullTimeStudent", false);
        assertBool(graph, DUO + "permanentTotalDisability", true);

        Map<String, String> v = fill(facts);
        assertEquals("Uno", text(v, "Row1[0].f1_31[0]"));
        assertEquals("Duo", text(v, "Row1[0].f1_32[0]"));
        assertEquals("", text(v, "Row1[0].f1_33[0]"));
        assertEquals("", text(v, "Row1[0].f1_34[0]"));

        assertChecked(v, "Row5[0].Dependent1[0].c1_14[0]", true); // (5)(a)
        assertChecked(v, "Row5[0].Dependent1[0].c1_15[0]", true); // (5)(b)
        assertChecked(v, "Row6[0].Dependent1[0].c1_22[0]", true); // full-time student
        assertChecked(v, "Row6[0].Dependent1[0].c1_23[0]", false);

        assertChecked(v, "Row5[0].Dependent2[0].c1_16[0]", true); // lived with you, (5)(a)
        assertChecked(v, "Row5[0].Dependent2[0].c1_17[0]", false); // not in the U.S.
        assertChecked(v, "Row6[0].Dependent2[0].c1_24[0]", false);
        assertChecked(v, "Row6[0].Dependent2[0].c1_25[0]", true); // disabled

        for (String box : List.of(
                "Row5[0].Dependent3[0].c1_18[0]",
                "Row5[0].Dependent3[0].c1_19[0]",
                "Row5[0].Dependent4[0].c1_20[0]",
                "Row5[0].Dependent4[0].c1_21[0]",
                "Row6[0].Dependent3[0].c1_26[0]",
                "Row6[0].Dependent3[0].c1_27[0]",
                "Row6[0].Dependent4[0].c1_28[0]",
                "Row6[0].Dependent4[0].c1_29[0]")) {
            assertChecked(v, box, false);
        }
        // Row (7) is unchanged: Uno (born 2016) is the child tax credit; Duo is not under 17.
        assertChecked(v, "Row7[0].Dependent1[0].c1_30[0]", true);
        assertChecked(v, "Row7[0].Dependent1[0].c1_30[1]", false);
    }

    /**
     * PDF p. 17 checks (5)(a) only when the child lived with you more than half the year. A biological child who lived
     * with the filer for less than six months fails the qualifying-child residency test (26 U.S.C. 152(c)(1)(B)) and
     * can still be a claimed qualifying relative when the relationship, gross-income, and support tests are met. Twelve
     * months in the U.S. does not check (5)(b) unless (5)(a) is also met (p. 41: check both boxes).
     */
    @Test
    void rowFiveStaysBlankWhenTheChildDidNotLiveWithYou() throws Exception {
        Map<String, FactTypeWithItem> facts = PdfKnockoutRefusalTest.familyWithSsns();
        facts.put(DUO + "residencyDuration", residency("lessThanSixMonths"));
        facts.put(DUO + "monthsLivedWithTPInUS", months("twelve"));
        facts.put(DUO + "grossIncomeTest", ScheduleEicTy2026PdfSmokeTest.bool(true));
        facts.put(DUO + "writableQrSupportTest", ScheduleEicTy2026PdfSmokeTest.bool(true));
        facts.put(DUO + "fullTimeStudent", ScheduleEicTy2026PdfSmokeTest.bool(false));
        facts.put(DUO + "permanentTotalDisability", ScheduleEicTy2026PdfSmokeTest.bool(false));

        var graph = CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
        assertBool(graph, DUO + "residencyTest", false);
        assertBool(graph, DUO + "qualifyingChild", false);
        assertBool(graph, DUO + "qualifyingRelative", true);
        assertBool(graph, DUO + "isClaimedDependent", true);
        assertNotTrue(graph, DUO + "livedWithTpInUsMostOfYear");

        Map<String, String> v = fill(facts);
        assertEquals("Duo", text(v, "Row1[0].f1_32[0]"), "claimed qualifying relative still prints");
        assertChecked(v, "Row5[0].Dependent2[0].c1_16[0]", false);
        assertChecked(v, "Row5[0].Dependent2[0].c1_17[0]", false);
        assertChecked(v, "Row6[0].Dependent2[0].c1_24[0]", false);
        assertChecked(v, "Row6[0].Dependent2[0].c1_25[0]", false);
        // Uno, who did live in the U.S. all year, is unchanged.
        assertChecked(v, "Row5[0].Dependent1[0].c1_14[0]", true);
        assertChecked(v, "Row5[0].Dependent1[0].c1_15[0]", true);
    }

    /** Each new checkbox's tooltip is the row the map fills. The additional-dependents statement is not mapped here. */
    @Test
    void checkboxTooltipsNameRowsFiveAndSix() throws Exception {
        String config = new String(
                new ClassPathResource("pdf/2026/IRS1040/en/configuration.yml").getContentAsByteArray(),
                StandardCharsets.UTF_8);
        assertTrue(config.contains("482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a"));
        assertTrue(config.contains("PDF p. 17"));
        assertTrue(config.contains("PDF p. 41"));
        assertFalse(config.contains("DEPENDENTS_STATEMENT"));
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("c1_14[0]", "(5) Check if lived with you more than half of 2026. Column: Dependent 1. (a) Yes");
        expected.put("c1_15[0]", "(5) Check if lived with you more than half of 2026. Column: Dependent 1. (b) And in the U.S.");
        expected.put("c1_16[0]", "Column: Dependent 2. (a) Yes");
        expected.put("c1_17[0]", "Column: Dependent 2. (b) And in the U.S.");
        expected.put("c1_18[0]", "Column: Dependent 3. (a) Yes");
        expected.put("c1_19[0]", "Column: Dependent 3. (b) And in the U.S.");
        expected.put("c1_20[0]", "Column: Dependent 4. (a) Yes");
        expected.put("c1_21[0]", "Column: Dependent 4. (b) And in the U.S.");
        expected.put("c1_22[0]", "Column: Dependent 1. Full-time student");
        expected.put("c1_23[0]", "Column: Dependent 1. Permanently and totally disabled");
        expected.put("c1_24[0]", "Column: Dependent 2. Full-time student");
        expected.put("c1_25[0]", "Column: Dependent 2. Permanently and totally disabled");
        expected.put("c1_26[0]", "Column: Dependent 3. Full-time student");
        expected.put("c1_27[0]", "Column: Dependent 3. Permanently and totally disabled");
        expected.put("c1_28[0]", "Column: Dependent 4. Full-time student");
        expected.put("c1_29[0]", "Column: Dependent 4. Permanently and totally disabled");
        try (PDDocument doc = Loader.loadPDF(
                new ClassPathResource("pdf/2026/IRS1040/en/f1040--dft.pdf").getContentAsByteArray())) {
            Map<String, PDField> byShort = new LinkedHashMap<>();
            for (PDField field : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                String name = field.getFullyQualifiedName();
                int dot = name.lastIndexOf('.');
                byShort.put(dot < 0 ? name : name.substring(dot + 1), field);
            }
            for (var e : expected.entrySet()) {
                assertTrue(config.contains(e.getKey() + ":"), e.getKey() + " is mapped");
                PDField field = byShort.get(e.getKey());
                assertTrue(field != null, e.getKey());
                String tip = field.getAlternateFieldName().replaceAll("\\s+", " ");
                assertTrue(tip.contains(e.getValue()), e.getKey() + " tooltip: " + tip);
            }
        }
    }

    static Map<String, String> fill(Map<String, FactTypeWithItem> typed) throws Exception {
        var blank = lookup.getBlankPdfStream("2026", "IRS1040", "en");
        PdfConfiguration config = blank.getConfig();
        Set<String> paths = config.getFactPathsForPdf().stream()
                .filter(path -> !FactEvaluationResult.isPseudoPath(path))
                .map(FactEvaluationResult::collectionIndexToWildcard)
                .collect(Collectors.toSet());
        var fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        FactEvaluationResult facts = fgs.extractFacts(paths, fgs.getGraph(typed));
        List<PDDocument> docs =
                new Irs1040PdfForm("IRS1040").generateDocuments(facts, blank.getBlankPDF().readAllBytes(), config, PdfLanguages.EN);
        assertEquals(1, docs.size());
        try (PDDocument doc = docs.get(0)) {
            Map<String, String> m = new LinkedHashMap<>();
            for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                if (f instanceof PDCheckBox cb) {
                    m.put(f.getFullyQualifiedName(), cb.isChecked() ? "X" : "");
                } else if (f.getValueAsString() != null && !f.getValueAsString().isEmpty()) {
                    m.put(f.getFullyQualifiedName(), f.getValueAsString());
                }
            }
            return m;
        }
    }

    static String text(Map<String, String> v, String suffix) {
        return v.getOrDefault(TABLE + suffix, "");
    }

    static void assertChecked(Map<String, String> v, String suffix, boolean checked) {
        assertEquals(checked ? "X" : "", text(v, suffix), suffix);
    }

    static void assertBool(gov.irs.factgraph.Graph graph, String path, boolean expected) {
        var r = graph.get(path);
        assertTrue(r.complete(), path);
        assertEquals(expected, r.get(), path);
    }

    static void assertNotTrue(gov.irs.factgraph.Graph graph, String path) {
        var r = graph.get(path);
        assertFalse(r.complete() && Boolean.TRUE.equals(r.get()), path + " must not be true");
    }

    static FactTypeWithItem residency(String value) throws Exception {
        return ScheduleEicTy2026PdfSmokeTest.fact(
                "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                        + "\"],\"enumOptionsPath\":\"/residencyDurationOptions\"}}");
    }

    static FactTypeWithItem months(String value) throws Exception {
        return ScheduleEicTy2026PdfSmokeTest.fact(
                "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                        + "\"],\"enumOptionsPath\":\"/monthsLivedWithTPInUSOptions\"}}");
    }
}
