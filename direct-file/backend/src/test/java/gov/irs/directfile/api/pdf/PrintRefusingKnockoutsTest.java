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
    static final String PA_SCHEDULE_C_KNOCKOUT = "/flowKnockoutPaScheduleC";
    static final String PA_SCHEDULE_D_KNOCKOUT = "/flowKnockoutPaScheduleD";
    static final String FORM_2210_KNOCKOUT = "/flowKnockoutForm2210";
    static final String FORM_8962_UNRESOLVED_KNOCKOUT = "/flowKnockoutForm8962NeededOrUnresolved";
    static final List<String> PTC_KNOCKOUTS = List.of(
            FORM_8962_UNRESOLVED_KNOCKOUT,
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

    static final String INTEREST_SUBTRACTION_KNOCKOUT = "/flowKnockoutInterestScheduleBSubtraction";
    /** Fail-closed print gate. Not an operand of {@code /flowIsKnockedOut}. */
    static final String SCHEDULE_B_PART_III_PRINT_REFUSE = "/flowPrintRefuseScheduleBPartIII";

    /**
     * Interview knockout: line 8 Yes, Form 8938 Yes, or line 7b countries that do not fit. Complete false while Part
     * III is unanswered.
     */
    static final String SCHEDULE_B_PART_III_FLOW_KNOCKOUT = "/flowKnockoutScheduleBPartIII";

    static final String SCHEDULE_E_LOSS_KNOCKOUT = "/flowKnockoutScheduleELoss";
    static final String SCHEDULE_E_DEPRECIATION_KNOCKOUT = "/flowKnockoutScheduleEDepreciation";
    static final String SCHEDULE_E_PERSONAL_USE_KNOCKOUT = "/flowKnockoutScheduleEPersonalUse";
    static final String SCHEDULE_E_SUBSTANTIAL_SERVICES_KNOCKOUT = "/flowKnockoutScheduleESubstantialServices";
    static final String SCHEDULE_E_QBI_KNOCKOUT = "/flowKnockoutScheduleETradeOrBusinessQbi";
    static final String SCHEDULE_E_PART_II_KNOCKOUT = "/flowKnockoutScheduleEPartII";
    static final String SCHEDULE_E_PART_II_MORE_THAN_FOUR_KNOCKOUT = "/flowKnockoutScheduleEPartIIMoreThanFour";
    static final String SCHEDULE_E_PART_III_MORE_THAN_TWO_KNOCKOUT = "/flowKnockoutScheduleEPartIIIMoreThanTwo";
    static final String QBI_ABOVE_THRESHOLD_KNOCKOUT = "/flowKnockoutQbiAboveThreshold";
    static final String QBI_CARRYFORWARD_KNOCKOUT = "/flowKnockoutQbiPriorYearCarryforward";
    static final String QBI_COOPERATIVE_KNOCKOUT = "/flowKnockoutQbiCooperativePatron";
    static final String QBI_MIXED_PARTICIPATION_KNOCKOUT = "/flowKnockoutQbiMixedParticipation";
    static final String SCHEDULE_C_QBI_AND_K1_BOX14_KNOCKOUT = "/flowKnockoutScheduleCQbiAndK1Box14CodeA";
    static final String SCHEDULE_C_QBI_KNOCKOUT = "/flowKnockoutScheduleCQbi";
    static final String FORM_8995_MORE_THAN_FIVE_KNOCKOUT = "/flowKnockoutForm8995MoreThanFiveBusinesses";
    static final String SCHEDULE_C_OUT_OF_SCOPE_KNOCKOUT = "/flowKnockoutScheduleCOutOfScope";
    static final String SCHEDULE_SE_OUT_OF_SCOPE_KNOCKOUT = "/flowKnockoutScheduleSEOutOfScope";
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
    /** Form 1099-DIV boxes 2b-2f, 6 and 8-16, including section 1202 and collectibles. */
    static final String DIVIDEND_UNSUPPORTED_BOXES_KNOCKOUT = "/flowKnockoutDividendUnsupportedBoxes";
    /** 26 U.S.C. 301(c)(3)(A): box 3 above basis, reported on Form 8949. */
    static final String DIVIDEND_OVER_BASIS_KNOCKOUT = "/flowKnockoutNondividendDistributionsOverBasis";
    /** 26 U.S.C. 1(h)(11)(B)(iii): box 1b that is not a qualified dividend. */
    static final String DIVIDEND_HOLDING_PERIOD_KNOCKOUT = "/flowKnockoutQualifiedDividendsHoldingPeriod";
    /** 26 U.S.C. 199A(b)(1)(B): box 5. The dividend QBI deduction is not computed. */
    static final String DIVIDEND_SECTION_199A_KNOCKOUT = "/flowKnockoutSection199ADividends";
    /** 26 U.S.C. 904(j): box 7 that needs Form 1116. */
    static final String DIVIDEND_FOREIGN_TAX_KNOCKOUT = "/flowKnockoutDividendForeignTaxPaid";
    /** Nominee ordinary dividends. The Schedule B Part II subtraction is not computed. */
    static final String DIVIDEND_NOMINEE_KNOCKOUT = "/flowKnockoutDividendNominee";
    /** Box 1b or box 5 larger than box 1a. */
    static final String DIVIDEND_INCONSISTENT_KNOCKOUT = "/flowKnockoutDividendAmountsInconsistent";

    static final String DIVIDEND_ID = "13500000-0000-4000-8000-000000000502";
    /**
     * Knockouts the field-map tests may still see while filling forms the public path refuses. PA Schedule C is
     * required on a PA-40 with Schedule C (IN p. 17) and has no PA Schedule C PDF in this slice, so
     * /flowKnockoutPaScheduleC refuses public print; PA-40 line 4 field maps still fill (see
     * {@link #FIELD_MAP_CHECKS}). Form 8995 prints from the 2026 draft (#17). Schedule C and Schedule 3-A federal
     * templates are pinned (#239), so they are not in this list.
     */
    static final List<String> TEMPLATE_PENDING = List.of(PA_SCHEDULE_C_KNOCKOUT);
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
                PA_UNSUPPORTED_ITEMS_KNOCKOUT, // PA-40 lines 7, 8, 10, 14, 16, REV-459B, 22, 23, 25.
                // Line 15 is computed (p. 21, LINE 15; 72 P.S. §7325). Line 18 is p. 22.
                PA_UNSUPPORTED_INCOME_KNOCKOUT, // line 4 stops for part-year/MFJ loss/tax shelter; line 6 for
                // K-1/part-year E
                PA_SP_KNOCKOUT, // Schedule SP Tax Forgiveness
                PA_PART_YEAR_KNOCKOUT, // PA/FL part-year cases not computed
                PA_SCHEDULE_A_KNOCKOUT, // PA Schedule A
                PA_SCHEDULE_B_KNOCKOUT, // PA Schedule B
                PA_SCHEDULE_C_KNOCKOUT, // PA Schedule C required; no PA Sch C PDF in this slice
                PA_SCHEDULE_D_KNOCKOUT, // PA Schedule D
                FORM_2210_KNOCKOUT)); // Form 2210 Part II box B, C, D, A or E
        expected.addAll(PTC_KNOCKOUTS); // Form 8962 unresolved, or a case the draft does not compute
        expected.addAll(List.of(
                INTEREST_SUBTRACTION_KNOCKOUT, // Schedule B line 1 subtraction not computed
                SCHEDULE_B_PART_III_PRINT_REFUSE, // Schedule B Part III blank or Yes; not /flowIsKnockedOut
                SCHEDULE_E_LOSS_KNOCKOUT, // Schedule E Part I loss
                SCHEDULE_E_DEPRECIATION_KNOCKOUT, // Form 4562
                SCHEDULE_E_PERSONAL_USE_KNOCKOUT, // 26 U.S.C. 280A
                SCHEDULE_E_SUBSTANTIAL_SERVICES_KNOCKOUT, // substantial services belong on Schedule C
                SCHEDULE_E_QBI_KNOCKOUT, // Schedule E rental treated as a trade or business (line 13b)
                SCHEDULE_E_PART_II_KNOCKOUT, // Schedule E Parts II-III and Schedule SE K-1 box 14 code A
                SCHEDULE_E_PART_II_MORE_THAN_FOUR_KNOCKOUT, // line 28 has four rows; no continuation sheet
                SCHEDULE_E_PART_III_MORE_THAN_TWO_KNOCKOUT, // line 33 has two rows; no continuation sheet
                QBI_ABOVE_THRESHOLD_KNOCKOUT, // Form 8995-A
                QBI_CARRYFORWARD_KNOCKOUT, // prior-year QBI loss carryforward
                QBI_COOPERATIVE_KNOCKOUT, // cooperative patron
                QBI_MIXED_PARTICIPATION_KNOCKOUT, // active and non-active businesses
                SCHEDULE_C_QBI_AND_K1_BOX14_KNOCKOUT, // Schedule C QBI and Form 1065 box 14 code A
                SCHEDULE_C_QBI_KNOCKOUT, // any of the four Form 8995 stops with Schedule C income
                FORM_8995_MORE_THAN_FIVE_KNOCKOUT, // more than five Schedule C businesses; no statement
                SCHEDULE_C_OUT_OF_SCOPE_KNOCKOUT, // Schedule C line that needs a form or loss limit not computed here
                SCHEDULE_SE_OUT_OF_SCOPE_KNOCKOUT, // Schedule SE line this tool does not compute
                AMT_PREFERENCE_KNOCKOUT, // Form 6251 lines 2c-2t, 3 and 8
                AMT_PREFERENCE_UNANSWERED_KNOCKOUT, // required Form 6251, preference question not complete
                AMT_MFS_ADD_BACK_KNOCKOUT, // MFS AMTI over $640,200, add-back not computed
                DIVIDEND_UNSUPPORTED_BOXES_KNOCKOUT, // 1099-DIV boxes 2b-2f, 6, 8-16
                DIVIDEND_OVER_BASIS_KNOCKOUT, // box 3 above basis
                DIVIDEND_HOLDING_PERIOD_KNOCKOUT, // box 1b that is not qualified
                DIVIDEND_SECTION_199A_KNOCKOUT, // box 5
                DIVIDEND_FOREIGN_TAX_KNOCKOUT, // box 7 that needs Form 1116
                DIVIDEND_NOMINEE_KNOCKOUT, // nominee dividends
                DIVIDEND_INCONSISTENT_KNOCKOUT)); // box 1b or 5 larger than box 1a
        assertEquals(expected, PrintRefusingKnockouts.FACT_PATHS);
        // #123 adds the PA-40 and Schedule SP stops besides NRH. #89 adds the Form 6251 stops, including the
        // unanswered preference question when the form is required. #246 adds /flowKnockoutScheduleEPartII.
        // #239 drops the Schedule C and Schedule 3-A template knockouts. #17 drops the Form 8995 template knockout;
        // /flowKnockoutForm8995WithoutTy2026Template still blocks submission (no MeF mapping). #88 prints
        // pdf/2026/IRS8962 and keeps
        // /flowKnockoutForm8962NeededOrUnresolved when /needsToFileForm8962 is not complete true. Schedule B Part III
        // is
        // /flowPrintRefuseScheduleBPartIII (one path). An unanswered Part III refuses the print and does not
        // make /flowIsKnockedOut true.
        // #86 appends the 1099-DIV stops and does not list Part III again.
        // PA Schedule C print-refuse: PA-40 ∧ Sch C (IN p. 17; no PA Sch C PDF in this slice).
        assertEquals(49, PrintRefusingKnockouts.FACT_PATHS.size(), "FACT_PATHS entries");
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
     * A Form 1095-A return that Form 8962 computes is not refused for lack of a template. A "yes" to the income-based
     * special enrollment period question (26 U.S.C. 36B(c)(3)(A)(iii)), or leaving it unanswered, still refuses. A
     * "no" clears that stop. Without Form 8962 every PTC knockout is complete and false.
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
        assertEquals(List.of(SEP_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(computed));
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        FactTypeWithItem no = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> answeredYes = new HashMap<>(facts);
        answeredYes.put(SEP_ANSWER, yes);
        assertEquals(List.of(SEP_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(fgs.getGraph(answeredYes)));
        // Only a "no" clears it. The return can then print Form 8962.
        Map<String, FactTypeWithItem> answeredNo = new HashMap<>(facts);
        answeredNo.put(SEP_ANSWER, no);
        Graph cleared = fgs.getGraph(answeredNo);
        assertEquals(Boolean.FALSE, cleared.get(SEP_KNOCKOUT).get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(cleared));

        Map<String, FactTypeWithItem> w2Only = scenarioFacts(mapper, PTC_NONE_SCENARIO);
        Graph none = fgs.getGraph(w2Only);
        for (String path : PTC_KNOCKOUTS) {
            Result<Object> r = none.get(path);
            assertTrue(r.complete() && Boolean.FALSE.equals(r.get()), path + " complete false without Form 8962");
        }
    }

    /**
     * A Form 1095-A return whose /needsToFileForm8962 is unresolved, or whose only Form 1095-A was deleted after a
     * qualifying-plan yes, refuses even when the income-based special enrollment period answer is no.
     * /flowKnockoutForm8962NeededOrUnresolved is true because /form8962NeededOrUnresolved is true and
     * /needsToFileForm8962 is not complete true, so Schedule 2 line 1a is not printed blank in place of Form 8962
     * line 27 (Form 8962 (2026) draft, PDF p. 1, line 27).
     */
    @Test
    void unresolvedForm8962ReturnIsRefusedByThePrintPath() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        PdfService pdfService = CreditFormsTy2026PdfSmokeTest.pdfService(fgs);
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> facts = scenarioFacts(mapper, PTC_SCENARIO);
        FactTypeWithItem sepNo = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}", FactTypeWithItem.class);
        facts.put(SEP_ANSWER, sepNo);
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
        // no. "No" on the special enrollment period question does not clear the unresolved stop.
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
            assertEquals(Boolean.TRUE, graph.get("/form8962NeededOrUnresolved").get(), missing);
            assertEquals(Boolean.TRUE, graph.get(FORM_8962_UNRESOLVED_KNOCKOUT).get(), missing);
            assertEquals(Boolean.FALSE, graph.get(SEP_KNOCKOUT).get(), missing);
            assertEquals(Boolean.TRUE, graph.get("/flowIsKnockedOut").get(), missing);
            List<String> refused = PrintRefusingKnockouts.refusingPaths(graph);
            assertTrue(refused.contains(FORM_8962_UNRESOLVED_KNOCKOUT), missing + " " + refused);
            assertFalse(refused.contains("/flowKnockoutForm8962WithoutTy2026Template"), missing);
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
     * knockout stays incomplete, so the print is refused. Part III yes without an estate leaves line 37 and the
     * knockout incomplete, so the print is still refused and the income is not a silent zero. Part IV yes refuses
     * with the knockout true and leaves line 39 incomplete. Schedule SE line 2 stays Schedule C only. An answered no
     * does not refuse. An unanswered question refuses and leaves the Schedule E section incomplete.
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
        assertFalse(
                estate.get("/flowKnockoutScheduleEPartIII").complete(),
                "Part III yes without an estate stays incomplete");
        assertFalse(estate.get("/scheduleEPartIIILine37").complete(), "line 37 is not a silent zero");
        assertFalse(estate.get("/schedule1Line5").complete(), "Schedule 1 line 5 is not a silent zero");
        assertFalse(estate.get(SCHEDULE_E_PART_II_KNOCKOUT).complete(), "yes without an estate stays incomplete");
        assertEquals(List.of(SCHEDULE_E_PART_II_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(estate));

        Map<String, FactTypeWithItem> partIV = new HashMap<>(k1Only);
        partIV.put("/scheduleEHasPartIIIIncome", no);
        partIV.put("/scheduleEHasPartIVIncome", yes);
        Graph remic = fgs.getGraph(partIV);
        assertEquals(Boolean.TRUE, remic.get("/flowKnockoutScheduleEPartIV").get());
        assertEquals(Boolean.TRUE, remic.get(SCHEDULE_E_PART_II_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, remic.get("/flowIsKnockedOut").get());
        assertFalse(remic.get("/scheduleEPartIVLine39").complete(), "line 39 is not a silent zero");
        assertEquals(List.of(SCHEDULE_E_PART_II_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(remic));

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
     * deduction, is at or below" the threshold. The 2026 draft prints (#17). Sign and submit stay blocked: there is
     * no MeF mapping. A carryforward or cooperative yes, or an unanswered question, still refuses the print through
     * its own stop. Schedule C itself prints (#239).
     */
    @Test
    void form8995TemplatePrintsAndOtherQbiStopsStillRefuse() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> facts = scheduleCReturn("20000.00", "30000.00", "0.00");
        Graph computed = fgs.getGraph(facts);
        assertEquals(Boolean.FALSE, computed.get(QBI_ABOVE_THRESHOLD_KNOCKOUT).get(), "at or below the threshold");
        assertTrue(computed.get(QBI_ABOVE_THRESHOLD_KNOCKOUT).complete());
        assertEquals(Boolean.TRUE, computed.get("/form8995Required").get());
        assertEquals(Boolean.TRUE, computed.get(FORM_8995_KNOCKOUT).get(), "submission still blocked");
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(computed), "Form 8995 template prints");
        assertEquals(Boolean.TRUE, computed.get("/flowIsKnockedOut").get(), "submission is blocked too");
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        Map<String, FactTypeWithItem> carryforward = new HashMap<>(facts);
        carryforward.put("/qbiHasPriorYearLossCarryforward", yes);
        assertEquals(
                List.of(QBI_CARRYFORWARD_KNOCKOUT, SCHEDULE_C_QBI_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(carryforward)));
        Map<String, FactTypeWithItem> cooperative = new HashMap<>(facts);
        cooperative.put("/qbiIsCooperativePatron", yes);
        assertEquals(
                List.of(QBI_COOPERATIVE_KNOCKOUT, SCHEDULE_C_QBI_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(cooperative)));
        Map<String, FactTypeWithItem> unanswered = new HashMap<>(facts);
        unanswered.remove("/qbiHasPriorYearLossCarryforward");
        Graph open = fgs.getGraph(unanswered);
        List<String> unansweredPaths = PrintRefusingKnockouts.refusingPaths(open);
        assertTrue(unansweredPaths.contains(QBI_CARRYFORWARD_KNOCKOUT), "unanswered fails closed");
        assertTrue(unansweredPaths.contains(SCHEDULE_C_QBI_KNOCKOUT), "Schedule C knockout fails closed too");
        assertFalse(unansweredPaths.contains(FORM_8995_KNOCKOUT), "the template knockout is not a print refusal");
        assertEquals(Boolean.TRUE, open.get(FORM_8995_KNOCKOUT).get(), "Form 8995 is still required");
        Graph noScheduleC = fgs.getGraph(CreditFormsTy2026PdfSmokeTest.scenarioFacts(FORM_2210_SCENARIO));
        assertEquals(Boolean.FALSE, noScheduleC.get(SCHEDULE_C_QBI_KNOCKOUT).get());
        assertTrue(noScheduleC.get(SCHEDULE_C_QBI_KNOCKOUT).complete(), "complete false without Schedule C");
    }

    /** A Schedule C loss still files Form 8995: line 18 carries the loss forward (26 U.S.C. 199A(c)(2)). */
    @Test
    void form8995LossYearPrintsWhileSubmissionStaysBlocked() throws Exception {
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
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(loss));
        assertEquals(Boolean.TRUE, loss.get("/flowIsKnockedOut").get());
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
     * knockouts read: Schedule EIC (/pdfIncludeScheduleEic). Form 8995 prints (#17) even though
     * /flowKnockoutForm8995WithoutTy2026Template still blocks submission. Form 8962 prints when
     * /needsToFileForm8962 is true (#88). A Form 8962 scenario that leaves the income-based special enrollment period
     * question unanswered still refuses through that stop. Schedule C and Schedule 3-A print (#239): a business no
     * longer refuses on its own, and Form 1040 line 27a, 28 or 29 above $0 attaches Schedule 3-A instead of refusing.
     * None has a Form 8949
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
            boolean files8962 = form8962.complete() && Boolean.TRUE.equals(form8962.get());
            Result<Object> guard = graph.get("/form8962NeededOrUnresolved");
            if (guard.complete() && Boolean.TRUE.equals(guard.get()) && !files8962) {
                expected.add(FORM_8962_UNRESOLVED_KNOCKOUT);
            }
            if (files8962) {
                if (PTC_BELOW_100_SCENARIO.equals(file.getFilename())) {
                    expected.add("/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl");
                }
                Result<Object> sep = graph.get(SEP_ANSWER);
                if (!sep.complete() || Boolean.TRUE.equals(sep.get())) {
                    expected.add(SEP_KNOCKOUT);
                }
                form8962Refused++;
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
        // #239: a return whose only refusal was Schedule 3-A now prints. #17: a return whose only refusal was Form
        // 8995 now prints too. Qualifying-child EIC still stops on Schedule EIC.
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
     * Schedule SE lines 1a, 1b, 4b, Part II, 5a, 5b, checkbox A, and 8c. 26 U.S.C. 1402(a), 1402(a)(1), 1402(a)(8),
     * 1402(a)(14), 1402(c)(1), 1402(c)(4), 1402(e), 1402(g), 1402(j), and 1402(l). A return with no self-employment
     * income is complete false. An unanswered question while self-employment income is yes refuses the print. Every
     * answer no does not. Any yes refuses the print.
     */
    @Test
    void scheduleSeOutOfScopeRefusesPrintUntilEveryQuestionIsNo() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        FactTypeWithItem yes = mapper.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        String ko = SCHEDULE_SE_OUT_OF_SCOPE_KNOCKOUT;

        Graph absent = fgs.getGraph(SubmissionBlockingFactsTest.golden());
        assertTrue(absent.get(ko).complete(), "no self-employment income is complete");
        assertEquals(Boolean.FALSE, absent.get(ko).get());
        assertFalse(PrintRefusingKnockouts.refusingPaths(absent).contains(ko));

        Map<String, String> openFacts =
                new HashMap<>(ScheduleSETy2026PdfSmokeTest.selfEmployed("170000.00", "170000.00", "30000.00"));
        for (String path : List.of(
                "/hadFarmSelfEmploymentIncome",
                "/hadChurchEmployeeIncome",
                "/usesSeOptionalMethod",
                "/hasMinisterOrSeExemption",
                "/hasNotarySeExclusion",
                "/hadForm8919Wages")) {
            openFacts.remove(path);
        }
        Graph open = fgs.getGraph(smoke(openFacts));
        assertFalse(open.get(ko).complete(), "unanswered stays incomplete");
        assertTrue(PrintRefusingKnockouts.refusingPaths(open).contains(ko));

        Graph supported = fgs.getGraph(scheduleCOnly());
        assertTrue(supported.get(ko).complete());
        assertEquals(Boolean.FALSE, supported.get(ko).get());
        assertFalse(PrintRefusingKnockouts.refusingPaths(supported).contains(ko));
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(supported));
        assertEquals(Boolean.TRUE, supported.get(FORM_8995_KNOCKOUT).get(), "Form 8995 still blocks submission");

        Map<String, FactTypeWithItem> farmFacts = new HashMap<>(scheduleCOnly());
        farmFacts.put("/hadFarmSelfEmploymentIncome", yes);
        Graph farm = fgs.getGraph(farmFacts);
        assertEquals(Boolean.TRUE, farm.get(ko).get());
        assertEquals(Boolean.TRUE, farm.get("/flowIsKnockedOut").get());
        assertTrue(PrintRefusingKnockouts.refusingPaths(farm).contains(ko));
    }

    /**
     * #17: Form 8995 prints (2026 draft, ASN 55). #87: the same fact still blocks sign and submit because there is no
     * MeF mapping (Instructions for Form 1040 (2025) draft, PDF p. 35, "Attach whichever form you use (Form 8995 or
     * 8995-A) to your return."). Schedule C itself prints (#239). An ACTC return (2026 draft Form 1040 lines 32a-32c,
     * "attach Sch. 3-A") is not refused: Schedule 3-A prints.
     */
    @Test
    void scheduleCReturnPrintsWhileForm8995StillBlocksSubmission() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Graph business = fgs.getGraph(scheduleCOnly());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(business));
        assertEquals(Boolean.TRUE, business.get(FORM_8995_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, business.get("/flowIsKnockedOut").get(), "Form 8995 in /flowIsKnockedOut");
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

    /**
     * A Schedule C return that is not a PA-40 prints, including Form 8995 (#17). The same business on a full-year
     * PA-40 reports federal Schedule C line 31 on PA-40 line 4 (72 P.S. §7303(a)(2); PA-40 IN (2025) p. 17, LINE 4;
     * PA-40 C (EX) 03-26). The PA unsupported-income knockout is false on that supported path when the tax-shelter
     * screener is no. PA Schedule C is required and not produced, so /flowKnockoutPaScheduleC refuses the print
     * Form 8995 prints and still blocks submission (no MeF mapping). The UE, unsupported-items, and tax-shelter screeners are answered no;
     * unanswered, those stops stay incomplete and refuse the print. This W-2 has no box 16, so PA taxable income is $0
     * and Tax Forgiveness is still possible (72 P.S. §7304). The Schedule SP nontaxable-income screener is answered no
     * for the same reason. The federal Schedule C PDF is not the PA schedule.
     */
    @Test
    void paScheduleCReportsLine4AndRefusesOnForm8995() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Graph notPa = fgs.getGraph(scheduleCOnly());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(notPa));
        assertEquals(Boolean.TRUE, notPa.get(FORM_8995_KNOCKOUT).get());
        assertCompleteFalse(notPa, PA_UNSUPPORTED_INCOME_KNOCKOUT);
        assertCompleteFalse(notPa, PA_SCHEDULE_C_KNOCKOUT);

        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> facts = scheduleCOnly();
        facts.put(
                "/filerResidenceAndIncomeState",
                mapper.readValue(
                        PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue("pa", "/scopedStateOptions"),
                        FactTypeWithItem.class));
        // Box 16 is required on a PA-40; scheduleCOnly's W-2 otherwise has wages with no state wages and would
        // trip /formW2s/*/paMissingStateWages.
        facts.put(
                "/formW2s/#" + ScheduleSETy2026PdfSmokeTest.W2 + "/writableStateWages",
                mapper.readValue(ScheduleATy2026PdfSmokeTest.dollar("170000.00"), FactTypeWithItem.class));
        facts.put(
                "/paHasUnreimbursedEmployeeExpenses",
                mapper.readValue(ScheduleATy2026PdfSmokeTest.bool(false), FactTypeWithItem.class));
        facts.put(
                "/paHasUnsupportedItems",
                mapper.readValue(ScheduleATy2026PdfSmokeTest.bool(false), FactTypeWithItem.class));
        facts.put(
                "/paHasEstimatedInstallmentPayments",
                mapper.readValue(ScheduleATy2026PdfSmokeTest.bool(false), FactTypeWithItem.class));
        facts.put(
                "/paHasScheduleCTaxShelter",
                mapper.readValue(ScheduleATy2026PdfSmokeTest.bool(false), FactTypeWithItem.class));
        facts.put(
                "/paHasSpNontaxableIncome",
                mapper.readValue(ScheduleATy2026PdfSmokeTest.bool(false), FactTypeWithItem.class));
        Graph pa = fgs.getGraph(facts);
        assertEquals(Boolean.TRUE, pa.get("/stateReturnPaFiled").get());
        assertEquals(Boolean.TRUE, pa.get("/hasScheduleCBusinesses").get());
        assertEquals(Boolean.FALSE, pa.get(PA_UNSUPPORTED_INCOME_KNOCKOUT).get());
        assertTrue(pa.get(PA_UNSUPPORTED_INCOME_KNOCKOUT).complete());
        assertEquals(Boolean.TRUE, pa.get(PA_SCHEDULE_C_KNOCKOUT).get());
        assertTrue(pa.get(PA_SCHEDULE_C_KNOCKOUT).complete());
        assertCompleteFalse(pa, PA_UE_KNOCKOUT);
        assertCompleteFalse(pa, PA_UNSUPPORTED_ITEMS_KNOCKOUT);
        assertCompleteFalse(pa, PA_SP_KNOCKOUT);
        assertEquals(Boolean.TRUE, pa.get(FORM_8995_KNOCKOUT).get());
        assertEquals(List.of(PA_SCHEDULE_C_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(pa));
        // scheduleCOnly: receipts $30,000, expenses $0 → federal line 31 and PA-40 line 4 are $30,000.
        assertEquals("30000.00", pa.get("/paLine4").get().toString());
    }

    static final List<String> DIVIDEND_PRINT_KNOCKOUTS = List.of(
            DIVIDEND_UNSUPPORTED_BOXES_KNOCKOUT,
            DIVIDEND_OVER_BASIS_KNOCKOUT,
            DIVIDEND_HOLDING_PERIOD_KNOCKOUT,
            DIVIDEND_SECTION_199A_KNOCKOUT,
            DIVIDEND_FOREIGN_TAX_KNOCKOUT,
            DIVIDEND_NOMINEE_KNOCKOUT,
            DIVIDEND_INCONSISTENT_KNOCKOUT,
            SCHEDULE_B_PART_III_PRINT_REFUSE);

    static void putJson(Map<String, FactTypeWithItem> facts, ObjectMapper mapper, String path, String json)
            throws Exception {
        facts.put(path, mapper.readValue(json, FactTypeWithItem.class));
    }

    /** Boxes 1a, 1b, 2a and 4 on the golden 1099-DIV, Part III answered "No". */
    static Map<String, FactTypeWithItem> commonDividendReturn(ObjectMapper mapper) throws Exception {
        Map<String, FactTypeWithItem> facts = SubmissionBlockingFactsTest.golden();
        String div = "/dividendReports/#" + DIVIDEND_ID;
        putJson(facts, mapper, div + "/writableCapitalGainDistributions", ScheduleATy2026PdfSmokeTest.dollar("500.00"));
        putJson(facts, mapper, div + "/writableFederalTaxWithheld", ScheduleATy2026PdfSmokeTest.dollar("40.00"));
        return facts;
    }

    /**
     * #86. Form 1040 line 3b is ordinary dividends (box 1a), line 3a is qualified dividends (box 1b), and box 2a goes
     * through the QDCG worksheet. Box 4 is line 25b. Schedule B Part II is required when line 3b is over $1,500.
     * Out-of-scope boxes stop the print. Line 7a "Yes" with question 2 unanswered stops the print and does not knock
     * the interview out. Line 8 "Yes" and Form 8938 "Yes" knock the return out. A supported line 7a "Yes" (question 2
     * answered, countries when FinCEN Form 114 is required, Form 8938 "No", line 8 "No") prints. Part III "No"
     * prints, including when ordinary dividends are exactly $1,500 and Schedule B is not required.
     */
    @Test
    void dividendCommonPathPrintsAndOutOfScopeRefuses() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        ObjectMapper mapper = new ObjectMapper();
        String div = "/dividendReports/#" + DIVIDEND_ID;
        Graph common = fgs.getGraph(commonDividendReturn(mapper));
        assertEquals("1000000.00", common.get("/ordinaryDividends").get().toString(), "line 3b");
        assertEquals("1000000.00", common.get("/qualifiedDividends").get().toString(), "line 3a");
        assertEquals("1000000.00", common.get("/qdcgLine2").get().toString(), "QDCG line 2");
        assertEquals(
                Boolean.TRUE,
                common.get("/capitalGainDistributionsWithoutScheduleD").get());
        assertEquals("500.00", common.get("/capitalGainsOrLosses").get().toString(), "line 7a");
        assertEquals("500.00", common.get("/qdcgLine3").get().toString(), "QDCG line 3");
        assertEquals(
                "40.00", common.get("/totalDividendFederalTaxWithheld").get().toString(), "box 4");
        assertEquals(
                Boolean.TRUE,
                common.get("/requiresScheduleBForOrdinaryDividends").get());
        assertEquals(Boolean.TRUE, common.get("/requiresScheduleB").get());
        assertEquals(Boolean.TRUE, common.get("/scheduleBPartIIIAnswered").get());
        for (String path : DIVIDEND_PRINT_KNOCKOUTS) {
            assertCompleteFalse(common, path);
        }
        assertCompleteFalse(common, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(common), "supported 1099-DIV prints");
        assertEquals(Boolean.FALSE, common.get("/flowIsKnockedOut").get());

        Map<String, FactTypeWithItem> boxes = commonDividendReturn(mapper);
        putJson(boxes, mapper, div + "/hasUnsupportedBoxes", ScheduleATy2026PdfSmokeTest.bool(true));
        assertEquals(
                List.of(DIVIDEND_UNSUPPORTED_BOXES_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(boxes)));

        Map<String, FactTypeWithItem> overBasis = commonDividendReturn(mapper);
        putJson(
                overBasis,
                mapper,
                div + "/writableNondividendDistributions",
                ScheduleATy2026PdfSmokeTest.dollar("10.00"));
        putJson(
                overBasis,
                mapper,
                div + "/nondividendDistributionsExceedBasis",
                ScheduleATy2026PdfSmokeTest.bool(true));
        assertEquals(
                List.of(DIVIDEND_OVER_BASIS_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(fgs.getGraph(overBasis)));

        Map<String, FactTypeWithItem> holding = commonDividendReturn(mapper);
        putJson(
                holding,
                mapper,
                div + "/qualifiedDividendsHoldingPeriodNotMet",
                ScheduleATy2026PdfSmokeTest.bool(true));
        assertEquals(
                List.of(DIVIDEND_HOLDING_PERIOD_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(fgs.getGraph(holding)));

        Map<String, FactTypeWithItem> section199a = commonDividendReturn(mapper);
        putJson(
                section199a,
                mapper,
                div + "/writableSection199ADividends",
                ScheduleATy2026PdfSmokeTest.dollar("100.00"));
        assertEquals(
                List.of(DIVIDEND_SECTION_199A_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(section199a)));

        Map<String, FactTypeWithItem> foreignTax = commonDividendReturn(mapper);
        putJson(foreignTax, mapper, div + "/writableForeignTaxPaid", ScheduleATy2026PdfSmokeTest.dollar("301.00"));
        putJson(foreignTax, mapper, div + "/foreignTaxElectionRequirementsMet", ScheduleATy2026PdfSmokeTest.bool(true));
        assertEquals(
                List.of(DIVIDEND_FOREIGN_TAX_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(fgs.getGraph(foreignTax)));

        Map<String, FactTypeWithItem> nominee = commonDividendReturn(mapper);
        putJson(nominee, mapper, div + "/receivedAsNominee", ScheduleATy2026PdfSmokeTest.bool(true));
        assertEquals(List.of(DIVIDEND_NOMINEE_KNOCKOUT), PrintRefusingKnockouts.refusingPaths(fgs.getGraph(nominee)));

        Map<String, FactTypeWithItem> inconsistent = commonDividendReturn(mapper);
        putJson(
                inconsistent,
                mapper,
                div + "/writableQualifiedDividends",
                ScheduleATy2026PdfSmokeTest.dollar("1000001.00"));
        assertEquals(
                List.of(DIVIDEND_INCONSISTENT_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(fgs.getGraph(inconsistent)));

        Map<String, FactTypeWithItem> foreignAccount = commonDividendReturn(mapper);
        putJson(foreignAccount, mapper, "/hasForeignAccounts", ScheduleATy2026PdfSmokeTest.bool(true));
        Graph yes = fgs.getGraph(foreignAccount);
        assertEquals(Boolean.FALSE, yes.get("/scheduleBPartIIIAnswered").get());
        assertEquals(Boolean.TRUE, yes.get(SCHEDULE_B_PART_III_PRINT_REFUSE).get());
        assertCompleteFalse(yes, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertNotFlowKnockedOut(yes);
        assertEquals(List.of(SCHEDULE_B_PART_III_PRINT_REFUSE), PrintRefusingKnockouts.refusingPaths(yes));

        Map<String, FactTypeWithItem> fbar = commonDividendReturn(mapper);
        putJson(fbar, mapper, "/hasForeignAccounts", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(fbar, mapper, "/requiredToFileFinCENForm114", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(fbar, mapper, "/foreignAccountCountryLine1", ScheduleATy2026PdfSmokeTest.string("France"));
        putJson(fbar, mapper, "/foreignAccountCountryLine2", ScheduleATy2026PdfSmokeTest.string("Japan"));
        putJson(fbar, mapper, "/foreignAccountCountriesFitOnLine7b", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(fbar, mapper, "/requiredToFileForm8938", ScheduleATy2026PdfSmokeTest.bool(false));
        Graph printed = fgs.getGraph(fbar);
        assertEquals("France", printed.get("/scheduleBLine7bCountryLine1").get());
        assertEquals("Japan", printed.get("/scheduleBLine7bCountryLine2").get());
        assertEquals(Boolean.TRUE, printed.get("/scheduleBLine7aQuestion2Yes").get());
        assertCompleteFalse(printed, SCHEDULE_B_PART_III_PRINT_REFUSE);
        assertCompleteFalse(printed, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertEquals(Boolean.FALSE, printed.get("/flowIsKnockedOut").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(printed), "7a Yes with Q2 and countries prints");

        Map<String, FactTypeWithItem> countriesFitNo = commonDividendReturn(mapper);
        putJson(countriesFitNo, mapper, "/hasForeignAccounts", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(countriesFitNo, mapper, "/requiredToFileFinCENForm114", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(countriesFitNo, mapper, "/foreignAccountCountryLine1", ScheduleATy2026PdfSmokeTest.string("France"));
        putJson(countriesFitNo, mapper, "/foreignAccountCountriesFitOnLine7b", ScheduleATy2026PdfSmokeTest.bool(false));
        Graph needStatement = fgs.getGraph(countriesFitNo);
        assertEquals(Boolean.TRUE, needStatement.get("/scheduleBPartIIIOutOfScope").get());
        assertEquals(Boolean.TRUE, needStatement.get(SCHEDULE_B_PART_III_PRINT_REFUSE).get());
        assertEquals(Boolean.TRUE, needStatement.get(SCHEDULE_B_PART_III_FLOW_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, needStatement.get("/flowIsKnockedOut").get());
        assertEquals(
                List.of(SCHEDULE_B_PART_III_PRINT_REFUSE), PrintRefusingKnockouts.refusingPaths(needStatement));

        Map<String, FactTypeWithItem> countriesFitOpen = commonDividendReturn(mapper);
        putJson(countriesFitOpen, mapper, "/hasForeignAccounts", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(countriesFitOpen, mapper, "/requiredToFileFinCENForm114", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(countriesFitOpen, mapper, "/foreignAccountCountryLine1", ScheduleATy2026PdfSmokeTest.string("France"));
        Graph fitUnanswered = fgs.getGraph(countriesFitOpen);
        assertEquals(Boolean.FALSE, fitUnanswered.get("/scheduleBPartIIIAnswered").get());
        assertEquals(Boolean.TRUE, fitUnanswered.get(SCHEDULE_B_PART_III_PRINT_REFUSE).get());
        assertCompleteFalse(fitUnanswered, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertNotFlowKnockedOut(fitUnanswered);
        assertEquals(
                List.of(SCHEDULE_B_PART_III_PRINT_REFUSE), PrintRefusingKnockouts.refusingPaths(fitUnanswered));

        Map<String, FactTypeWithItem> form8938 = commonDividendReturn(mapper);
        putJson(form8938, mapper, "/hasForeignAccounts", ScheduleATy2026PdfSmokeTest.bool(true));
        putJson(form8938, mapper, "/requiredToFileFinCENForm114", ScheduleATy2026PdfSmokeTest.bool(false));
        putJson(form8938, mapper, "/requiredToFileForm8938", ScheduleATy2026PdfSmokeTest.bool(true));
        Graph form8938Yes = fgs.getGraph(form8938);
        assertEquals(
                Boolean.TRUE, form8938Yes.get(SCHEDULE_B_PART_III_PRINT_REFUSE).get());
        assertEquals(
                Boolean.TRUE, form8938Yes.get(SCHEDULE_B_PART_III_FLOW_KNOCKOUT).get());
        assertEquals(Boolean.TRUE, form8938Yes.get("/flowIsKnockedOut").get());
        assertEquals(List.of(SCHEDULE_B_PART_III_PRINT_REFUSE), PrintRefusingKnockouts.refusingPaths(form8938Yes));

        Map<String, FactTypeWithItem> unanswered = commonDividendReturn(mapper);
        unanswered.remove("/hasForeignAccounts");
        unanswered.remove("/isForeignTrustsGrantor");
        unanswered.remove("/hasForeignTrustsTransactions");
        Graph open = fgs.getGraph(unanswered);
        assertEquals(Boolean.FALSE, open.get("/scheduleBPartIIIAnswered").get());
        assertEquals(Boolean.TRUE, open.get(SCHEDULE_B_PART_III_PRINT_REFUSE).get());
        assertCompleteFalse(open, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertNotFlowKnockedOut(open);
        assertEquals(List.of(SCHEDULE_B_PART_III_PRINT_REFUSE), PrintRefusingKnockouts.refusingPaths(open));

        Map<String, FactTypeWithItem> under = commonDividendReturn(mapper);
        putJson(under, mapper, div + "/ordinaryDividends", ScheduleATy2026PdfSmokeTest.dollar("1500.00"));
        putJson(under, mapper, div + "/writableQualifiedDividends", ScheduleATy2026PdfSmokeTest.dollar("1500.00"));
        putJson(under, mapper, div + "/writableCapitalGainDistributions", ScheduleATy2026PdfSmokeTest.dollar("0.00"));
        under.remove("/hasForeignAccounts");
        under.remove("/isForeignTrustsGrantor");
        under.remove("/hasForeignTrustsTransactions");
        Graph atLimit = fgs.getGraph(under);
        assertEquals("1500.00", atLimit.get("/ordinaryDividends").get().toString());
        assertEquals(
                Boolean.FALSE,
                atLimit.get("/requiresScheduleBForOrdinaryDividends").get());
        assertEquals(Boolean.FALSE, atLimit.get("/scheduleBPartIIIAnswered").get());
        assertEquals(Boolean.TRUE, atLimit.get(SCHEDULE_B_PART_III_PRINT_REFUSE).get());
        assertCompleteFalse(atLimit, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertNotFlowKnockedOut(atLimit);
        assertEquals(List.of(SCHEDULE_B_PART_III_PRINT_REFUSE), PrintRefusingKnockouts.refusingPaths(atLimit));

        Map<String, FactTypeWithItem> atLimitNoFacts = commonDividendReturn(mapper);
        putJson(atLimitNoFacts, mapper, div + "/ordinaryDividends", ScheduleATy2026PdfSmokeTest.dollar("1500.00"));
        putJson(
                atLimitNoFacts,
                mapper,
                div + "/writableQualifiedDividends",
                ScheduleATy2026PdfSmokeTest.dollar("1500.00"));
        putJson(
                atLimitNoFacts,
                mapper,
                div + "/writableCapitalGainDistributions",
                ScheduleATy2026PdfSmokeTest.dollar("0.00"));
        Graph answeredNo = fgs.getGraph(atLimitNoFacts);
        assertEquals("1500.00", answeredNo.get("/ordinaryDividends").get().toString());
        assertEquals(
                Boolean.FALSE,
                answeredNo.get("/requiresScheduleBForOrdinaryDividends").get());
        assertEquals(Boolean.TRUE, answeredNo.get("/scheduleBPartIIIAnswered").get());
        assertCompleteFalse(answeredNo, SCHEDULE_B_PART_III_PRINT_REFUSE);
        assertCompleteFalse(answeredNo, SCHEDULE_B_PART_III_FLOW_KNOCKOUT);
        assertEquals(Boolean.FALSE, answeredNo.get("/flowIsKnockedOut").get());
        assertEquals(
                List.of(), PrintRefusingKnockouts.refusingPaths(answeredNo), "exactly $1,500 with Part III No prints");
    }

    /** Unanswered Part III leaves /flowIsKnockedOut incomplete or false. It must not be a complete true. */
    private static void assertNotFlowKnockedOut(Graph graph) {
        Result<Object> knockedOut = graph.get("/flowIsKnockedOut");
        assertFalse(knockedOut.complete() && Boolean.TRUE.equals(knockedOut.get()), "/flowIsKnockedOut");
    }
}
