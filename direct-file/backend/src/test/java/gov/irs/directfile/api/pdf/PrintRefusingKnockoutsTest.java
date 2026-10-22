package gov.irs.directfile.api.pdf;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import org.junit.jupiter.api.Test;
import scala.Option;

import gov.irs.factgraph.monads.Result;

import gov.irs.directfile.api.loaders.domain.TaxFact;
import gov.irs.directfile.api.loaders.service.FactGraphService;

import static org.junit.jupiter.api.Assertions.*;

/** The shared list of knockouts that stop the printed package, and how its true paths are found. */
class PrintRefusingKnockoutsTest {
    static final String SCHEDULE_EIC_KNOCKOUT = "/flowKnockoutScheduleEicWithoutTy2026Template";

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
                throw new IllegalStateException("cannot evaluate");
            }
            return results.get(path);
        };
    }

    @Test
    void listHoldsTheScheduleEicKnockout() {
        assertEquals(List.of(SCHEDULE_EIC_KNOCKOUT), PrintRefusingKnockouts.FACT_PATHS);
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

    @Test
    void returnsEveryTruePathInListOrder() {
        List<String> paths = List.of("/a", "/b", "/c", "/d", "/e", "/throws", "/f");
        Map<String, Result<Object>> results = Map.of(
                "/a", complete(true),
                "/b", complete(false),
                "/c", placeholder(true),
                "/d", incomplete(),
                "/e", placeholder(false),
                "/f", complete(true));
        assertEquals(List.of("/a", "/c", "/throws", "/f"), PrintRefusingKnockouts.truePaths(paths, evaluator(results)));
    }

    @Test
    void returnsNothingWhenNoKnockoutIsTrue() {
        List<String> paths = List.of("/a", "/b", "/missing");
        Map<String, Result<Object>> results = Map.of("/a", complete(false), "/b", incomplete());
        assertEquals(List.of(), PrintRefusingKnockouts.truePaths(paths, evaluator(results)));
        assertEquals(List.of(), PrintRefusingKnockouts.truePaths(List.of(), evaluator(results)));
    }
}
