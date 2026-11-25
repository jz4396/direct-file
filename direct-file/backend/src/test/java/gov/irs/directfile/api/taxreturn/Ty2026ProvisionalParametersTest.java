package gov.irs.directfile.api.taxreturn;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards {@code ty2026.json} provisional flags (issue 125).
 *
 * <p>A parameter, or a pendingReview entry, whose every form or instruction cite is {@code draft} or
 * {@code priorYear} must have {@code provisional}. A statute or Rev. Proc. cite alone counts as final.
 * {@code provisional} on a fact that already has a final form or instruction cite is stale. Every source
 * needs {@code kind} ({@code final}, {@code draft}, {@code priorYear}, {@code statute}, or {@code revProc}).
 * The success test prints the re-pin checklist.
 *
 * <p>Mirrors df-client-app {@code src/fact-dictionary/yearConfig/provisional.ts}. A form or instruction cite
 * is {@code draft}, {@code priorYear}, or {@code final} when the title is a form, instructions, schedule, or
 * booklet. Other {@code final} sources are not form cites.
 */
class Ty2026ProvisionalParametersTest {

    private static final Pattern FORM_TITLE =
            Pattern.compile("\\b(form|instructions|schedule|booklet)\\b", Pattern.CASE_INSENSITIVE);

    private static final Set<String> KINDS = Set.of("final", "draft", "priorYear", "statute", "revProc");

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void shippedFileMatchesTheGuardAndPrintsTheChecklist() throws Exception {
        JsonNode root = load();
        String text = checklistText(root);
        // The checklist is the re-pin sweep's list; it has to show up in the test output.
        System.out.println(text);
        assertEquals(List.of(), findings(root), text);

        List<String> lines = checklistLines(root);
        int flagged = countProvisional(root.get("parameters")) + countProvisional(root.get("pendingReview"));
        assertEquals(flagged, lines.size());
        for (String path : List.of(
                "/ksTaxTableLimit",
                "/idFoodTaxCreditPerFiler",
                "/maTaxTableThreshold",
                "/ilExemptionAgiLimit",
                "/azTaxRate",
                "/ncStandardDeductionHoh",
                "/form6251RateOffset",
                "/socialSecurityBenefitsWkshtLine10",
                "/netInvestmentIncomeThresholdForMfs",
                "/seOptionalMethodMaximumIncome")) {
            assertTrue(lines.stream().anyMatch(line -> line.startsWith("- " + path + " (")), path);
        }
        assertTrue(lines.stream().anyMatch(line -> line.startsWith("- /MFSFilingThresholdAmount pendingReview")));
        assertFalse(text.contains("/statusBasedDisabilityIncome"));
        assertFalse(find(root.get("parameters"), "/maxCtcAmount").has("provisional"));
    }

    @Test
    void missingProvisionalOnAnInterimFormCiteFails() throws Exception {
        JsonNode root = load();
        find((ObjectNode) root, "parameters", "/form6251RateOffset").remove("provisional");
        assertEquals(
                List.of(
                        "/form6251RateOffset: every form or instruction cite is draft or priorYear, but provisional is missing"),
                findings(root));
    }

    @Test
    void provisionalOnAFinalFormCiteIsStale() throws Exception {
        JsonNode root = load();
        ObjectNode flag = mapper.createObjectNode();
        flag.put("reason", "stale");
        flag.put("repinFrom", "nowhere");
        flag.put("tracking", "#91");
        find((ObjectNode) root, "parameters", "/statusBasedDisabilityIncome").set("provisional", flag);
        assertEquals(
                List.of("/statusBasedDisabilityIncome: provisional is stale; a form or instruction cite is final"),
                findings(root));
    }

    @Test
    void sourceWithoutAKindFails() throws Exception {
        JsonNode removed = load();
        ((ObjectNode) removed.get("sources").get("f6251-dft")).remove("kind");
        assertEquals(List.of("f6251-dft: source has no kind"), findings(removed));

        JsonNode legacy = load();
        ((ObjectNode) legacy.get("sources").get("rp-2025-32")).put("kind", "pdf");
        assertEquals(List.of("rp-2025-32: source has no kind"), findings(legacy));
    }

    @Test
    void provisionalNeedsReasonRepinFromAndTracking() throws Exception {
        JsonNode root = load();
        ObjectNode flag = mapper.createObjectNode();
        flag.put("reason", "");
        flag.put("repinFrom", "");
        flag.put("tracking", "");
        find((ObjectNode) root, "parameters", "/form6251RateOffset").set("provisional", flag);
        assertEquals(
                List.of("/form6251RateOffset: provisional needs reason, repinFrom, and tracking"), findings(root));
    }

