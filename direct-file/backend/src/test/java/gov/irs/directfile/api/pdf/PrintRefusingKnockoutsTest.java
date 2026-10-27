package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import scala.Option;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.loaders.domain.TaxFact;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;

/** The shared list of knockouts that stop the printed package, and which paths refuse the print. */
class PrintRefusingKnockoutsTest {
    static final String CODE_Q_KNOCKOUT = "/flowKnockoutForm8949CodeQ";
    static final String SCHEDULE_EIC_KNOCKOUT = "/flowKnockoutScheduleEicWithoutTy2026Template";
    static final String PA_NRH_KNOCKOUT = "/flowKnockoutPaNonresidentPaSourcePay";
    static final String PA_UE_KNOCKOUT = "/flowKnockoutPaUnreimbursedEmployeeExpenses";
    static final String PA_DIVIDENDS_KNOCKOUT = "/flowKnockoutPaDividends";
    static final String PA_UNSUPPORTED_ITEMS_KNOCKOUT = "/flowKnockoutPaUnsupportedItems";
    static final String PA_UNSUPPORTED_INCOME_KNOCKOUT = "/flowKnockoutPaUnsupportedIncome";
    static final String PA_SP_KNOCKOUT = "/flowKnockoutPaSpUnsupported";
    static final String PA_PART_YEAR_KNOCKOUT = "/flowKnockoutPaPartYear";
    static final String PA_SCHEDULE_A_KNOCKOUT = "/flowKnockoutPaScheduleA";
    static final String PA_SCHEDULE_B_KNOCKOUT = "/flowKnockoutPaScheduleB";
    static final String PA_SCHEDULE_D_KNOCKOUT = "/flowKnockoutPaScheduleD";
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
    static final String SEP_KNOCKOUT = "/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod";

    static final String SEP_ANSWER = "/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod";
    static final String PTC_SCENARIO = "ptc-annual-amounts-rounding.json";

