package gov.irs.directfile.api.pdf;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.test.util.ReflectionTestUtils;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

import gov.irs.directfile.api.loaders.service.FactGraphService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The print path fails closed: a listed knockout lets the return print only when it is complete and false.
 * Incomplete, missing from the dictionary, not a boolean, or failing evaluation counts as true, and the warning names
 * the fact path only. The true case through the real print path is
 * ScheduleDForm8949PdfSmokeTest#codeQReturnIsRefusedByThePrintPath.
 */
class PrintRefusingKnockoutsTest {
    static final String CODE_Q = "/flowKnockoutForm8949CodeQ";
    static final String SECRET = "exception-text-sentinel-5521";
    static Graph emptyReturn;

    Logger logger = (Logger) LoggerFactory.getLogger(PrintRefusingKnockouts.class);
    ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeAll
    static void loadDictionary() throws Exception {
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.refresh();
        FactGraphService factGraphService = new FactGraphService(new ObjectMapper(), ctx);
        ReflectionTestUtils.setField(factGraphService, "loadAtStartup", true);
        ReflectionTestUtils.setField(factGraphService, "factDictionaryXmlPattern", "classpath:/tax/*.xml");
        Method init = FactGraphService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(factGraphService);
        emptyReturn = factGraphService.getGraph(Map.of());
    }

    @BeforeEach
    void captureLogs() {
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void releaseLogs() {
        logger.detachAppender(logs);
    }

    static List<String> onEmptyReturn(String... paths) {
        return PrintRefusingKnockouts.refusingPaths(List.of(paths), path -> emptyReturn.get(path));
    }

    /** Every warning names exactly the expected paths and carries no value, exception or exception text. */
    void assertWarnedPathsOnly(List<String> paths) {
        assertEquals(paths.size(), logs.list.size(), logs.list::toString);
        for (int i = 0; i < paths.size(); i++) {
            ILoggingEvent event = logs.list.get(i);
            String message = event.getFormattedMessage();
            assertEquals(List.of(paths.get(i)), List.of(event.getArgumentArray()), message);
            assertNull(event.getThrowableProxy(), message);
            assertFalse(message.contains(SECRET), message);
            assertFalse(message.contains("Exception"), message);
            assertFalse(message.contains("2026"), message);
        }
    }

    @Test
    void theListedKnockoutsAreCompleteAndFalseOnAnEmptyReturn() {
        assertTrue(PrintRefusingKnockouts.FACT_PATHS.contains(CODE_Q));
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(emptyReturn));
        assertWarnedPathsOnly(List.of());
    }

    @Test
    void anIncompleteKnockoutCountsAsTrue() {
        // /soldCollectibles is a writable boolean with no answer on an empty return, so it is incomplete.
        assertEquals(List.of("/soldCollectibles"), onEmptyReturn(CODE_Q, "/soldCollectibles"));
        assertWarnedPathsOnly(List.of("/soldCollectibles"));
    }

    @Test
    void aKnockoutMissingFromTheDictionaryCountsAsTrue() {
        assertEquals(List.of("/noSuchPrintKnockout"), onEmptyReturn("/noSuchPrintKnockout", CODE_Q));
        assertWarnedPathsOnly(List.of("/noSuchPrintKnockout"));
    }

    @Test
    void aKnockoutThatFailsEvaluationCountsAsTrue() {
        Function<String, Result<Object>> failing = path -> {
            throw new IllegalStateException(SECRET);
        };
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusingPaths(List.of(CODE_Q), failing));
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusingPaths(List.of(CODE_Q), path -> null));
        assertWarnedPathsOnly(List.of(CODE_Q, CODE_Q));
    }

    @Test
    void aNonBooleanFactCountsAsTrueWithoutLoggingItsValue() {
        // /taxYear is complete (2026) but not a boolean, so it cannot say "no knockout".
        assertEquals(List.of("/taxYear"), onEmptyReturn("/taxYear"));
        assertWarnedPathsOnly(List.of("/taxYear"));
    }

    @Test
    void onlyCompleteFalsePrintsAndPlaceholdersRefuse() {
        Result<Object> completeFalse = Result.apply(Boolean.FALSE, true);
        Result<Object> completeTrue = Result.apply(Boolean.TRUE, true);
        Result<Object> placeholderFalse = Result.apply(Boolean.FALSE, false);
        Result<Object> placeholderTrue = Result.apply(Boolean.TRUE, false);
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(List.of(CODE_Q), path -> completeFalse));
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusingPaths(List.of(CODE_Q), path -> completeTrue));
        assertWarnedPathsOnly(List.of()); // a true knockout is the expected refusal, not a warning
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusingPaths(List.of(CODE_Q), path -> placeholderFalse));
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusingPaths(List.of(CODE_Q), path -> placeholderTrue));
        assertWarnedPathsOnly(List.of(CODE_Q, CODE_Q));
    }
}
