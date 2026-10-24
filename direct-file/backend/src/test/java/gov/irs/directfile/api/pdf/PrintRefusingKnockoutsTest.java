package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
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
    static final String FORM_2210_KNOCKOUT = "/flowKnockoutForm2210";
    static final String SCHEDULE_E_QBI_KNOCKOUT = "/flowKnockoutScheduleETradeOrBusinessQbi";
    static final String QBI_ABOVE_THRESHOLD_KNOCKOUT = "/flowKnockoutQbiAboveThreshold";
    static final String QBI_CARRYFORWARD_KNOCKOUT = "/flowKnockoutQbiPriorYearCarryforward";
    static final String QBI_COOPERATIVE_KNOCKOUT = "/flowKnockoutQbiCooperativePatron";
    static final String QBI_MIXED_PARTICIPATION_KNOCKOUT = "/flowKnockoutQbiMixedParticipation";
    static final String SCHEDULE_C_QBI_KNOCKOUT = "/flowKnockoutScheduleCQbi";
    static final String FORM_8995_KNOCKOUT = "/flowKnockoutForm8995WithoutTy2026Template";
    static final String SCHEDULE_C_KNOCKOUT = "/flowKnockoutScheduleCWithoutTy2026Template";
    static final String SCHEDULE_3A_KNOCKOUT = "/flowKnockoutSchedule3AWithoutTy2026Template";
    /**
     * #89 and #87: knockouts that wait only on a form with no template yet (Form 8995, Schedule C, Schedule 3-A). The field-map tests for
     * Schedule SE, Schedule 8812 and Form 2441 fill their forms with these left out of the refusal check (see
     * {@link #FIELD_MAP_CHECKS}); the public print path still refuses those returns.
     */
    static final List<String> TEMPLATE_PENDING = List.of(FORM_8995_KNOCKOUT, SCHEDULE_C_KNOCKOUT, SCHEDULE_3A_KNOCKOUT);
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
    void listHoldsTheCodeQScheduleEicPaScheduleNrhForm2210ScheduleEQbiQbiScheduleCAndSchedule3AKnockouts() {
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
                        FORM_8995_KNOCKOUT, // Form 8995 is attached and has no TY2026 template or MeF mapping
                        SCHEDULE_C_KNOCKOUT, // #89 Schedule C has no template
                        SCHEDULE_3A_KNOCKOUT), // #89 Schedule 3-A has no template or line 32b fact
                PrintRefusingKnockouts.FACT_PATHS);
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
        assertEquals(
                List.of(FORM_8995_KNOCKOUT, SCHEDULE_C_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(computed),
                "no Form 8995 (or Schedule C) template");
        assertEquals(Boolean.TRUE, computed.get("/flowIsKnockedOut").get(), "submission is blocked too");
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> carryforward = new HashMap<>(facts);
        carryforward.put("/qbiHasPriorYearLossCarryforward", yes);
        assertEquals(
                List.of(QBI_CARRYFORWARD_KNOCKOUT, SCHEDULE_C_QBI_KNOCKOUT, FORM_8995_KNOCKOUT, SCHEDULE_C_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(carryforward)));
        Map<String, FactTypeWithItem> cooperative = new HashMap<>(facts);
        cooperative.put("/qbiIsCooperativePatron", yes);
        assertEquals(
                List.of(QBI_COOPERATIVE_KNOCKOUT, SCHEDULE_C_QBI_KNOCKOUT, FORM_8995_KNOCKOUT, SCHEDULE_C_KNOCKOUT),
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
        assertEquals(List.of(FORM_8995_KNOCKOUT, SCHEDULE_C_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(loss));
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
     * knockouts read: Schedule EIC (/pdfIncludeScheduleEic), Form 8995 (/form8995Required), Schedule C
     * (/hasScheduleCBusinesses) and Schedule 3-A
     * (Form 1040 line 27a, 28 or 29 above $0, 2026 draft Form 1040 "If you entered an amount on line 27a, 28, 29, or
     * 30, attach Sch. 3-A"). None has a Form 8949 code Q row or a PA/FL part-year return, and each knockout is
     * complete in each, so fail-closed refuses no clean return. The code Q refusal through the real print path is
     * ScheduleDForm8949PdfSmokeTest#codeQReturnIsRefusedByThePrintPath.
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
            Result<Object> form8995 = graph.get("/form8995Required");
            if (form8995.complete() && Boolean.TRUE.equals(form8995.get())) {
                expected.add(FORM_8995_KNOCKOUT);
            }
            Result<Object> business = graph.get("/hasScheduleCBusinesses");
            if (business.complete() && Boolean.TRUE.equals(business.get())) {
                expected.add(SCHEDULE_C_KNOCKOUT);
            }
            if (positive(graph, "/earnedIncomeCredit")
                    || positive(graph, "/additionalCtc")
                    || positive(graph, "/americanOpportunityCredit")) {
                expected.add(SCHEDULE_3A_KNOCKOUT);
                withSchedule3A++;
            }
            assertEquals(expected, PrintRefusingKnockouts.refusingPaths(graph), file.getFilename());
            if (expected.isEmpty()) {
                printed++;
            }
        }
        assertEquals(50, withScheduleEic, "scenarios with Schedule EIC");
        assertEquals(59, withSchedule3A, "scenarios with Schedule 3-A");
        assertEquals(103, printed, "scenarios that print");
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
     * #89: the template-pending entries are what refuse their returns, so taking them out of the list would let the
     * package print without the form. Instructions for Schedule C (2025), PDF p. 2; 2026 draft Form 1040 lines 32a-32c
     * and Schedule 3-A. #87: a Schedule C return also attaches Form 8995 (Instructions for Form 1040 (2025) draft, PDF
     * p. 35, "Attach whichever form you use (Form 8995 or 8995-A) to your return."), so it is refused by both the Form
     * 8995 and the Schedule C entry, and either one alone still refuses it. Schedule C is the only QBI source here, so
     * no return needs Form 8995 without Schedule C.
     */
    @Test
    void eachTemplatePendingEntryIsWhatRefusesItsReturn() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<List<String>, Map<String, FactTypeWithItem>> cases = Map.of(
                List.of(FORM_8995_KNOCKOUT, SCHEDULE_C_KNOCKOUT),
                scheduleCOnly(),
                List.of(SCHEDULE_3A_KNOCKOUT),
                schedule3AOnly());
        for (var c : cases.entrySet()) {
            Graph graph = fgs.getGraph(c.getValue());
            assertEquals(c.getKey(), PrintRefusingKnockouts.refusingPaths(graph), c.getKey() + " refuse");
            assertEquals(Boolean.TRUE, graph.get("/flowIsKnockedOut").get(), c.getKey() + " in /flowIsKnockedOut");
            List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                    .filter(p -> !c.getKey().contains(p))
                    .toList();
            assertEquals(
                    List.of(),
                    PrintRefusingKnockouts.refusingPaths(without, path -> graph.get(path)),
                    "without " + c.getKey() + " nothing would refuse the print");
            for (String one : c.getKey()) {
                List<String> withOnly = PrintRefusingKnockouts.FACT_PATHS.stream()
                        .filter(p -> p.equals(one) || !c.getKey().contains(p))
                        .toList();
                assertEquals(
                        List.of(one),
                        PrintRefusingKnockouts.refusingPaths(withOnly, path -> graph.get(path)),
                        one + " alone still refuses");
            }
        }
        Graph business = fgs.getGraph(scheduleCOnly());
        assertEquals(Boolean.TRUE, business.get("/hasScheduleCBusinesses").get());
        Graph actc = fgs.getGraph(schedule3AOnly());
        assertTrue(positive(actc, "/additionalCtc"), "Form 1040 line 28 ACTC above $0");
        assertFalse(positive(actc, "/earnedIncomeCredit"), "no EIC");
    }
}
