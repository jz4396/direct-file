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
    void listHoldsTheCodeQScheduleEicAndPaScheduleNrhKnockouts() {
        assertEquals(
                List.of(CODE_Q_KNOCKOUT, SCHEDULE_EIC_KNOCKOUT, PA_NRH_KNOCKOUT), PrintRefusingKnockouts.FACT_PATHS);
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
        assertEquals(111, printed, "scenarios that print");
    }
}
