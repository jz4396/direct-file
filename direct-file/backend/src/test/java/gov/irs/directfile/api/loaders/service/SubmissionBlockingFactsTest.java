package gov.irs.directfile.api.loaders.service;

import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.test.util.ReflectionTestUtils;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import scala.Option;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

import gov.irs.directfile.api.loaders.domain.TaxFact;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * The server's sign/submit gate (#181): the list comes from every {@code <BlockSubmissionOnTrue />} fact in the
 * dictionary XML, the client's generated list is the same, and {@link FactGraphService#submissionBlockingFactPaths}
 * refuses true values on every blocking fact and a missing value or error on the top-level ones.
 *
 * <p>The golden return is a synthetic end-to-end return built from the TY2026 golden profile 5 (single, W-2 plus
 * qualified dividends, 900-area test TIN, made-up name and addresses) with every interview section marked done.
 */
public class SubmissionBlockingFactsTest {
    static final ObjectMapper MAPPER = new ObjectMapper();
    static final String GOLDEN = "submission-blocking/golden-profile5-complete.json";
    static final String INVALID_TIN = "/familyAndHouseholdHasInvalidTIN";
    static final String KNOCKED_OUT = "/flowIsKnockedOut";
    static final String FLOW_INCOMPLETE = "/flowIncomplete";
    static final String STATE_RETURN_KNOCKOUT = "/flowKnockoutStateReturn";
    static final String FL_WITHHOLDING_KNOCKOUT = "/flowKnockoutFloridaStateWithholding";
    static final String W2_VALIDATION_ERRORS = "/hasW2ValidationErrors";
    /** Incomplete on the golden return (and on every test return): see https://github.com/jz4396/direct-file/issues/186. */
    static final String NEVER_COMPLETE_KNOCKOUT = "/flowKnockoutMFSLine6Check";

    static FactGraphService fgs;

    @BeforeAll
    static void load() throws Exception {
        fgs = newService("classpath:/tax/*.xml");
    }

    public static FactGraphService newService(String pattern) throws Exception {
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.refresh();
        FactGraphService service = new FactGraphService(MAPPER, ctx);
        ReflectionTestUtils.setField(service, "loadAtStartup", true);
        ReflectionTestUtils.setField(service, "factDictionaryXmlPattern", pattern);
        Method init = FactGraphService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(service);
        return service;
    }

    public static Map<String, FactTypeWithItem> golden() throws Exception {
        JsonNode root = MAPPER.readTree(new ClassPathResource(GOLDEN).getInputStream());
        return MAPPER.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
    }

    public static FactTypeWithItem fact(String json) throws Exception {
        return MAPPER.readValue(json, FactTypeWithItem.class);
    }

    static Set<String> paths(List<TaxFact> facts) {
        Set<String> out = new TreeSet<>();
        facts.forEach(f -> out.add(f.path()));
        return out;
    }

    // ----- One list: dictionary XML -> server, and server == client -----

    /** Independent DOM scan of the dictionary: {fact path -> Dependency paths under its Derived and Placeholder}. */
    static Map<String, Set<String>> blockingFactsInXml() throws Exception {
        Map<String, Set<String>> out = new TreeMap<>();
        Resource[] xmls = new PathMatchingResourcePatternResolver().getResources("classpath:/tax/*.xml");
        for (Resource xml : xmls) {
            Document doc;
            try (InputStream in = xml.getInputStream()) {
                doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(in);
            }
            NodeList facts = doc.getElementsByTagName("Fact");
            for (int i = 0; i < facts.getLength(); i++) {
                Element fact = (Element) facts.item(i);
                boolean blocks = false;
                Set<String> deps = new TreeSet<>();
                for (Node c = fact.getFirstChild(); c != null; c = c.getNextSibling()) {
                    if (c instanceof Element e) {
                        if ("BlockSubmissionOnTrue".equals(e.getTagName())) blocks = true;
                        if ("Derived".equals(e.getTagName()) || "Placeholder".equals(e.getTagName())) {
                            NodeList d = e.getElementsByTagName("Dependency");
                            for (int j = 0; j < d.getLength(); j++)
                                deps.add(((Element) d.item(j)).getAttribute("path"));
                        }
                    }
                }
                if (blocks) out.put(fact.getAttribute("path"), deps);
            }
        }
        return out;
    }

