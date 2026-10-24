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
import org.springframework.core.io.ClassPathResource;
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
    static final String SCHEDULE_E_QBI_KNOCKOUT = "/flowKnockoutScheduleETradeOrBusinessQbi";
    static final String QBI_ABOVE_THRESHOLD_KNOCKOUT = "/flowKnockoutQbiAboveThreshold";
    static final String QBI_CARRYFORWARD_KNOCKOUT = "/flowKnockoutQbiPriorYearCarryforward";
    static final String QBI_COOPERATIVE_KNOCKOUT = "/flowKnockoutQbiCooperativePatron";
    static final String QBI_MIXED_PARTICIPATION_KNOCKOUT = "/flowKnockoutQbiMixedParticipation";
    static final String SCHEDULE_C_QBI_KNOCKOUT = "/flowKnockoutScheduleCQbi";
    static final String FORM_8995_KNOCKOUT = "/flowKnockoutForm8995WithoutTy2026Template";
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
    void listHoldsTheCodeQScheduleEicPaScheduleNrhForm2210AndQbiKnockouts() {
        assertEquals(
                List.of(
                        CODE_Q_KNOCKOUT, // Form 8949 code Q
                        SCHEDULE_EIC_KNOCKOUT, // Schedule EIC has no TY2026 template
                        PA_NRH_KNOCKOUT, // PA Schedule NRH
                        FORM_2210_KNOCKOUT, // Form 2210 Part II box B, C, D, A or E
                        SCHEDULE_E_QBI_KNOCKOUT, // Schedule E rental treated as a trade or business (line 13b)
                        QBI_ABOVE_THRESHOLD_KNOCKOUT, // Form 8995-A
                        QBI_CARRYFORWARD_KNOCKOUT, // prior-year QBI loss carryforward
                        QBI_COOPERATIVE_KNOCKOUT, // cooperative patron
                        QBI_MIXED_PARTICIPATION_KNOCKOUT, // active and non-active businesses
                        SCHEDULE_C_QBI_KNOCKOUT, // any of the four Form 8995 stops with Schedule C income
                        FORM_8995_KNOCKOUT), // Form 8995 is attached and has no TY2026 template or MeF mapping
                PrintRefusingKnockouts.FACT_PATHS);
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
     * amount forward. A carryforward or cooperative yes, or an unanswered question, also refuses through its own stop.
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
        assertEquals(List.of(FORM_8995_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(computed), "no Form 8995 form");
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

    /**
     * Every backend scenario prints unless it has Schedule EIC. None has a Form 8949 code Q row or a PA/FL part-year
     * return, and each knockout is complete in each, including the two that stop before the EIC questions, so
     * fail-closed refuses no clean return. The code Q refusal through the real print path is
     * ScheduleDForm8949PdfSmokeTest#codeQReturnIsRefusedByThePrintPath.
     */
    @Test
    void everyScenarioWithoutScheduleEicStillPrints() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:scenarios/*.json");
        assertTrue(files.length > 100, "scenarios found: " + files.length);
        int refused = 0;
        int printed = 0;
        for (Resource file : files) {
            JsonNode root = mapper.readTree(file.getInputStream());
            Map<String, FactTypeWithItem> facts =
                    mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
            Graph graph = fgs.getGraph(facts);
            Result<Object> schedule = graph.get("/pdfIncludeScheduleEic");
            boolean withScheduleEic = schedule.complete() && Boolean.TRUE.equals(schedule.get());
            List<String> paths = PrintRefusingKnockouts.refusingPaths(graph);
            assertEquals(withScheduleEic ? List.of(SCHEDULE_EIC_KNOCKOUT) : List.of(), paths, file.getFilename());
            if (withScheduleEic) {
                refused++;
            } else {
                printed++;
            }
        }
        assertEquals(50, refused, "scenarios with Schedule EIC");
        assertEquals(112, printed, "scenarios that print");
    }
}
