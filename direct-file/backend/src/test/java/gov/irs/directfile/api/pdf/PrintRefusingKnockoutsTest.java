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
    static final String SCHEDULE_C_KNOCKOUT = "/flowKnockoutScheduleCWithoutTy2026Template";
    static final String SCHEDULE_3A_KNOCKOUT = "/flowKnockoutSchedule3AWithoutTy2026Template";
    /**
     * #89: knockouts that wait only on a form with no template yet (Schedule C, Schedule 3-A). The field-map tests for
     * Schedule SE, Schedule 8812 and Form 2441 fill their forms with these left out of the refusal check (see
     * {@link #FIELD_MAP_CHECKS}); the public print path still refuses those returns.
     */
    static final List<String> TEMPLATE_PENDING = List.of(SCHEDULE_C_KNOCKOUT, SCHEDULE_3A_KNOCKOUT);
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
    void listHoldsTheCodeQScheduleEicPaScheduleNrhForm2210ScheduleEQbiScheduleCAndSchedule3AKnockouts() {
        assertEquals(
                List.of(
                        CODE_Q_KNOCKOUT, // Form 8949 code Q
                        SCHEDULE_EIC_KNOCKOUT, // Schedule EIC has no TY2026 template
                        PA_NRH_KNOCKOUT, // PA Schedule NRH
                        FORM_2210_KNOCKOUT, // Form 2210 Part II box B, C, D, A or E
                        SCHEDULE_E_QBI_KNOCKOUT, // Schedule E rental treated as a trade or business (line 13b)
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
     * knockouts read: Schedule EIC (/pdfIncludeScheduleEic), Schedule C (/hasScheduleCBusinesses) and Schedule 3-A
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
        // #186: the screener answers complete the EIC or ACTC in mfj-11k, ticket-12386, ticket-6192-ctc and
        // ticket-6718, so those four now need Schedule 3-A (they read incomplete, and the knockout false, before).
        assertEquals(63, withSchedule3A, "scenarios with Schedule 3-A");
        assertEquals(99, printed, "scenarios that print");
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
     * #89: each template-pending entry is the only thing refusing its return, so taking it out of the list would let
     * the package print without the form. Instructions for Schedule C (2025), PDF p. 2; 2026 draft Form 1040 lines
     * 32a-32c and Schedule 3-A.
     */
    @Test
    void eachTemplatePendingEntryIsWhatRefusesItsReturn() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, Map<String, FactTypeWithItem>> cases =
                Map.of(SCHEDULE_C_KNOCKOUT, scheduleCOnly(), SCHEDULE_3A_KNOCKOUT, schedule3AOnly());
        for (var c : cases.entrySet()) {
            Graph graph = fgs.getGraph(c.getValue());
            assertEquals(List.of(c.getKey()), PrintRefusingKnockouts.refusingPaths(graph), c.getKey() + " refuses");
            assertEquals(Boolean.TRUE, graph.get("/flowIsKnockedOut").get(), c.getKey() + " in /flowIsKnockedOut");
            List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                    .filter(p -> !p.equals(c.getKey()))
                    .toList();
            assertEquals(
                    List.of(),
                    PrintRefusingKnockouts.refusingPaths(without, path -> graph.get(path)),
                    "without " + c.getKey() + " nothing would refuse the print");
        }
        Graph business = fgs.getGraph(scheduleCOnly());
        assertEquals(Boolean.TRUE, business.get("/hasScheduleCBusinesses").get());
        Graph actc = fgs.getGraph(schedule3AOnly());
        assertTrue(positive(actc, "/additionalCtc"), "Form 1040 line 28 ACTC above $0");
        assertFalse(positive(actc, "/earnedIncomeCredit"), "no EIC");
    }
}
