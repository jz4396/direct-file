package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.pdf.load.ConfiguredPdfLookup;
import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;
import gov.irs.directfile.models.FactTypeWithItem;
import gov.irs.factgraph.Graph;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #89: Form 1040 additional dependents statement. Instructions for Form 1040 (2025)
 * https://www.irs.gov/pub/irs-pdf/i1040gi.pdf SHA-256
 * 482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a, PDF p. 17: when there are more than
 * four dependents, check the box and include a statement showing the information requested in the Dependents
 * section. PDF p. 18 Step 2 and PDF p. 19 Step 4 say to complete rows (1) through (4), (5)(a), and (6). The
 * statement also carries (5)(b) and row (7), which the Dependents section requests. The first four stay on Form
 * 1040. Row (6) full-time student is /isAStudentUnder24, the same fact the form checkbox uses.
 */
class Form1040AdditionalDependentsStatementTy2026Test {

    static final String UNO_ID = "60c874b4-bb7b-4c82-8550-5555b2b585f8";
    static final String TRES_ID = "11111111-1111-4111-8111-111111111111";
    static final String QUATRO_ID = "22222222-2222-4222-8222-222222222222";
    static final String CINCO_ID = "33333333-3333-4333-8333-333333333333";
    static final String SEXTO_ID = "44444444-4444-4444-8444-444444444444";
    static final String WAGES = "/formW2s/#8c559aec-9f61-444c-8a4c-e07d522ddf4a/writableWages";

