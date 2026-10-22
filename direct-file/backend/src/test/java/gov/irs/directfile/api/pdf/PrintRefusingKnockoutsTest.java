package gov.irs.directfile.api.pdf;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.test.util.ReflectionTestUtils;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.loaders.service.FactGraphService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The print path fails closed: a listed knockout prints only when it is complete and false. Incomplete, missing from
 * the dictionary, or failing evaluation refuses the print exactly as true does (the true case through the real print
 * path is ScheduleDForm8949PdfSmokeTest#codeQReturnIsRefusedByThePrintPath).
 */
class PrintRefusingKnockoutsTest {
    static final String CODE_Q = "/flowKnockoutForm8949CodeQ";
    static Graph emptyReturn;

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

    @Test
    void theListedKnockoutsAreCompleteAndFalseOnAnEmptyReturn() {
        assertTrue(PdfService.PRINT_REFUSING_KNOCKOUTS.contains(CODE_Q));
        assertEquals(List.of(), PrintRefusingKnockouts.refusing(emptyReturn, PdfService.PRINT_REFUSING_KNOCKOUTS));
    }

    @Test
    void anIncompleteKnockoutRefusesThePrint() {
        // /soldCollectibles is a writable boolean with no answer on an empty return, so it is incomplete.
        assertEquals(
                List.of("/soldCollectibles"),
                PrintRefusingKnockouts.refusing(emptyReturn, List.of(CODE_Q, "/soldCollectibles")));
    }

    @Test
    void aKnockoutMissingFromTheDictionaryRefusesThePrint() {
        assertEquals(
                List.of("/noSuchPrintKnockout"),
                PrintRefusingKnockouts.refusing(emptyReturn, List.of("/noSuchPrintKnockout", CODE_Q)));
    }

    @Test
    void aKnockoutThatFailsEvaluationRefusesThePrint() {
        Graph failing = mock(Graph.class);
        when(failing.get(anyString())).thenThrow(new IllegalStateException("evaluation failed"));
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusing(failing, List.of(CODE_Q)));

        Graph noResult = mock(Graph.class);
        when(noResult.get(anyString())).thenReturn(null);
        assertEquals(List.of(CODE_Q), PrintRefusingKnockouts.refusing(noResult, List.of(CODE_Q)));
    }

    @Test
    void aNonBooleanFactRefusesThePrint() {
        // /taxYear is complete but not a boolean, so it cannot say "no knockout".
        assertEquals(List.of("/taxYear"), PrintRefusingKnockouts.refusing(emptyReturn, List.of("/taxYear")));
    }
}