    static final String SCHEDULE_E_QBI_KNOCKOUT = "/flowKnockoutScheduleETradeOrBusinessQbi";
    static final String SCHEDULE_E_PART_II_KNOCKOUT = "/flowKnockoutScheduleEPartII";
    static final String QBI_ABOVE_THRESHOLD_KNOCKOUT = "/flowKnockoutQbiAboveThreshold";
    static final String QBI_CARRYFORWARD_KNOCKOUT = "/flowKnockoutQbiPriorYearCarryforward";
    static final String QBI_COOPERATIVE_KNOCKOUT = "/flowKnockoutQbiCooperativePatron";
    static final String QBI_MIXED_PARTICIPATION_KNOCKOUT = "/flowKnockoutQbiMixedParticipation";
    static final String SCHEDULE_C_QBI_KNOCKOUT = "/flowKnockoutScheduleCQbi";
    static final String SCHEDULE_C_OUT_OF_SCOPE_KNOCKOUT = "/flowKnockoutScheduleCOutOfScope";
    static final String FORM_8995_KNOCKOUT = "/flowKnockoutForm8995WithoutTy2026Template";
    /** Form 6251 lines 2c-2t, 3 and 8 are not computed (26 U.S.C. 55(b)(2), 56, 57). */
    static final String AMT_PREFERENCE_KNOCKOUT = "/flowKnockoutAmtPreferenceItems";
    /**
     * Same lines when Form 6251 is required and /hasAmtPreferenceItems is not a complete answer. The yes knockout is
     * complete false in that case.
     */
    static final String AMT_PREFERENCE_UNANSWERED_KNOCKOUT = "/flowKnockoutAmtPreferenceItemsUnanswered";
    /** 26 U.S.C. 55(d)(2) last sentence: MFS AMTI add-back above the $640,200 complete phaseout. */
    static final String AMT_MFS_ADD_BACK_KNOCKOUT = "/flowKnockoutAmtMfsAddBack";
    /**
     * #87: the knockout that waits only on Form 8995, which still has no TY2026 template. Schedule C and Schedule 3-A
     * are pinned (#239), so they are no longer in this list. The field-map tests for a Schedule C return fill their
     * forms with Form 8995 left out of the refusal check (see {@link #FIELD_MAP_CHECKS}); the public print path still
     * refuses a return that must attach Form 8995.
     */
    static final List<String> TEMPLATE_PENDING = List.of(FORM_8995_KNOCKOUT);
    /** {@link PrintRefusingKnockouts#FACT_PATHS} without {@link #TEMPLATE_PENDING}. */
    static final List<String> FIELD_MAP_CHECKS = PrintRefusingKnockouts.FACT_PATHS.stream()
            .filter(p -> !TEMPLATE_PENDING.contains(p))
            .toList();
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
    void listHoldsThePrintRefusingKnockoutsIncludingTheForm6251Stops() {
        List<String> expected = new ArrayList<>(List.of(
                CODE_Q_KNOCKOUT, // Form 8949 code Q
                SCHEDULE_EIC_KNOCKOUT, // Schedule EIC has no TY2026 template
                PA_NRH_KNOCKOUT, // PA Schedule NRH
                PA_UE_KNOCKOUT, // PA-40 line 1b / Schedule UE
                PA_DIVIDENDS_KNOCKOUT, // PA-40 line 3 / Schedule B adjustments
                PA_UNSUPPORTED_ITEMS_KNOCKOUT, // PA-40 lines 7, 8, 10, 14-16, 22, 23, 25
                PA_UNSUPPORTED_INCOME_KNOCKOUT, // PA-40 lines 4 and 6 and unclassified income
                PA_SP_KNOCKOUT, // Schedule SP Tax Forgiveness
                PA_PART_YEAR_KNOCKOUT, // PA/FL part-year cases not computed
                PA_SCHEDULE_A_KNOCKOUT, // PA Schedule A
                PA_SCHEDULE_B_KNOCKOUT, // PA Schedule B
                PA_SCHEDULE_D_KNOCKOUT, // PA Schedule D
                FORM_2210_KNOCKOUT)); // Form 2210 Part II box B, C, D, A or E
        expected.addAll(PTC_KNOCKOUTS); // Form 8962 cases not computed
        expected.addAll(List.of(
                SCHEDULE_E_QBI_KNOCKOUT, // Schedule E rental treated as a trade or business (line 13b)
                SCHEDULE_E_PART_II_KNOCKOUT, // Schedule E Parts II-III and Schedule SE K-1 box 14 code A
                QBI_ABOVE_THRESHOLD_KNOCKOUT, // Form 8995-A
                QBI_CARRYFORWARD_KNOCKOUT, // prior-year QBI loss carryforward
                QBI_COOPERATIVE_KNOCKOUT, // cooperative patron
                QBI_MIXED_PARTICIPATION_KNOCKOUT, // active and non-active businesses
                SCHEDULE_C_QBI_KNOCKOUT, // any of the four Form 8995 stops with Schedule C income
                SCHEDULE_C_OUT_OF_SCOPE_KNOCKOUT, // Schedule C line that needs a form or loss limit not computed here
                FORM_8995_KNOCKOUT, // Form 8995 is attached and has no TY2026 template or MeF mapping
                AMT_PREFERENCE_KNOCKOUT, // Form 6251 lines 2c-2t, 3 and 8
                AMT_PREFERENCE_UNANSWERED_KNOCKOUT, // required Form 6251, preference question not complete
                AMT_MFS_ADD_BACK_KNOCKOUT)); // MFS AMTI over $640,200, add-back not computed
        assertEquals(expected, PrintRefusingKnockouts.FACT_PATHS);
        // #123 adds the PA-40 and Schedule SP stops besides NRH. #89 adds the Form 6251 stops, including the
        // unanswered preference question when the form is required. #246 adds /flowKnockoutScheduleEPartII.
        // #239 drops the Schedule C and Schedule 3-A template knockouts.
        assertEquals(31, PrintRefusingKnockouts.FACT_PATHS.size(), "FACT_PATHS entries");
        assertEquals(PrintRefusingKnockouts.FACT_PATHS.size() - TEMPLATE_PENDING.size(), FIELD_MAP_CHECKS.size());
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
        // The scenario leaves the income-based special enrollment period question unanswered, so the stop fails
        // closed: true and complete, blocking submission and the print (26 U.S.C. 36B(c)(3)(A)(iii)).
        assertFalse(computed.get(SEP_ANSWER).complete(), "the scenario leaves the question unanswered");
        assertTrue(computed.get(SEP_KNOCKOUT).complete());
        assertEquals(Boolean.TRUE, computed.get(SEP_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, computed.get("/flowIsKnockedOut").get(), "submission is blocked too");
        assertEquals(
                List.of(FORM_8962_TEMPLATE_KNOCKOUT, SEP_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(computed));
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        FactTypeWithItem no = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> answeredYes = new HashMap<>(facts);
        answeredYes.put(SEP_ANSWER, yes);
        assertEquals(
                List.of(FORM_8962_TEMPLATE_KNOCKOUT, SEP_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(answeredYes)));
        // Only a "no" clears it; the template stop remains.
        Map<String, FactTypeWithItem> answeredNo = new HashMap<>(facts);
        answeredNo.put(SEP_ANSWER, no);
        Graph cleared = fgs.getGraph(answeredNo);
        assertEquals(Boolean.FALSE, cleared.get(SEP_KNOCKOUT).get());
        assertEquals(List.of(FORM_8962_TEMPLATE_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(cleared));

        Map<String, FactTypeWithItem> w2Only = scenarioFacts(mapper, PTC_NONE_SCENARIO);
        Graph none = fgs.getGraph(w2Only);
        for (String path : PTC_KNOCKOUTS) {
            Result<Object> r = none.get(path);
            assertTrue(r.complete() && Boolean.FALSE.equals(r.get()), path + " complete false without Form 8962");
        }
    }

    /**
     * A Form 1095-A return with $4,500 of advance payments whose /needsToFileForm8962 is unresolved (the dependent
     * answer or the qualifying-plan answer missing) must not print: its Schedule 2 line 1a would read $0 instead of the
     * Form 8962 line 27 excess (Form 8962 (2026) draft, PDF p. 1, line 27: "Enter the difference here and on Schedule 2
     * (Form 1040), line 1a"). The same holds for a qualifying-plan yes whose only Form 1095-A was deleted. The guard
     * /form8962NeededOrUnresolved fails closed, so the template knockout refuses.
     */
    @Test
    void unresolvedForm8962ReturnIsRefusedByThePrintPath() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        PdfService pdfService = CreditFormsTy2026PdfSmokeTest.pdfService(fgs);
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> facts = scenarioFacts(mapper, PTC_SCENARIO);
        Map<String, FactTypeWithItem> emptied = new HashMap<>(facts);
        emptied.keySet().removeIf(k -> k.startsWith("/1095As/"));
        emptied.put(
                "/1095As",
                mapper.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}",
                        FactTypeWithItem.class));
        emptied.put(
                "/1095AsIsDone",
                mapper.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}",
                        FactTypeWithItem.class));
        // The qualifying-plan answer is yes but the only Form 1095-A was deleted: /needsToFileForm8962 is a definite
        // no, and the guard still refuses.
        Map<String, Map<String, FactTypeWithItem>> cases = new LinkedHashMap<>();
        for (String missing : List.of("/canBeClaimed", "/writableHasPtcQualifyingPlan")) {
            Map<String, FactTypeWithItem> unresolved = new HashMap<>(facts);
            unresolved.keySet().removeIf(k -> k.endsWith(missing));
            assertTrue(unresolved.size() < facts.size(), missing);
            cases.put(missing, unresolved);
        }
        cases.put("empty /1095As", emptied);
        for (Map.Entry<String, Map<String, FactTypeWithItem>> c : cases.entrySet()) {
            String missing = c.getKey();
            Map<String, FactTypeWithItem> unresolved = c.getValue();
            Graph graph = fgs.getGraph(unresolved);
            Result<Object> needs = graph.get("/needsToFileForm8962");
            if (missing.startsWith("empty")) {
                assertTrue(needs.complete() && Boolean.FALSE.equals(needs.get()), missing);
            } else {
                assertFalse(needs.complete(), missing);
            }
            Result<Object> template = graph.get(FORM_8962_TEMPLATE_KNOCKOUT);
            assertTrue(template.complete() && Boolean.TRUE.equals(template.get()), missing);
            assertEquals(Boolean.TRUE, graph.get("/flowIsKnockedOut").get(), missing);
            List<String> refused = PrintRefusingKnockouts.refusingPaths(graph);
            assertTrue(refused.contains(FORM_8962_TEMPLATE_KNOCKOUT), missing + " " + refused);
            TaxReturn taxReturn = new TaxReturn();
            taxReturn.setTaxYear(2026);
            taxReturn.setFactsWithoutDirtyingEntity(unresolved);
            SubmissionBlockingFactsResponseStatusException e = assertThrows(
                    SubmissionBlockingFactsResponseStatusException.class,
                    () -> pdfService.getTaxReturn("en", taxReturn, false),
                    missing);
            assertEquals(refused, e.getBody().getProperties().get("blockingFacts"), missing);
        }
    }

    /**
     * Form 1040 (2026) draft, PDF p. 3, line 13b: "Qualified business income deduction from Form 8995 or Form 8995-A".
     * A Schedule E rental treated as a trade or business (26 CFR 1.199A-1(b)(14)) has qualified business income, and
     * line 13b is not computed yet, so a yes refuses the print; a no, or no Part I income, prints.
     */
    @Test
    void scheduleERentalTradeOrBusinessYesRefusesThePrint() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(FORM_2210_SCENARIO);
        assertFalse(
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(facts)).contains(SCHEDULE_E_QBI_KNOCKOUT),
                "no Part I income");
        ObjectMapper mapper = new ObjectMapper();
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        FactTypeWithItem no = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> withPartI = new HashMap<>(facts);
        withPartI.put("/hadScheduleEIncome", yes);
        assertTrue(
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(withPartI)).contains(SCHEDULE_E_QBI_KNOCKOUT),
                "unanswered fails closed");
        Map<String, FactTypeWithItem> answeredNo = new HashMap<>(withPartI);
        answeredNo.put("/scheduleERentalIsTradeOrBusiness", no);
        assertFalse(
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(answeredNo)).contains(SCHEDULE_E_QBI_KNOCKOUT),
                "not a trade or business");
        Map<String, FactTypeWithItem> answeredYes = new HashMap<>(withPartI);
        answeredYes.put("/scheduleERentalIsTradeOrBusiness", yes);
        Graph graph = fgs.getGraph(answeredYes);
        assertEquals(Boolean.TRUE, graph.get(SCHEDULE_E_QBI_KNOCKOUT).get());
        assertTrue(PrintRefusingKnockouts.refusingPaths(graph).contains(SCHEDULE_E_QBI_KNOCKOUT), "trade or business");
    }

    /**
     * #85. 2026 draft Instructions for Schedule E, PDF p. 11: report the partnership or S corporation share "even if
     * not received." A yes with no entity is not filed as zero: line 32 and Schedule 1 line 5 stay incomplete and the
     * knockout stays incomplete, so the print is refused. Part III (estate or trust) is out of scope and refuses with
     * the knockout true. Schedule SE line 2 stays Schedule C only. An answered no does not refuse. An unanswered
     * question refuses and leaves the Schedule E section incomplete.
     */
    @Test
    void k1WithoutPartIIncomeOmitsScheduleEAndScheduleSeLine2AndRefusesThePrint() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        FactTypeWithItem no = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}", FactTypeWithItem.class);

        Map<String, FactTypeWithItem> answeredNo = new HashMap<>(SubmissionBlockingFactsTest.golden());
        Graph noK1 = fgs.getGraph(answeredNo);
        assertTrue(noK1.get(SCHEDULE_E_PART_II_KNOCKOUT).complete(), "answered no is complete");
        assertEquals(Boolean.FALSE, noK1.get(SCHEDULE_E_PART_II_KNOCKOUT).get());
        assertFalse(PrintRefusingKnockouts.refusingPaths(noK1).contains(SCHEDULE_E_PART_II_KNOCKOUT));

        Map<String, FactTypeWithItem> k1Only = new HashMap<>(answeredNo);
        k1Only.put("/scheduleEHasPartIIIncome", yes);
        Graph k1 = fgs.getGraph(k1Only);
        assertEquals(0, new BigDecimal(k1.get("/scheduleENetIncome").get().toString()).signum(), "Part I only");
        assertFalse(k1.get("/scheduleEPartIILine32").complete(), "line 32 is not a silent zero");
        assertFalse(k1.get("/schedule1Line5").complete(), "Schedule 1 line 5 is not a silent zero");
        assertEquals(
                0,
                new BigDecimal(k1.get("/primaryFilerSeNetProfit").get().toString()).signum(),
                "Schedule SE line 2 has no box 14 code A");
        assertFalse(k1.get(SCHEDULE_E_PART_II_KNOCKOUT).complete(), "yes without details stays incomplete");
        assertFalse(k1.get("/flowIsKnockedOut").complete());
        assertEquals(List.of(SCHEDULE_E_PART_II_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(k1));

        Map<String, FactTypeWithItem> partIII = new HashMap<>(k1Only);
        partIII.put("/scheduleEHasPartIIIIncome", yes);
        Graph estate = fgs.getGraph(partIII);
        assertEquals(Boolean.TRUE, estate.get("/flowKnockoutScheduleEPartIII").get());
        assertEquals(Boolean.TRUE, estate.get(SCHEDULE_E_PART_II_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, estate.get("/flowIsKnockedOut").get());
        assertEquals(List.of(SCHEDULE_E_PART_II_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(estate));

        Map<String, FactTypeWithItem> scheduleC = scheduleCOnly();
        Graph scheduleCGraph = fgs.getGraph(scheduleC);
        BigDecimal line2 = new BigDecimal(
                scheduleCGraph.get("/primaryFilerSeNetProfit").get().toString());
        assertTrue(line2.signum() > 0, "Schedule C profit is on line 2");
        Map<String, FactTypeWithItem> scheduleCAndK1 = new HashMap<>(scheduleC);
        scheduleCAndK1.put("/hadScheduleEIncome", no);
        scheduleCAndK1.put("/scheduleEHasPartIIIncome", yes);
        Graph both = fgs.getGraph(scheduleCAndK1);
        assertEquals(
                0,
                line2.compareTo(new BigDecimal(
                        both.get("/primaryFilerSeNetProfit").get().toString())),
                "line 2 unchanged");
        assertEquals(0, new BigDecimal(both.get("/scheduleENetIncome").get().toString()).signum());
        assertFalse(both.get(SCHEDULE_E_PART_II_KNOCKOUT).complete(), "yes without a K-1 stays incomplete");
        assertTrue(PrintRefusingKnockouts.refusingPaths(both).contains(SCHEDULE_E_PART_II_KNOCKOUT));
        assertEquals(
                both.get("/selfEmploymentTax").get().toString(),
                scheduleCGraph.get("/selfEmploymentTax").get().toString(),
                "SE tax is still the Schedule C amount");

        Map<String, FactTypeWithItem> unanswered = new HashMap<>(answeredNo);
        unanswered.remove("/scheduleEHasPartIIIncome");
        Graph open = fgs.getGraph(unanswered);
        assertFalse(open.get(SCHEDULE_E_PART_II_KNOCKOUT).complete(), "unanswered stays incomplete");
        assertEquals(0, new BigDecimal(open.get("/scheduleENetIncome").get().toString()).signum(), "Part I still $0");
        assertEquals(
                0,
                new BigDecimal(open.get("/primaryFilerSeNetProfit").get().toString()).signum(),
                "line 2 still has no box 14 code A");
        assertEquals(List.of(SCHEDULE_E_PART_II_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(open));
        assertFalse(open.get("/flowIsKnockedOut").complete(), "an incomplete operand leaves /flowIsKnockedOut open");
        assertEquals(Boolean.FALSE, open.get("/scheduleESectionIsComplete").get());
        assertEquals(Boolean.TRUE, open.get("/flowIncomplete").get());
    }

    /** Single filer, one W-2 and one Schedule C business with the given gross receipts and expenses. */
    static Map<String, FactTypeWithItem> scheduleCReturn(String wages, String receipts, String expenses)
            throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        // The same base return the Schedule SE smoke test prints, plus one Schedule C business.
        Map<String, FactTypeWithItem> facts = mapper.convertValue(
                mapper.readTree(new ClassPathResource("pdf-smoke/schedule-d-8949-synthetic.json").getInputStream())
                        .get("facts"),
                new TypeReference<Map<String, FactTypeWithItem>>() {});
        Map<String, String> m = ScheduleSETy2026PdfSmokeTest.selfEmployed(wages, wages, receipts);
        m.put(
                "/scheduleCBusinesses/#" + ScheduleSETy2026PdfSmokeTest.BIZ + "/writableTotalExpenses",
                ScheduleATy2026PdfSmokeTest.dollar(expenses));
        for (var e : m.entrySet()) {
            facts.put(e.getKey(), mapper.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return facts;
    }

    /**
     * Form 8995 (2026) draft header: "Use this form if your taxable income, before your qualified business income
     * deduction, is at or below" the threshold. Instructions for Form 1040 (2025) draft (the 2026 instructions are not
     * yet posted), PDF p. 35, QBI line (13b on the 2026 Form 1040): "Attach whichever form you use (Form 8995 or
     * 8995-A) to your return." 2026 Instructions for Form 8995 draft, PDF p. 6, line 18: "This is the amount to be
     * carried forward to the next year." Form 8995 has no TY2026 template or MeF mapping, so a Schedule C return at or
     * below the threshold that Form 8995 here computes is refused, and so is a loss year that carries a line 18
     * amount forward. Schedule C itself prints (#239). A carryforward or cooperative yes, or an unanswered question,
     * also refuses through its own stop.
     */
    @Test
    void form8995StopsRefuseThePrint() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> facts = scheduleCReturn("20000.00", "30000.00", "0.00");
        Graph computed = fgs.getGraph(facts);
        assertEquals(Boolean.FALSE, computed.get(QBI_ABOVE_THRESHOLD_KNOCKOUT).get(), "at or below the threshold");
        assertTrue(computed.get(QBI_ABOVE_THRESHOLD_KNOCKOUT).complete());
        assertEquals(Boolean.TRUE, computed.get("/form8995Required").get());
        assertEquals(
                List.of(FORM_8995_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(computed), "no Form 8995 template");
        assertEquals(Boolean.TRUE, computed.get("/flowIsKnockedOut").get(), "submission is blocked too");
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> carryforward = new HashMap<>(facts);
        carryforward.put("/qbiHasPriorYearLossCarryforward", yes);
        assertEquals(
                List.of(QBI_CARRYFORWARD_KNOCKOUT, SCHEDULE_C_QBI_KNOCKOUT, FORM_8995_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(carryforward)));
        Map<String, FactTypeWithItem> cooperative = new HashMap<>(facts);
        cooperative.put("/qbiIsCooperativePatron", yes);
        assertEquals(
                List.of(QBI_COOPERATIVE_KNOCKOUT, SCHEDULE_C_QBI_KNOCKOUT, FORM_8995_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(cooperative)));
        Map<String, FactTypeWithItem> unanswered = new HashMap<>(facts);
        unanswered.remove("/qbiHasPriorYearLossCarryforward");
        List<String> unansweredPaths = PrintRefusingKnockouts.refusingPaths(fgs.getGraph(unanswered));
        assertTrue(unansweredPaths.contains(QBI_CARRYFORWARD_KNOCKOUT), "unanswered fails closed");
        assertTrue(unansweredPaths.contains(SCHEDULE_C_QBI_KNOCKOUT), "Schedule C knockout fails closed too");
        assertTrue(unansweredPaths.contains(FORM_8995_KNOCKOUT), "Form 8995 is still required");
        Graph noScheduleC = fgs.getGraph(CreditFormsTy2026PdfSmokeTest.scenarioFacts(FORM_2210_SCENARIO));
        assertEquals(Boolean.FALSE, noScheduleC.get(SCHEDULE_C_QBI_KNOCKOUT).get());
        assertTrue(noScheduleC.get(SCHEDULE_C_QBI_KNOCKOUT).complete(), "complete false without Schedule C");
    }

    /** A Schedule C loss still files Form 8995: line 18 carries the loss forward (26 U.S.C. 199A(c)(2)). */
    @Test
    void form8995LossYearWithLine18CarryforwardRefusesThePrint() throws Exception {
        Graph loss = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(scheduleCReturn("20000.00", "1000.00", "6000.00"));
        Result<Object> line18 = loss.get("/form8995Line18");
        assertTrue(line18.complete(), "line 18 complete");
        assertTrue(
                ((Number) line18.get()).doubleValue() < 0
                        || line18.get().toString().startsWith("-"),
                "a carryforward");
        assertEquals(Boolean.TRUE, loss.get("/form8995Required").get());
        assertEquals(Boolean.TRUE, loss.get(FORM_8995_KNOCKOUT).get());
        assertTrue(loss.get(FORM_8995_KNOCKOUT).complete());
        assertEquals(List.of(FORM_8995_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(loss));
    }

    /** No QBI: the Form 8995 knockout is complete and false, so it doesn't stop the print. */
    @Test
    void form8995KnockoutIsCompleteFalseWithoutQbi() throws Exception {
        Graph noQbi = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(CreditFormsTy2026PdfSmokeTest.scenarioFacts(FORM_2210_SCENARIO));
        assertEquals(Boolean.FALSE, noQbi.get("/form8995Required").get());
        assertEquals(Boolean.FALSE, noQbi.get(FORM_8995_KNOCKOUT).get());
        assertTrue(noQbi.get(FORM_8995_KNOCKOUT).complete(), "complete false without QBI");
        assertFalse(PrintRefusingKnockouts.refusingPaths(noQbi).contains(FORM_8995_KNOCKOUT));
    }

    @Test
    void returnsNothingWhenEveryKnockoutIsCompleteAndFalse() {
        Map<String, Result<Object>> results = Map.of("/a", complete(false), "/b", complete(false));
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(List.of("/a", "/b"), evaluator(results)));
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(List.of(), evaluator(results)));
    }

    static boolean positive(Graph graph, String path) {
        Result<Object> r = graph.get(path);
        return r.complete() && new BigDecimal(r.get().toString()).signum() > 0;
    }

    /**
     * Every backend scenario refuses exactly the knockouts its own facts call for, worked out here from the facts the
     * knockouts read: Schedule EIC (/pdfIncludeScheduleEic), Form 8962 (/needsToFileForm8962, no TY2026 template) and
     * Form 8995 (/form8995Required). Schedule C and Schedule 3-A print (#239): a business no longer refuses on its
     * own, and Form 1040 line 27a, 28 or 29 above $0 attaches Schedule 3-A instead of refusing. None has a Form 8949
     * code Q row or a PA/FL part-year return, and each knockout is complete in each, so fail-closed refuses no clean
     * return. The code Q refusal through the real print path is
     * ScheduleDForm8949PdfSmokeTest#codeQReturnIsRefusedByThePrintPath. {@link #PTC_BELOW_100_SCENARIO} also has
     * household income under 100% of the poverty line, which 26 U.S.C. 36B(c)(1)(A) requires and Form 8962 here does
     * not cover. A Form 8962 scenario that leaves the income-based special enrollment period question unanswered also
     * refuses through that stop, which fails closed (26 U.S.C. 36B(c)(3)(A)(iii)). A scenario whose Form 6251 is
     * required (Who Must File item 1) and whose /hasAmtPreferenceItems is not a complete answer refuses on
     * /flowKnockoutAmtPreferenceItemsUnanswered. Line 4 would otherwise combine lines 1b through 3 with lines 2c-3
     * omitted.
     */
    @Test
    void everyScenarioRefusesExactlyTheKnockoutsItsFactsCallFor() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:scenarios/*.json");
        assertTrue(files.length > 100, "scenarios found: " + files.length);
        int withScheduleEic = 0;
        int withSchedule3A = 0;
        int printed = 0;
        int form8962Refused = 0;
        for (Resource file : files) {
            JsonNode root = mapper.readTree(file.getInputStream());
            Map<String, FactTypeWithItem> facts =
                    mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
            Graph graph = fgs.getGraph(facts);
            List<String> expected = new ArrayList<>();
            Result<Object> schedule = graph.get("/pdfIncludeScheduleEic");
            if (schedule.complete() && Boolean.TRUE.equals(schedule.get())) {
                expected.add(SCHEDULE_EIC_KNOCKOUT);
                withScheduleEic++;
            }
            Result<Object> form8962 = graph.get("/needsToFileForm8962");
            if (form8962.complete() && Boolean.TRUE.equals(form8962.get())) {
                expected.add(FORM_8962_TEMPLATE_KNOCKOUT);
                if (PTC_BELOW_100_SCENARIO.equals(file.getFilename())) {
                    expected.add("/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl");
                }
                Result<Object> sep = graph.get(SEP_ANSWER);
                if (!sep.complete() || Boolean.TRUE.equals(sep.get())) {
                    expected.add(SEP_KNOCKOUT);
                }
                form8962Refused++;
            }
            Result<Object> form8995 = graph.get("/form8995Required");
            if (form8995.complete() && Boolean.TRUE.equals(form8995.get())) {
                expected.add(FORM_8995_KNOCKOUT);
            }
            // Form 6251 line 4 combines lines 1b through 3. An unanswered preference question is not "no".
            Result<Object> form6251 = graph.get("/form6251Required");
            Result<Object> preferenceAnswer = graph.get("/hasAmtPreferenceItems");
            if (form6251.complete() && Boolean.TRUE.equals(form6251.get()) && !preferenceAnswer.complete()) {
                expected.add(AMT_PREFERENCE_UNANSWERED_KNOCKOUT);
            }
            if (positive(graph, "/earnedIncomeCredit")
                    || positive(graph, "/additionalCtc")
                    || positive(graph, "/americanOpportunityCredit")) {
                withSchedule3A++;
            }
            assertEquals(expected, PrintRefusingKnockouts.refusingPaths(graph), file.getFilename());
            if (expected.isEmpty()) {
                printed++;
            }
        }
        assertEquals(50, withScheduleEic, "scenarios with Schedule EIC");
        // #186: the screener answers complete the EIC or ACTC in mfj-11k, ticket-12386, ticket-6192-ctc and
        // ticket-6718, so those four now attach Schedule 3-A (they read incomplete before).
        assertEquals(63, withSchedule3A, "scenarios that attach Schedule 3-A");
        assertEquals(FORM_8962_SCENARIO_COUNT, form8962Refused, "scenarios with Form 8962");
        // #239: a return whose only refusal was Schedule 3-A now prints (106, up from 93). Schedule C returns still
        // stop on Form 8995. Qualifying-child EIC still stops on Schedule EIC.
        assertEquals(106, printed, "scenarios that print");
    }

    /**
     * The field-map tests' print: the public path must print, or refuse with only {@link #TEMPLATE_PENDING}
     * knockouts; the package is then filled with {@link #FIELD_MAP_CHECKS}, so every other knockout still refuses.
     */
    static byte[] printForFieldMaps(PdfService pdfService, TaxReturn taxReturn, Graph graph) throws Exception {
        List<String> refused = PrintRefusingKnockouts.refusingPaths(graph);
        assertTrue(TEMPLATE_PENDING.containsAll(refused), "refused by " + refused);
        if (!refused.isEmpty()) {
            SubmissionBlockingFactsResponseStatusException e = assertThrows(
                    SubmissionBlockingFactsResponseStatusException.class,
                    () -> pdfService.getTaxReturn("en", taxReturn, false));
            assertEquals(refused, e.getBody().getProperties().get("blockingFacts"), "the public print path refuses");
        }
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false, FIELD_MAP_CHECKS)) {
            return in.readAllBytes();
        }
    }

    /** The shared smoke fixture with the given facts layered on, as the Schedule SE smoke test builds it. */
    static Map<String, FactTypeWithItem> smoke(Map<String, String> extra) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root =
                mapper.readTree(new ClassPathResource("pdf-smoke/schedule-d-8949-synthetic.json").getInputStream());
        Map<String, FactTypeWithItem> facts =
                mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
        for (var e : extra.entrySet()) {
            facts.put(e.getKey(), mapper.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return facts;
    }

    /** A Schedule C return with no EIC, ACTC or AOTC: single, $170,000 wages, $30,000 Schedule C profit. */
    static Map<String, FactTypeWithItem> scheduleCOnly() throws Exception {
        return smoke(ScheduleSETy2026PdfSmokeTest.selfEmployed("170000.00", "170000.00", "30000.00"));
    }

    /** A Schedule 3-A return with no Schedule C: the family scenario with group-00 test SSNs and an ACTC, no EIC. */
    static Map<String, FactTypeWithItem> schedule3AOnly() throws Exception {
        Map<String, FactTypeWithItem> facts = Ty2026PdfPackageTest.scenarioFile(
                Ty2026PdfPackageTest.FAMILY, Ty2026PdfPackageTest.CTC_FILER_SSN, true);
        Ty2026PdfPackageTest.noEitc(facts);
        return facts;
    }

    /**
     * #87: Form 8995 is what refuses a Schedule C return (Instructions for Form 1040 (2025) draft, PDF p. 35, "Attach
     * whichever form you use (Form 8995 or 8995-A) to your return."). Schedule C itself prints (#239; Instructions for
     * Schedule C (2025), PDF p. 2). Taking Form 8995 out of the list would let that package print without Form 8995.
     * An ACTC return (2026 draft Form 1040 lines 32a-32c, "attach Sch. 3-A") is not refused: Schedule 3-A prints.
     */
    @Test
    void form8995IsWhatRefusesAScheduleCReturnAndSchedule3APrints() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Graph business = fgs.getGraph(scheduleCOnly());
        assertEquals(List.of(FORM_8995_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(business));
        assertEquals(Boolean.TRUE, business.get("/flowIsKnockedOut").get(), "Form 8995 in /flowIsKnockedOut");
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !p.equals(FORM_8995_KNOCKOUT))
                .toList();
        assertEquals(
                List.of(),
                PrintRefusingKnockouts.refusingPaths(without, path -> business.get(path)),
                "without Form 8995 nothing would refuse the Schedule C print");
        assertEquals(Boolean.TRUE, business.get("/hasScheduleCBusinesses").get());
        Graph actc = fgs.getGraph(schedule3AOnly());
        assertTrue(positive(actc, "/additionalCtc"), "Form 1040 line 28 ACTC above $0");
        assertFalse(positive(actc, "/earnedIncomeCredit"), "no EIC");
        assertEquals(Boolean.TRUE, actc.get("/pdfIncludeSchedule3A").get(), "Schedule 3-A is attached");
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(actc), "Schedule 3-A does not refuse the print");
        assertEquals(Boolean.FALSE, actc.get("/flowIsKnockedOut").get());
    }

    /**
     * #89. Form 6251 (2026) draft, PDF p. 2 (form p. 1), line 4: "Combine lines 1b through 3. (If married filing
     * separately and line 4 is more than $640,200, see instructions.)" A yes to the adjustments question would print
     * lines 2c-2t, 3 and 8 blank (26 U.S.C. 55(b)(2), 56, 57). An unanswered question on a required Form 6251 is not
     * that yes stop: /flowKnockoutAmtPreferenceItems is complete false, and line 4 would still combine lines 1b
     * through 3 as if lines 2c-3 were zero. /flowKnockoutAmtPreferenceItemsUnanswered refuses that print. It stays
     * complete false when the form is not required. An MFS return over $640,200 would print line 4 without the
     * 26 U.S.C. 55(d)(2) add-back. The supported golden end-to-end scenario (synthetic data) leaves each stop complete
     * and false, so that return still prints.
     */
    @Test
    void form6251StopsRefuseThePrintAndASupportedReturnDoesNot() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, FactTypeWithItem> supported = smoke(Form6251Ty2026PdfSmokeTest.amtScenario());
        Graph printed = fgs.getGraph(supported);
        assertEquals(Boolean.TRUE, printed.get("/form6251Required").get(), "Who Must File item 1");
        assertCompleteFalse(printed, AMT_PREFERENCE_KNOCKOUT);
        assertCompleteFalse(printed, AMT_PREFERENCE_UNANSWERED_KNOCKOUT);
        assertCompleteFalse(printed, AMT_MFS_ADD_BACK_KNOCKOUT);
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(printed), "supported AMT return prints");

        ObjectMapper mapper = new ObjectMapper();
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> adjustments = new HashMap<>(supported);
        adjustments.put("/hasAmtPreferenceItems", yes);
        Graph partial = fgs.getGraph(adjustments);
        assertEquals(Boolean.TRUE, partial.get(AMT_PREFERENCE_KNOCKOUT).get());
        assertCompleteFalse(partial, AMT_PREFERENCE_UNANSWERED_KNOCKOUT);
        assertEquals(Boolean.TRUE, partial.get("/flowIsKnockedOut").get());
        assertEquals(List.of(AMT_PREFERENCE_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(partial));

        Map<String, FactTypeWithItem> unanswered = new HashMap<>(supported);
        unanswered.remove("/hasAmtPreferenceItems");
        Graph open = fgs.getGraph(unanswered);
        assertEquals(Boolean.TRUE, open.get("/form6251Required").get(), "Who Must File item 1");
        assertFalse(open.get("/hasAmtPreferenceItems").complete(), "preference question unanswered");
        assertCompleteFalse(open, AMT_PREFERENCE_KNOCKOUT);
        assertEquals(Boolean.TRUE, open.get(AMT_PREFERENCE_UNANSWERED_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, open.get("/flowIsKnockedOut").get());
        assertEquals(List.of(AMT_PREFERENCE_UNANSWERED_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(open));

        Map<String, FactTypeWithItem> notRequired = smoke(Map.of());
        notRequired.remove("/hasAmtPreferenceItems");
        Graph low = fgs.getGraph(notRequired);
        assertEquals(Boolean.FALSE, low.get("/form6251Required").get(), "AMT is $0, so Form 6251 is not required");
        assertFalse(low.get("/hasAmtPreferenceItems").complete());
        assertCompleteFalse(low, AMT_PREFERENCE_UNANSWERED_KNOCKOUT);
        assertFalse(PrintRefusingKnockouts.refusingPaths(low).contains(AMT_PREFERENCE_UNANSWERED_KNOCKOUT));

        Map<String, FactTypeWithItem> mfs = mfsAboveAddBack(supported);
        Graph addBack = fgs.getGraph(mfs);
        assertTrue(addBack.get("/form6251Line4").complete(), "line 4 is computed");
        assertTrue(
                new BigDecimal(addBack.get("/form6251Line4").get().toString()).compareTo(new BigDecimal("640200")) > 0,
                "line 4 is over $640,200");
        assertEquals(Boolean.TRUE, addBack.get(AMT_MFS_ADD_BACK_KNOCKOUT).get());
        assertEquals(Boolean.FALSE, addBack.get(AMT_PREFERENCE_KNOCKOUT).get());
        assertCompleteFalse(addBack, AMT_PREFERENCE_UNANSWERED_KNOCKOUT);
        assertEquals(List.of(AMT_MFS_ADD_BACK_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(addBack));

        Map<String, FactTypeWithItem> atThreshold = new HashMap<>(mfs);
        atThreshold.put(
                "/formW2s/#959c03d1-af4a-447f-96aa-d19397048a44/writableWages",
                mapper.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.DollarWrapper\",\"item\":\"640200.00\"}",
                        FactTypeWithItem.class));
        atThreshold.put(
                "/soldCapitalAssets",
                mapper.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}",
                        FactTypeWithItem.class));
        atThreshold.put(
                "/form8949Transactions",
                mapper.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}",
                        FactTypeWithItem.class));
        Graph boundary = fgs.getGraph(atThreshold);
        assertTrue(boundary.get("/form6251Line4").complete(), "line 4 at the threshold");
        assertTrue(
                new BigDecimal(boundary.get("/form6251Line4").get().toString()).compareTo(new BigDecimal("640200"))
                        <= 0,
                "line 4 at or under $640,200: " + boundary.get("/form6251Line4").get());
        assertCompleteFalse(boundary, AMT_MFS_ADD_BACK_KNOCKOUT);
        assertFalse(PrintRefusingKnockouts.refusingPaths(boundary).contains(AMT_MFS_ADD_BACK_KNOCKOUT));
    }

    static void assertCompleteFalse(Graph graph, String path) {
        Result<Object> result = graph.get(path);
        assertTrue(result.complete(), path + " complete");
        assertEquals(Boolean.FALSE, result.get(), path);
    }

    /** The supported AMT scenario switched to married filing separately, so line 4 is over the add-back threshold. */
    static Map<String, FactTypeWithItem> mfsAboveAddBack(Map<String, FactTypeWithItem> supported) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> mfs = new HashMap<>(supported);
        mfs.put(
                "/filingStatus",
                mapper.readValue(
                        PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue(
                                "marriedFilingSeparately", "/filingStatusOptions"),
                        FactTypeWithItem.class));
        mfs.put(
                "/maritalStatus",
                mapper.readValue(
                        PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue("married", "/maritalStatusOptions"),
                        FactTypeWithItem.class));
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        FactTypeWithItem no = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}", FactTypeWithItem.class);
        mfs.put("/MFSSpouseFilingReturn", yes);
        mfs.put("/MFSLivingSpouseFilingReturn", yes);
        mfs.put("/MFSSpouseHasGrossIncome", yes);
        mfs.put("/livedTogetherAllYearWithSpouse", yes);
        mfs.put("/MFSSpouse65OrOlder", no);
        return mfs;
    }
}