    static FactGraphService factGraphService;
    static PdfService pdfService;
    static ConfiguredPdfLookup lookup;

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
        lookup = new ConfiguredPdfLookup(new IOLocationService(null), props.getConfiguredPdfs());
        pdfService = new PdfService(props, new IOLocationService(null), factGraphService);
    }

    @Test
    void statementConfigCitesTheForm1040Instructions() throws Exception {
        String config = new String(
                new ClassPathResource("pdf/2026/DEPENDENTS_STATEMENT/en/configuration.yml").getContentAsByteArray(),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(config.contains("482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a"));
        assertTrue(config.contains("PDF p. 17"));
        assertTrue(config.contains("include a statement showing the information requested"));
        assertTrue(config.contains("PDF p. 18"));
        assertTrue(config.contains("PDF p. 19"));
        assertTrue(config.contains("../isAStudentUnder24"));
        assertFalse(config.contains("../fullTimeStudent"));
    }

    /** Two claimed dependents fit on Form 1040. The statement is not attached. */
    @Test
    void fourOrFewerDependentsDoNotPrintTheStatement() throws Exception {
        Map<String, FactTypeWithItem> facts = highWage(addCopies(PdfKnockoutRefusalTest.familyWithSsns(), 0));
        Graph graph = factGraphService.getGraph(facts);
        assertBool(graph, "/claimingMoreThan4Dependents", false);
        assertEquals(List.of(), fillStatement(facts));

        Map<String, FactTypeWithItem> four = highWage(addCopies(PdfKnockoutRefusalTest.familyWithSsns(), 2));
        Graph fourGraph = factGraphService.getGraph(four);
        assertBool(fourGraph, "/claimingMoreThan4Dependents", false);
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(fourGraph));
        Map<String, String> values = packageValues(four);
        assertTrue(values.keySet().stream().noneMatch(name -> name.contains("DEPENDENTS_STATEMENT")));
        assertFalse(checked(values, "c1_13[0]"), "more-than-four box stays unchecked");
    }

    /**
     * Dependents five and six are not on Form 1040. The statement's first row is the age-20 student who lived in the
     * United States all year. The second row is under 19: a stored full-time-student answer does not check row (6).
     */
    @Test
    void overflowDependentsPrintOnTheStatement() throws Exception {
        Map<String, FactTypeWithItem> facts = highWage(addCopies(PdfKnockoutRefusalTest.familyWithSsns(), 4));
        Graph graph = factGraphService.getGraph(facts);
        assertBool(graph, "/claimingMoreThan4Dependents", true);
        List<UUID> claimed = claimed(graph);
        assertEquals(6, claimed.size());
        assertEquals(UUID.fromString(CINCO_ID), claimed.get(4));
        assertEquals(UUID.fromString(SEXTO_ID), claimed.get(5));

        String cinco = "/familyAndHousehold/#" + CINCO_ID + "/";
        String sexto = "/familyAndHousehold/#" + SEXTO_ID + "/";
        assertBool(graph, cinco + "residencyTest", true);
        assertBool(graph, cinco + "livedWithTpInUsMostOfYear", true);
        assertBool(graph, cinco + "isAStudentUnder24", true);
        assertBool(graph, cinco + "permanentTotalDisability", false);
        assertBool(graph, sexto + "fullTimeStudent", true);
        assertBool(graph, sexto + "isAStudentUnder24", false);
        assertBool(graph, sexto + "isClaimedDependent", true);

        Map<String, String> statement = indexBySuffix(fillStatement(facts));
        assertEquals(text(graph, cinco + "fullName"), statement.get("NameRow1"));
        assertEquals(text(graph, cinco + "tin"), statement.get("SocialSecurityNumberRow1"));
        assertEquals("Child", statement.get("RelationshipToYouRow1"));
        assertEquals("yes", statement.get("LivedWithYouYesRow1"));
        assertEquals("yes", statement.get("AndInTheUsRow1"));
        assertEquals("yes", statement.get("FullTimeStudentRow1"));
        assertEquals("no", statement.get("PermanentlyAndTotallyDisabledRow1"));
        assertEquals(yesNo(graph, cinco + "isClaimedForCTC"), statement.get("ChildTaxCreditRow1"));
        assertEquals(yesNo(graph, cinco + "isClaimedForODC"), statement.get("CreditForOtherDependentsRow1"));

        assertEquals(text(graph, sexto + "fullName"), statement.get("NameRow2"));
        assertEquals("yes", statement.get("LivedWithYouYesRow2"));
        assertEquals("yes", statement.get("AndInTheUsRow2"));
        assertEquals("no", statement.get("FullTimeStudentRow2"));
        assertFalse(statement.containsKey("NameRow3"));
        assertFalse(statement.get("NameRow1").contains("Uno"));
        assertFalse(statement.get("NameRow2").contains("Uno"));

        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));
        Map<String, String> pkg = packageValues(facts);
        assertEquals(statement.get("NameRow1"), valueEnding(pkg, "NameRow1"));
        assertEquals("yes", valueEnding(pkg, "FullTimeStudentRow1"));
        assertEquals("no", valueEnding(pkg, "FullTimeStudentRow2"));
        assertEquals("yes", valueEnding(pkg, "AndInTheUsRow1"));
        assertTrue(checked(pkg, "Dependents_ReadOrder[0].c1_13[0]"), "more-than-four box is checked");
        assertEquals("Uno", valueEnding(pkg, "Table_Dependents[0].Row1[0].f1_31[0]"));
        assertEquals("Duo", valueEnding(pkg, "Table_Dependents[0].Row1[0].f1_32[0]"));
        assertEquals("Tres", valueEnding(pkg, "Table_Dependents[0].Row1[0].f1_33[0]"));
        assertEquals("Quatro", valueEnding(pkg, "Table_Dependents[0].Row1[0].f1_34[0]"));
        assertTrue(
                pkg.entrySet().stream()
                        .filter(e -> e.getKey().contains("Table_Dependents[0]"))
                        .noneMatch(e -> e.getValue().equals("Cinco") || e.getValue().equals("Sexto")),
                "overflow dependents stay off the four Form 1040 columns");
        Ty2026SpanishTemplateRefusalTest.assertSpanishPrintRefused(
                pdfService, PdfKnockoutRefusalTest.taxReturn(facts));
    }

    /** {@code extra} clones of Uno appended after the two children already in the family scenario. */
    static Map<String, FactTypeWithItem> addCopies(Map<String, FactTypeWithItem> facts, int extra) throws Exception {
        String[] ids = {TRES_ID, QUATRO_ID, CINCO_ID, SEXTO_ID};
        String[] names = {"Tres", "Quatro", "Cinco", "Sexto"};
        for (int i = 0; i < extra; i++) {
            clonePerson(facts, UNO_ID, ids[i]);
            String p = "/familyAndHousehold/#" + ids[i] + "/";
            facts.put(p + "firstName", ScheduleEicTy2026PdfSmokeTest.fact(string(names[i])));
            facts.put(
                    p + "tin",
                    ScheduleEicTy2026PdfSmokeTest.fact(PaPit40ScheduleSpTy2026PdfSmokeTest.tin(
                            "444", "00", String.valueOf(i + 3).repeat(4))));
            appendToCollection(facts, ids[i]);
        }
        if (extra >= 3) {
            String p = "/familyAndHousehold/#" + CINCO_ID + "/";
            facts.put(p + "dateOfBirth", ScheduleEicTy2026PdfSmokeTest.day("2006-06-15"));
            facts.put(p + "fullTimeStudent", ScheduleEicTy2026PdfSmokeTest.bool(true));
            facts.put(p + "permanentTotalDisability", ScheduleEicTy2026PdfSmokeTest.bool(false));
        }
        if (extra >= 4) {
            String p = "/familyAndHousehold/#" + SEXTO_ID + "/";
            facts.put(p + "fullTimeStudent", ScheduleEicTy2026PdfSmokeTest.bool(true));
            facts.put(p + "permanentTotalDisability", ScheduleEicTy2026PdfSmokeTest.bool(false));
        }
        return facts;
    }

    /** Wages above the earned income credit limit, so Schedule EIC does not refuse the print. */
    static Map<String, FactTypeWithItem> highWage(Map<String, FactTypeWithItem> facts) throws Exception {
        facts.put(
                WAGES,
                ScheduleEicTy2026PdfSmokeTest.fact(
                        "{\"$type\":\"gov.irs.factgraph.persisters.DollarWrapper\",\"item\":\"180000.00\"}"));
        return facts;
    }

    static void clonePerson(Map<String, FactTypeWithItem> facts, String srcId, String newId) {
        String src = "/familyAndHousehold/#" + srcId + "/";
        String dst = "/familyAndHousehold/#" + newId + "/";
        Map<String, FactTypeWithItem> add = new LinkedHashMap<>();
        for (var e : facts.entrySet()) {
            if (e.getKey().startsWith(src)) {
                add.put(dst + e.getKey().substring(src.length()), e.getValue());
            }
        }
        facts.putAll(add);
    }

    static void appendToCollection(Map<String, FactTypeWithItem> facts, String id) {
        FactTypeWithItem collection = facts.get("/familyAndHousehold");
        ObjectNode item = (ObjectNode) collection.item().deepCopy();
        ((ArrayNode) item.get("items")).add(id);
        facts.put("/familyAndHousehold", new FactTypeWithItem(collection.type(), item));
    }

    static List<String> fillStatement(Map<String, FactTypeWithItem> typed) throws Exception {
        var blank = lookup.getBlankPdfStream("2026", "DEPENDENTS_STATEMENT", "en");
        PdfConfiguration config = blank.getConfig();
        Set<String> paths = config.getFactPathsForPdf().stream()
                .filter(path -> !FactEvaluationResult.isPseudoPath(path))
                .map(FactEvaluationResult::collectionIndexToWildcard)
                .collect(Collectors.toSet());
        FactEvaluationResult facts = factGraphService.extractFacts(paths, factGraphService.getGraph(typed));
        List<PDDocument> docs = new PdfTable("DEPENDENTS_STATEMENT")
                .generateDocuments(facts, blank.getBlankPDF().readAllBytes(), config, PdfLanguages.EN);
        List<String> values = new ArrayList<>();
        for (PDDocument doc : docs) {
            try (PDDocument open = doc) {
                for (PDField f : open.getDocumentCatalog().getAcroForm().getFieldTree()) {
                    if (f.getValueAsString() != null && !f.getValueAsString().isEmpty()) {
                        values.add(f.getFullyQualifiedName() + "=" + f.getValueAsString());
                    }
                }
            }
        }
        return values;
    }

    static Map<String, String> packageValues(Map<String, FactTypeWithItem> facts) throws Exception {
        try (InputStream in = pdfService.getTaxReturn("en", PdfKnockoutRefusalTest.taxReturn(facts), false);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            Map<String, String> values = new LinkedHashMap<>();
            for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                if (f instanceof PDCheckBox cb) {
                    values.put(f.getFullyQualifiedName(), cb.isChecked() ? "X" : "");
                } else if (f.getValueAsString() != null && !f.getValueAsString().isEmpty()) {
                    values.put(f.getFullyQualifiedName(), f.getValueAsString());
                }
            }
            return values;
        }
    }

    static Map<String, String> indexBySuffix(List<String> pairs) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String pair : pairs) {
            int eq = pair.indexOf('=');
            String name = pair.substring(0, eq);
            out.put(name.substring(name.lastIndexOf('_') + 1), pair.substring(eq + 1));
        }
        return out;
    }

    static String valueEnding(Map<String, String> values, String suffix) {
        String found = null;
        for (var e : values.entrySet()) {
            if (e.getKey().endsWith(suffix) && !e.getValue().isEmpty()) {
                assertTrue(found == null, "one value for " + suffix + " but also " + found);
                found = e.getValue();
            }
        }
        assertTrue(found != null, suffix);
        return found;
    }

    static boolean checked(Map<String, String> values, String suffix) {
        boolean seen = false;
        boolean on = false;
        for (var e : values.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                seen = true;
                on = "X".equals(e.getValue());
            }
        }
        assertTrue(seen, suffix);
        return on;
    }

    static List<UUID> claimed(Graph graph) {
        var r = graph.get("/claimedDependentsCollection");
        assertTrue(r.complete());
        var items = ((gov.irs.factgraph.types.Collection) r.get()).items();
        List<UUID> out = new ArrayList<>(items.length());
        for (int i = 0; i < items.length(); i++) {
            out.add(items.apply(i));
        }
        return out;
    }

    static void assertBool(Graph graph, String path, boolean expected) {
        var r = graph.get(path);
        assertTrue(r.complete(), path);
        assertEquals(expected, r.get(), path);
    }

    static String text(Graph graph, String path) {
        var r = graph.get(path);
        assertTrue(r.complete(), path);
        return r.get().toString();
    }

    static String yesNo(Graph graph, String path) {
        var r = graph.get(path);
        assertTrue(r.complete(), path);
        return Boolean.TRUE.equals(r.get()) ? "yes" : "no";
    }

    static String string(String value) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.StringWrapper\",\"item\":\"" + value + "\"}";
    }
}