    private JsonNode load() throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("taxYears/ty2026.json")) {
            if (in == null) {
                throw new IllegalStateException("Missing taxYears/ty2026.json");
            }
            return mapper.readTree(in);
        }
    }

    private static List<String> findings(JsonNode root) {
        List<String> errors = new ArrayList<>();
        root.get("sources").fieldNames().forEachRemaining(id -> {
            JsonNode source = root.get("sources").get(id);
            if (!KINDS.contains(kindOf(source))) {
                errors.add(id + ": source has no kind");
            }
        });
        for (String bucket : List.of("parameters", "pendingReview")) {
            for (JsonNode entry : root.get(bucket)) {
                List<FormCite> forms = formCites(root, entry.path("cite"));
                boolean present = entry.has("provisional") && !entry.get("provisional").isNull();
                if (needsProvisional(forms) && !present) {
                    errors.add(entry.get("fact").asText()
                            + ": every form or instruction cite is draft or priorYear, but provisional is missing");
                } else if (present && !wellFormed(entry.get("provisional"))) {
                    errors.add(entry.get("fact").asText() + ": provisional needs reason, repinFrom, and tracking");
                } else if (present && forms.stream().anyMatch(form -> "final".equals(form.kind))) {
                    errors.add(entry.get("fact").asText() + ": provisional is stale; a form or instruction cite is final");
                }
            }
        }
        return errors;
    }

    private static String checklistText(JsonNode root) {
        List<String> lines = checklistLines(root);
        StringBuilder text = new StringBuilder("TY2026 provisional re-pin checklist (").append(lines.size()).append("):");
        for (String line : lines) {
            text.append('\n').append(line);
        }
        return text.toString();
    }

    private static List<String> checklistLines(JsonNode root) {
        List<String> lines = new ArrayList<>();
        addChecklist(lines, root, root.get("parameters"), false);
        addChecklist(lines, root, root.get("pendingReview"), true);
        lines.sort(String::compareTo);
        return lines;
    }

    private static void addChecklist(List<String> lines, JsonNode root, JsonNode entries, boolean pending) {
        for (JsonNode entry : entries) {
            if (!wellFormed(entry.get("provisional"))) {
                continue;
            }
            String interim = String.join(
                    ", ",
                    formCites(root, entry.path("cite")).stream()
                            .filter(form -> "draft".equals(form.kind) || "priorYear".equals(form.kind))
                            .map(form -> form.id)
                            .toList());
            String bucket = pending ? " pendingReview" : "";
            JsonNode flag = entry.get("provisional");
            lines.add("- " + entry.get("fact").asText() + bucket + " (" + entry.get("file").asText() + ") repin from "
                    + flag.get("repinFrom").asText() + " [" + flag.get("tracking").asText() + "]; interim: " + interim);
        }
    }

    private static List<FormCite> formCites(JsonNode root, JsonNode cites) {
        List<FormCite> forms = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (!cites.isArray()) {
            return forms;
        }
        for (JsonNode cite : cites) {
            String id = cite.path("source").asText();
            if (!seen.add(id)) {
                continue;
            }
            JsonNode source = root.get("sources").get(id);
            if (!isForm(source)) {
                continue;
            }
            forms.add(new FormCite(id, kindOf(source)));
        }
        return forms;
    }

    private static boolean isForm(JsonNode source) {
        String kind = kindOf(source);
        if ("draft".equals(kind) || "priorYear".equals(kind)) {
            return true;
        }
        return "final".equals(kind) && source != null && FORM_TITLE.matcher(source.path("title").asText()).find();
    }

    private static boolean needsProvisional(List<FormCite> forms) {
        return !forms.isEmpty()
                && forms.stream().allMatch(form -> "draft".equals(form.kind) || "priorYear".equals(form.kind));
    }

    private static boolean wellFormed(JsonNode flag) {
        return flag != null && flag.isObject() && nonBlank(flag, "reason") && nonBlank(flag, "repinFrom")
                && nonBlank(flag, "tracking");
    }

    private static boolean nonBlank(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() && !value.asText().trim().isEmpty();
    }

    private static String kindOf(JsonNode source) {
        if (source == null || !source.has("kind") || !source.get("kind").isTextual()) {
            return "";
        }
        return source.get("kind").asText();
    }

    private static int countProvisional(JsonNode entries) {
        int count = 0;
        for (JsonNode entry : entries) {
            if (wellFormed(entry.get("provisional"))) {
                count++;
            }
        }
        return count;
    }

    private static ObjectNode find(ObjectNode root, String bucket, String fact) {
        return find(root.get(bucket), fact);
    }

    private static ObjectNode find(JsonNode entries, String fact) {
        for (JsonNode entry : entries) {
            if (fact.equals(entry.path("fact").asText())) {
                return (ObjectNode) entry;
            }
        }
        throw new IllegalStateException("missing " + fact);
    }

    private record FormCite(String id, String kind) {}
}
