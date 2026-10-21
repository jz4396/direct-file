package gov.irs.directfile.api.loaders.domain;

import java.util.*;

import lombok.Getter;

@Getter
public class TaxDictionaryDigest {

    private final String sourceName;
    private final Map<String, TaxFact> facts;
    private final Set<String> exportZeroFacts;
    /** Every fact marked {@code <BlockSubmissionOnTrue />}, sorted by path. */
    private final List<TaxFact> submissionBlockingFacts;
    /**
     * The "top-level" submission-blocking facts: those that are not a direct {@code <Dependency>} of another
     * submission-blocking fact. Each must have the value {@code false} for a return to be signed or submitted; no value
     * or an evaluation error refuses. The others are inputs to a blocking aggregate (for example the knockouts in
     * {@code /flowIsKnockedOut}) and refuse only when {@code true}.
     */
    private final Set<String> submissionBlockingFactsRequiringValue;

    private final List<TaxFact> exportToStatesFacts;

    public TaxDictionaryDigest(String sourceName, Map<String, TaxFact> facts) {
        this.sourceName = sourceName;
        this.facts = Map.copyOf(facts);

        exportZeroFacts = new HashSet<>();
        List<TaxFact> blocking = new ArrayList<>();
        exportToStatesFacts = new ArrayList<>();

        this.facts.values().forEach(taxFact -> {
            if (taxFact.exportZero()) {
                exportZeroFacts.add(taxFact.path());
            }
            if (taxFact.blockSubmissionOnTrue()) {
                blocking.add(taxFact);
            }
            if (taxFact.export() != null
                    && taxFact.export().options() != null
                    && taxFact.export().options().stateSystems()) {
                exportToStatesFacts.add(taxFact);
            }
        });

        blocking.sort(Comparator.comparing(TaxFact::path));
        submissionBlockingFacts = List.copyOf(blocking);
        submissionBlockingFactsRequiringValue = Set.copyOf(topLevelBlockingFacts(submissionBlockingFacts));
    }

    /**
     * Blocking facts that no other blocking fact names in a {@code <Dependency path>} of its Derived or Placeholder.
     * The client generator (df-client generate.ts) applies the same rule to the same XML.
     */
    static Set<String> topLevelBlockingFacts(List<TaxFact> blocking) {
        Set<String> blockingPaths = new HashSet<>();
        blocking.forEach(f -> blockingPaths.add(f.path()));
        Set<String> covered = new HashSet<>();
        for (TaxFact fact : blocking) {
            Set<String> deps = new HashSet<>();
            collectDependencyPaths(fact.derived(), deps);
            collectDependencyPaths(fact.placeholder(), deps);
            deps.remove(fact.path());
            deps.retainAll(blockingPaths);
            covered.addAll(deps);
        }
        Set<String> top = new TreeSet<>(blockingPaths);
        top.removeAll(covered);
        return top;
    }

    private static void collectDependencyPaths(TaxCompNode node, Set<String> out) {
        if (node == null) {
            return;
        }
        if ("Dependency".equals(node.typeName()) && node.options().get("path") != null) {
            out.add(node.options().get("path"));
        }
        node.children().forEach(child -> collectDependencyPaths(child, out));
    }
}