    @Test
    void serverListIsEveryBlockSubmissionOnTrueFactInTheDictionary() throws Exception {
        Map<String, Set<String>> xml = blockingFactsInXml();
        assertEquals(xml.keySet(), paths(fgs.getDigest().getSubmissionBlockingFacts()));
        assertTrue(xml.keySet().containsAll(List.of(KNOCKED_OUT, FLOW_INCOMPLETE, INVALID_TIN, W2_VALIDATION_ERRORS)));

        Set<String> covered = new TreeSet<>();
        xml.forEach((path, deps) ->
                deps.stream().filter(d -> !d.equals(path) && xml.containsKey(d)).forEach(covered::add));
        Set<String> top = new TreeSet<>(xml.keySet());
        top.removeAll(covered);
        assertEquals(top, new TreeSet<>(fgs.getDigest().getSubmissionBlockingFactsRequiringValue()));
        assertTrue(top.containsAll(List.of(KNOCKED_OUT, FLOW_INCOMPLETE, INVALID_TIN, W2_VALIDATION_ERRORS)));
        assertFalse(top.contains(STATE_RETURN_KNOCKOUT), "a knockout in /flowIsKnockedOut is not top-level");
    }

    /** The client's generated list (df-client generate.ts), when it has been generated in this checkout. */
    static final Path CLIENT_LIST = Path.of(
            "..", "df-client", "df-client-app", "src", "fact-dictionary", "generated", "submissionBlockingFacts.ts");

    static Set<String> clientArray(String source, String name) {
        Matcher m = Pattern.compile("export const " + name + "\\b[^=]*=\\s*\\[(.*?)\\]", Pattern.DOTALL)
                .matcher(source);
        assertTrue(m.find(), name + " in " + CLIENT_LIST);
        Set<String> out = new TreeSet<>();
        Matcher p = Pattern.compile("[\"'`](/[^\"'`]*)[\"'`]").matcher(m.group(1));
        while (p.find()) out.add(p.group(1));
        return out;
    }

    @Test
    void clientGeneratedListsEqualTheServerLists() throws Exception {
        assumeTrue(
                Files.exists(CLIENT_LIST),
                "run `npm run generate-fact-dictionary` in df-client-app to compare the client list");
        String source = Files.readString(CLIENT_LIST);
        assertEquals(
                paths(fgs.getDigest().getSubmissionBlockingFacts()), clientArray(source, "submissionBlockingFacts"));
        assertEquals(
                new TreeSet<>(fgs.getDigest().getSubmissionBlockingFactsRequiringValue()),
                clientArray(source, "submissionBlockingFactsRequiringValue"));
    }

    @Test
    void startupFailsWhenNoBlockingFactsLoad() {
        // constants.xml has no <BlockSubmissionOnTrue /> fact.
        InvocationTargetException e =
                assertThrows(InvocationTargetException.class, () -> newService("classpath:/tax/constants.xml"));
        assertInstanceOf(IllegalStateException.class, e.getCause());
        // The shared digest was not replaced.
        assertFalse(fgs.getDigest().getSubmissionBlockingFacts().isEmpty());
    }

    // ----- Real fact graphs -----

    @Test
    void goldenReturnIsAccepted() throws Exception {
        Graph graph = fgs.getGraph(golden());
        assertEquals(List.of(), fgs.submissionBlockingFactPaths(graph));
        assertFalse(fgs.hasSubmissionBlockingFacts(graph));
        // Passes on the known fail-open of https://github.com/jz4396/direct-file/issues/186.
        assertFalse(graph.get(KNOCKED_OUT).complete());
        assertFalse(graph.get(NEVER_COMPLETE_KNOCKOUT).hasValue());
    }

