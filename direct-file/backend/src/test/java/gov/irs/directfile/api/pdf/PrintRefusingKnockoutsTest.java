package gov.irs.directfile.api.pdf;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import scala.Option;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

import gov.irs.directfile.api.loaders.domain.TaxFact;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;

/** The shared list of knockouts that stop the printed package, and which paths refuse the print. */
class PrintRefusingKnockoutsTest {
    static final String CODE_Q_KNOCKOUT = "/flowKnockoutForm8949CodeQ";
    static final String SCHEDULE_EIC_KNOCKOUT = "/flowKnockoutScheduleEicWithoutTy2026Template";
    static final String PA_NRH_KNOCKOUT = "/flowKnockoutPaNonresidentPaSourcePay";
    static final String FORM_2210_KNOCKOUT = "/flowKnockoutForm2210";
    static final String FORM_8962_TEMPLATE_KNOCKOUT = "/flowKnockoutForm8962WithoutTy2026Template";
    static final List<String> PTC_KNOCKOUTS = List.of(
            FORM_8962_TEMPLATE_KNOCKOUT,
            "/flowKnockoutPtcAllocationOfPolicyAmounts",
            "/flowKnockoutPtcAlternativeCalculationForYearOfMarriage",
            "/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl",
            "/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod",
            "/flowKnockoutPtcSelfEmployedHealthInsurance");
    static final int FORM_8962_SCENARIO_COUNT = 7;
    /** Negative modified AGI, so Form 8962 line 5 is under 100%. */
    static final String PTC_BELOW_100_SCENARIO = "ptc-no-aptc-negative-magi.json";
    /** A return without a Form 1095-A. */
    static final String PTC_NONE_SCENARIO = "form2210-mfj-irs-will-bill.json";
    /** A return with one Form 1095-A that Form 8962 here computes. */
    static final String PTC_SCENARIO = "ptc-annual-amounts-rounding.json";
    /** Lines 4 and 7 are $1,000 or more and every Part II answer is no, so the IRS figures any penalty. */
    static final String FORM_2210_SCENARIO = "form2210-mfj-irs-will-bill.json";

    static final String SECRET = "value 123-45-6789";

    static Result<Object> complete(Object v) {
        return Result.apply(v, true);
    }

    static Result<Object> placeholder(Object v) {
        return Result.apply(v, false);
    }

    static Result<Object> incomplete() {
        return Result.apply(Option.empty());
    }

    static Function<String, Result<Object>> evaluator(Map<String, Result<Object>> results) {
        return path -> {
            if ("/throws".equals(path)) {
                throw new IllegalStateException(SECRET);
            }
            return results.get(path);
        };
    }

    @Test
    void listHoldsTheCodeQScheduleEicPaScheduleNrhForm2210AndForm8962Knockouts() {
        List<String> expected = new java.util.ArrayList<>(List.of(
                CODE_Q_KNOCKOUT, // Form 8949 code Q
                SCHEDULE_EIC_KNOCKOUT, // Schedule EIC has no TY2026 template
                PA_NRH_KNOCKOUT, // PA Schedule NRH
                FORM_2210_KNOCKOUT)); // Form 2210 Part II box B, C, D, A or E
        expected.addAll(PTC_KNOCKOUTS); // Form 8962 cases not computed
        assertEquals(expected, PrintRefusingKnockouts.FACT_PATHS);
        assertThrows(UnsupportedOperationException.class, () -> PrintRefusingKnockouts.FACT_PATHS.add("/x"));
        assertEquals(
                PrintRefusingKnockouts.FACT_PATHS.size(),
                new HashSet<>(PrintRefusingKnockouts.FACT_PATHS).size(),
                "no duplicates");
    }