    @Test
    void knockoutOnTheGoldenReturnIsRefused() throws Exception {
        // A Florida resident's W-2 with state income tax withheld (box 17) stops the return.
        Map<String, FactTypeWithItem> facts = golden();
        String w2 = facts.keySet().stream()
                .filter(p -> p.startsWith("/formW2s/#"))
                .findFirst()
                .orElseThrow()
                .split("/")[2];
        facts.put(
                "/formW2s/" + w2 + "/writableStateWithholding",
                fact("{\"$type\":\"gov.irs.factgraph.persisters.DollarWrapper\",\"item\":\"100.00\"}"));
        List<String> blocking = fgs.submissionBlockingFactPaths(fgs.getGraph(facts));
        assertTrue(blocking.contains(FL_WITHHOLDING_KNOCKOUT), blocking::toString);
        assertTrue(blocking.contains(KNOCKED_OUT), blocking::toString);
    }

    @Test
    void unfinishedSectionOnTheGoldenReturnIsRefused() throws Exception {
        Map<String, FactTypeWithItem> facts = golden();
        facts.put("/formW2sIsDone", fact("{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}"));
        assertEquals(List.of(FLOW_INCOMPLETE), fgs.submissionBlockingFactPaths(fgs.getGraph(facts)));
    }

    // ----- Each tier, with one fact's result replaced on the golden graph -----

    static List<String> withOverride(String path, Function<String, Result<Object>> override) throws Exception {
        Graph graph = fgs.getGraph(golden());
        return FactGraphService.submissionBlockingFactPaths(
                fgs.getDigest(), p -> p.equals(path) ? override.apply(p) : graph.get(p));
    }

    static Result<Object> complete(Object v) {
        return Result.apply(v, true);
    }

    static Result<Object> placeholder(Object v) {
        return Result.apply(v, false);
    }

    static Result<Object> incomplete() {
        return Result.apply(Option.empty());
    }

    @Test
    void topLevelFactTrueRefuses() throws Exception {
        assertEquals(List.of(INVALID_TIN), withOverride(INVALID_TIN, p -> complete(true)));
        assertEquals(List.of(INVALID_TIN), withOverride(INVALID_TIN, p -> placeholder(true)));
        assertEquals(List.of(W2_VALIDATION_ERRORS), withOverride(W2_VALIDATION_ERRORS, p -> complete(true)));
    }

    @Test
    void coveredKnockoutTrueRefuses() throws Exception {
        assertEquals(List.of(STATE_RETURN_KNOCKOUT), withOverride(STATE_RETURN_KNOCKOUT, p -> complete(true)));
        assertEquals(List.of(STATE_RETURN_KNOCKOUT), withOverride(STATE_RETURN_KNOCKOUT, p -> placeholder(true)));
    }

    @Test
    void topLevelFactWithoutAFalseValueRefuses() throws Exception {
        assertEquals(List.of(KNOCKED_OUT), withOverride(KNOCKED_OUT, p -> incomplete()));
        assertEquals(List.of(INVALID_TIN), withOverride(INVALID_TIN, p -> incomplete()));
        assertEquals(List.of(INVALID_TIN), withOverride(INVALID_TIN, p -> complete("false")));
    }

    @Test
    void coveredKnockoutWithoutAValueDoesNotRefuseOnItsOwn() throws Exception {
        assertEquals(List.of(), withOverride(STATE_RETURN_KNOCKOUT, p -> incomplete()));
    }

    @Test
    void placeholderFalseOnFlowIsKnockedOutPasses() throws Exception {
        // Known fail-open, https://github.com/jz4396/direct-file/issues/186.
        assertEquals(List.of(), withOverride(KNOCKED_OUT, p -> placeholder(false)));
        assertEquals(List.of(), withOverride(KNOCKED_OUT, p -> complete(false)));
    }

    @Test
    void evaluationErrorRefuses() throws Exception {
        Function<String, Result<Object>> boom = p -> {
            throw new UnsupportedOperationException("forced");
        };
        assertEquals(List.of(INVALID_TIN), withOverride(INVALID_TIN, boom));
        assertEquals(List.of(NEVER_COMPLETE_KNOCKOUT), withOverride(NEVER_COMPLETE_KNOCKOUT, boom));
    }

    @Test
    void refusesWhenNoBlockingFactsAreLoaded() {
        var empty = new gov.irs.directfile.api.loaders.domain.TaxDictionaryDigest("empty", Map.of());
        assertThrows(
                IllegalStateException.class,
                () -> FactGraphService.submissionBlockingFactPaths(empty, p -> complete(false)));
    }
}