    @Test
    void everyEntryIsAKnockoutCoveredByFlowIsKnockedOut() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Set<String> blocking = new HashSet<>();
        for (TaxFact f : fgs.getDigest().getSubmissionBlockingFacts()) {
            blocking.add(f.path());
        }
        Set<String> topLevel = fgs.getDigest().getSubmissionBlockingFactsRequiringValue();
        for (String path : PrintRefusingKnockouts.FACT_PATHS) {
            assertTrue(blocking.contains(path), path + " is a <BlockSubmissionOnTrue /> fact");
            assertFalse(topLevel.contains(path), path + " is covered by /flowIsKnockedOut, not top-level");
        }
    }

    static List<String> refusing(String path, Result<Object> result) {
        Map<String, Result<Object>> results = new HashMap<>();
        results.put(path, result);
        return PrintRefusingKnockouts.refusingPaths(List.of(path), evaluator(results));
    }

    @Test
    void completeFalseIsTheOnlyValueThatPrints() {
        assertEquals(List.of(), refusing("/k", complete(false)));
    }

    @Test
    void completeTrueRefuses() {
        assertEquals(List.of("/k"), refusing("/k", complete(true)));
    }

    @Test
    void placeholderTrueRefuses() {
        assertEquals(List.of("/k"), refusing("/k", placeholder(true)));
    }

    @Test
    void placeholderFalseRefuses() {
        assertEquals(List.of("/k"), refusing("/k", placeholder(false)));
    }

    @Test
    void incompleteRefuses() {
        assertEquals(List.of("/k"), refusing("/k", incomplete()));
    }

    @Test
    void missingRefuses() throws Exception {
        assertEquals(List.of("/k"), refusing("/k", null));
        Graph golden = CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(SubmissionBlockingFactsTest.golden());
        assertEquals(
                List.of("/noSuchKnockout"),
                PrintRefusingKnockouts.refusingPaths(List.of("/noSuchKnockout"), path -> golden.get(path)));
    }

    @Test
    void erroredRefusesAndLogsOnlyThePath() {
        Logger logger = (Logger) LoggerFactory.getLogger(PrintRefusingKnockouts.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertEquals(List.of("/throws"), refusing("/throws", complete(false)));
        } finally {
            logger.detachAppender(appender);
        }
        assertEquals(1, appender.list.size());
        ILoggingEvent event = appender.list.get(0);
        assertEquals(Level.WARN, event.getLevel());
        assertEquals("Print-refusing knockout /throws could not be evaluated", event.getFormattedMessage());
        assertArrayEquals(new Object[] {"/throws"}, event.getArgumentArray());
        assertNull(event.getThrowableProxy(), "no stack trace");
        assertFalse(event.getFormattedMessage().contains(SECRET), "no exception message");
        assertFalse(event.getFormattedMessage().contains("IllegalStateException"), "no exception class");
    }

    @Test
    void returnsEveryRefusingPathInListOrder() {
        List<String> paths = List.of("/a", "/b", "/c", "/d", "/e", "/throws", "/missing", "/f");
        Map<String, Result<Object>> results = Map.of(
                "/a", complete(true),
                "/b", complete(false),
                "/c", placeholder(true),
                "/d", incomplete(),
                "/e", placeholder(false),
                "/f", complete(false));
        assertEquals(
                List.of("/a", "/c", "/d", "/e", "/throws", "/missing"),
                PrintRefusingKnockouts.refusingPaths(paths, evaluator(results)));
    }

    /**
     * Form 2210 (2026) draft, p. 1: "If box B, C, or D applies, you must figure your penalty and file Form 2210." With
     * no Form 2210 template, a Part II box answered yes refuses the print; with every answer no, the return prints.
     */
    @Test
    void form2210PartIIYesRefusesThePrint() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(FORM_2210_SCENARIO);
        Graph allNo = fgs.getGraph(facts);
        assertEquals(Boolean.TRUE, allNo.get("/form2210AskPartII").get(), "Part II is asked");
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(allNo), "every Part II answer is no");
        ObjectMapper mapper = new ObjectMapper();
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        for (String box :
                List.of("/form2210WaiverRequested", "/form2210AnnualizedIncome", "/form2210WithholdingOnActualDates")) {
            Map<String, FactTypeWithItem> withYes = new HashMap<>(facts);
            withYes.put(box, yes);
            assertEquals(List.of(FORM_2210_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(fgs.getGraph(withYes)), box);
        }
    }

    static Map<String, FactTypeWithItem> scenarioFacts(ObjectMapper mapper, String name) throws Exception {
        JsonNode root = mapper.readTree(new PathMatchingResourcePatternResolver()
                .getResource("classpath:scenarios/" + name)
                .getInputStream());
        return mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
    }

    /**
     * A Form 1095-A return is refused by the Form 8962 template knockout alone; a "yes" to the income-based special
     * enrollment period question (26 U.S.C. 36B(c)(3)(A)(iii)) adds its own stop. Without Form 8962 every one is
     * complete and false.
     */
    @Test
    void form8962StopsRefuseThePrint() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> facts = scenarioFacts(mapper, PTC_SCENARIO);
        Graph computed = fgs.getGraph(facts);
        assertEquals(Boolean.TRUE, computed.get("/needsToFileForm8962").get(), "the scenario files Form 8962");
        assertEquals(List.of(FORM_8962_TEMPLATE_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(computed));
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> answered = new HashMap<>(facts);
        answered.put("/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod", yes);
        Graph graph = fgs.getGraph(answered);
        assertEquals(
                List.of(FORM_8962_TEMPLATE_KNOCKOUT, "/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod"),
                PrintRefusingKnockouts.refusingPaths(graph));

        Map<String, FactTypeWithItem> w2Only = scenarioFacts(mapper, PTC_NONE_SCENARIO);
        Graph none = fgs.getGraph(w2Only);
        for (String path : PTC_KNOCKOUTS) {
            Result<Object> r = none.get(path);
            assertTrue(r.complete() && Boolean.FALSE.equals(r.get()), path + " complete false without Form 8962");
        }
    }

    @Test
    void returnsNothingWhenEveryKnockoutIsCompleteAndFalse() {
        Map<String, Result<Object>> results = Map.of("/a", complete(false), "/b", complete(false));
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(List.of("/a", "/b"), evaluator(results)));
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(List.of(), evaluator(results)));
    }

    /**
     * Every backend scenario prints unless it has Schedule EIC or Form 8962 (no TY2026 template). {@link
     * #PTC_BELOW_100_SCENARIO} also has household income under 100% of the poverty line, which 26 U.S.C. 36B(c)(1)(A)
     * requires and Form 8962 here does not cover. None has a Form 8949 code Q row or a PA/FL part-year
     * return, and each knockout is complete in each, including the two that stop before the EIC questions, so
     * fail-closed refuses no clean return. The code Q refusal through the real print path is
     * ScheduleDForm8949PdfSmokeTest#codeQReturnIsRefusedByThePrintPath.
     */
    @Test
    void everyScenarioWithoutScheduleEicOrForm8962StillPrints() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:scenarios/*.json");
        assertTrue(files.length > 100, "scenarios found: " + files.length);
        int refused = 0;
        int printed = 0;
        int form8962Refused = 0;
        for (Resource file : files) {
            JsonNode root = mapper.readTree(file.getInputStream());
            Map<String, FactTypeWithItem> facts =
                    mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
            Graph graph = fgs.getGraph(facts);
            Result<Object> schedule = graph.get("/pdfIncludeScheduleEic");
            boolean withScheduleEic = schedule.complete() && Boolean.TRUE.equals(schedule.get());
            List<String> paths = PrintRefusingKnockouts.refusingPaths(graph);
            Result<Object> form8962 = graph.get("/needsToFileForm8962");
            boolean withForm8962 = form8962.complete() && Boolean.TRUE.equals(form8962.get());
            List<String> expected = new java.util.ArrayList<>();
            if (withScheduleEic) {
                expected.add(SCHEDULE_EIC_KNOCKOUT);
            }
            if (withForm8962) {
                expected.add(FORM_8962_TEMPLATE_KNOCKOUT);
                if (PTC_BELOW_100_SCENARIO.equals(file.getFilename())) {
                    expected.add("/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl");
                }
                form8962Refused++;
            }
            assertEquals(expected, paths, file.getFilename());
            if (withScheduleEic) {
                refused++;
            }
            if (expected.isEmpty()) {
                printed++;
            }
        }
        assertEquals(50, refused, "scenarios with Schedule EIC");
        assertEquals(FORM_8962_SCENARIO_COUNT, form8962Refused, "scenarios with Form 8962");
        assertEquals(106, printed, "scenarios that print (six Form 8962 scenarios have no Schedule EIC)");
    }
}
