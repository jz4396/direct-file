package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;
import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.PTC_BELOW_100_SCENARIO;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.PTC_NONE_SCENARIO;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.PTC_SCENARIO;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SEP_ANSWER;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SEP_KNOCKOUT;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #88: 2026 draft Form 8962 (https://www.irs.gov/pub/irs-dft/f8962--dft.pdf, Created 4/21/26) through the real
 * PdfService. The draft's lines 28 and 29 are "Reserved for future use"; the 2024 map's old line 29 is line 27 here.
 * No 2026 instructions draft is posted. No 2026 Spanish draft is posted; the English form is the template.
 */
class Form8962Ty2026PdfSmokeTest {
    private static final String BELOW_100 = "/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void annualScenarioPrintsForm8962AndLeavesReservedLinesBlank() throws Exception {
        Map<String, FactTypeWithItem> facts = withSepNo(PTC_SCENARIO);
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Graph graph = fgs.getGraph(facts);
        assertEquals(Boolean.TRUE, graph.get("/needsToFileForm8962").get());
        assertEquals(Boolean.TRUE, graph.get("/ptcCanReportAnnualTotals").get(), "line 10 Yes");
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = CreditFormsTy2026PdfSmokeTest.generate(PTC_SCENARIO, facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
            List<Integer> pages = form8962Pages(doc);
            assertEquals(2, pages.size(), "Form 8962 is two pages");
            Map<String, String> fields = CreditFormsTy2026PdfSmokeTest.fieldsOn(doc, pages);

            assertAmount(fields, graph, "f1_3[0]", "/taxFamilySize");
            assertAmount(fields, graph, "f1_4[0]", "/ptcMagi");
            assertAmount(fields, graph, "f1_6[0]", "/householdIncome");
            assertAmount(fields, graph, "f1_7[0]", "/federalPovertyLevelThreshold");
            assertAmount(fields, graph, "f1_8[0]", "/householdIncomeAsPercent");
            assertAmount(fields, graph, "f1_9[0]", "/formattedApplicableFigure");
            assertAmount(fields, graph, "f1_10[0]", "/ptcAnnualContributionAmount");
            assertAmount(fields, graph, "f1_11[0]", "/ptcMontlyContributionAmount");
            assertAmount(fields, graph, "f1_12[0]", "/totalPtcAnnualPremium");
            assertAmount(fields, graph, "f1_13[0]", "/totalAnnualSlcspPremium");
            assertAmount(fields, graph, "f1_14[0]", "/submittedAnnualContributionAmountForAnnual");
            assertAmount(fields, graph, "f1_15[0]", "/annualMaxPremiumAssitance");
            assertAmount(fields, graph, "f1_16[0]", "/annualPtcAllowed");
            assertAmount(fields, graph, "f1_17[0]", "/totalAnnualAptcAmount");
            assertAmount(fields, graph, "f1_90[0]", "/totalPtcAmountAllowed");
            assertAmount(fields, graph, "f1_91[0]", "/totalAptcAmountTaken");
            assertAmount(fields, graph, "f1_92[0]", "/netPtcAmountWhenZeroOrPositive");
            assertAmount(fields, graph, "f1_93[0]", "/netPtcAmountWhenNegative");

            // 2024 field names would put line 24 on f1_91 and the excess on the reserved line. These are the 2026
            // draft's own fields.
            assertTrue(graph.get("/totalPtcAmountAllowed").complete());
            assertFalse(field(fields, "f1_90[0]").isEmpty(), "line 24 is f1_90, not the 2024 f1_91");
            assertBlank(fields, "f1_5[0]", "2b dependents' MAGI");
            assertBlank(fields, "f1_18[0]", "January column (a) when line 10 is Yes");
            assertBlank(fields, "f1_89[0]", "December column (f) when line 10 is Yes");
            assertBlank(fields, "f1_94[0]", "28 reserved");
            assertBlank(fields, "f1_95[0]", "29 reserved");

            assertChecked(fields, graph, "c1_3[0]", "/form8962Line6No");
            assertChecked(fields, graph, "c1_3[1]", "/isHouseholdIncome401PercentOfPovertyLine");
            assertChecked(fields, graph, "c1_5[0]", "/ptcCanReportAnnualTotals");
            assertChecked(fields, graph, "c1_5[1]", "/needsToFileForm8962Monthly");
            assertChecked(fields, graph, "c1_2[2]", "/federalPovertyLineLocationIsOther");
            assertTrue(checked(fields, "c1_4[1]"), "line 9 No");
            assertFalse(checked(fields, "c1_4[0]"), "line 9 Yes stays blank");
            assertFalse(field(fields, "f1_1[0]").isBlank(), "name");
            assertFalse(field(fields, "f1_2[0]").isBlank(), "SSN");
        }
    }

    @Test
    void returnThatDoesNotFileForm8962OmitsIt() throws Exception {
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(PTC_NONE_SCENARIO);
        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
        Result<Object> needs = graph.get("/needsToFileForm8962");
        assertTrue(needs.complete() && Boolean.FALSE.equals(needs.get()));
        byte[] bytes = CreditFormsTy2026PdfSmokeTest.generate(PTC_NONE_SCENARIO, facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertTrue(form8962Pages(doc).isEmpty(), "Form 8962 is not in the package");
        }
    }

    @Test
    void householdIncomeBelow100PercentIsRefusedInsteadOfPrintingZeros() throws Exception {
        Map<String, FactTypeWithItem> facts = withSepNo(PTC_BELOW_100_SCENARIO);
        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
        assertEquals(Boolean.TRUE, graph.get("/needsToFileForm8962").get());
        assertEquals(Boolean.TRUE, graph.get(BELOW_100).get());
        List<String> refused = PrintRefusingKnockouts.refusingPaths(graph);
        assertTrue(refused.contains(BELOW_100), refused.toString());
        assertFalse(refused.contains(SEP_KNOCKOUT), refused.toString());
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> CreditFormsTy2026PdfSmokeTest.pdfService(CreditFormsTy2026PdfSmokeTest.factGraphService())
                        .getTaxReturn("en", taxReturn, false));
    }

    /**
     * Each mapped field's tooltip on the 2026 draft names the line the field map fills. Lines 2b, 28 and 29, line 9
     * Yes, and Parts IV and V stay unmapped.
     */
    @Test
    void mappedFieldTooltipsNameTheComputedLinesAndReservedLinesStayUnmapped() throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("f1_1[0]", "Name shown on your return");
        expected.put("f1_2[0]", "Your social security number");
        expected.put("c1_1[0]", "married filing separately");
        expected.put("f1_3[0]", "1. Tax family size");
        expected.put("f1_4[0]", "2a. Modified A G I");
        expected.put("f1_6[0]", "3. Household income");
        expected.put("c1_2[0]", "a. Alaska");
        expected.put("c1_2[1]", "4b. Hawaii");
        expected.put("c1_2[2]", "4c. Other 48 states");
        expected.put("f1_7[0]", "4. Amount");
        expected.put("f1_8[0]", "5. Household income as a percentage");
        expected.put("c1_3[0]", "No. Continue to line 7");
        expected.put("c1_3[1]", "6. Yes.");
        expected.put("f1_9[0]", "7. Applicable figure");
        expected.put("f1_10[0]", "8a. Annual contribution amount");
        expected.put("f1_11[0]", "8b. Monthly contribution amount");
        expected.put("c1_4[1]", "9. No. Continue to line 10");
        expected.put("c1_5[0]", "Yes. Continue to line 11");
        expected.put("c1_5[1]", "10. No. Continue to lines 12");
        expected.put("f1_12[0]", "11. Annual totals. Column: (a)");
        expected.put("f1_13[0]", "11. Annual totals. Column: (b)");
        expected.put("f1_14[0]", "11. Annual totals. Column: (c)");
        expected.put("f1_15[0]", "11. Annual totals. Column: (d)");
        expected.put("f1_16[0]", "11. Annual totals. Column: (e)");
        expected.put("f1_17[0]", "11. Annual totals. Column: (f)");
        String[] months = {
            "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
            "November", "December"
        };
        String[] columns = {"(a)", "(b)", "(c)", "(d)", "(e)", "(f)"};
        int field = 18;
        for (int row = 0; row < months.length; row++) {
            for (String column : columns) {
                expected.put(
                        "f1_" + field + "[0]", (row + 12) + ". " + months[row] + ". Column: " + column);
                field++;
            }
        }
        assertEquals(90, field, "December column (f) is f1_89");
        expected.put("f1_90[0]", "24. Total P T C");
        expected.put("f1_91[0]", "25. Advance payment of P T C");
        expected.put("f1_92[0]", "26. Net P T C");
        expected.put("f1_93[0]", "27. Excess advance payment of P T C");

        String config = new String(
                new ClassPathResource("pdf/2026/IRS8962/en/configuration.yml").getContentAsByteArray(),
                StandardCharsets.UTF_8);
        try (PDDocument doc =
                Loader.loadPDF(new ClassPathResource("pdf/2026/IRS8962/en/f8962--dft.pdf").getContentAsByteArray())) {
            Map<String, PDField> byShortName = new LinkedHashMap<>();
            for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                String full = f.getFullyQualifiedName();
                int dot = full.lastIndexOf('.');
                byShortName.put(dot < 0 ? full : full.substring(dot + 1), f);
            }
            int mapped = 0;
            Matcher matcher = Pattern.compile("^\\s+((?:f1_|c1_)\\d+\\[\\d+\\]):\\s").matcher("");
            for (String line : config.split("\n")) {
                if (line.trim().startsWith("#")) {
                    continue;
                }
                matcher.reset(line);
                if (!matcher.find()) {
                    continue;
                }
                mapped++;
                String name = matcher.group(1);
                assertTrue(expected.containsKey(name), "tooltip expectation for mapped field " + name);
                PDField fieldNode = byShortName.get(name);
                assertNotNull(fieldNode, name + " exists in the draft");
                String tooltip = fieldNode.getAlternateFieldName().replaceAll("\\s+", " ");
                assertTrue(
                        tooltip.contains(expected.get(name)),
                        name + " tooltip names the line: expected \"" + expected.get(name) + "\" in \"" + tooltip
                                + "\"");
            }
            assertEquals(expected.size(), mapped, "every computed line is mapped");
            for (String reserved : List.of("f1_5[0]", "f1_94[0]", "f1_95[0]", "c1_4[0]")) {
                assertFalse(mappedLine(config, reserved), reserved + " is not a field-map key");
            }
            assertTrue(
                    byShortName.get("f1_94[0]").getAlternateFieldName().contains("28. Reserved for future use"));
            assertTrue(
                    byShortName.get("f1_95[0]").getAlternateFieldName().contains("29. Reserved for future use"));
            assertTrue(byShortName.get("f1_5[0]").getAlternateFieldName().contains("2b."));
        }
    }

    private static boolean mappedLine(String config, String name) {
        for (String line : config.split("\n")) {
            if (!line.trim().startsWith("#") && line.contains(name + ":")) {
                return true;
            }
        }
        return false;
    }

    private static Map<String, FactTypeWithItem> withSepNo(String scenario) throws Exception {
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(scenario);
        facts.put(SEP_ANSWER, MAPPER.readValue(bool(false), FactTypeWithItem.class));
        return facts;
    }

    /** Output pages whose text is a Form 8962 form page (the draft cover is not one of them). */
    private static List<Integer> form8962Pages(PDDocument filled) throws Exception {
        List<String> formPages = new ArrayList<>();
        try (PDDocument blank =
                Loader.loadPDF(new ClassPathResource("pdf/2026/IRS8962/en/f8962--dft.pdf").getContentAsByteArray())) {
            for (int i = 1; i < blank.getNumberOfPages(); i++) {
                formPages.add(pageText(blank, i));
            }
        }
        List<Integer> found = new ArrayList<>();
        for (int i = 0; i < filled.getNumberOfPages(); i++) {
            if (formPages.contains(pageText(filled, i))) {
                found.add(i);
            }
        }
        return found;
    }

    private static String pageText(PDDocument doc, int pageIndex) throws Exception {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(pageIndex + 1);
        stripper.setEndPage(pageIndex + 1);
        return stripper.getText(doc).replaceAll("\\s+", " ").trim();
    }

    private static String field(Map<String, String> fields, String shortName) {
        String found = null;
        for (var e : fields.entrySet()) {
            if (e.getKey().endsWith("." + shortName)) {
                assertTrue(found == null, "field is unique: " + shortName);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertNotNull(found, "field present: " + shortName);
        return found;
    }

    private static void assertBlank(Map<String, String> fields, String shortName, String line) {
        assertTrue(field(fields, shortName).isEmpty(), line + " stays blank");
    }

    private static void assertAmount(Map<String, String> fields, Graph graph, String shortName, String fact) {
        Result<Object> result = graph.get(fact);
        String printed = field(fields, shortName);
        if (!result.complete()) {
            assertTrue(printed.isEmpty(), fact + " incomplete, so " + shortName + " stays blank, was \"" + printed
                    + "\"");
            return;
        }
        String expected = result.get().toString().trim();
        if (expected.isEmpty()) {
            assertTrue(printed.isEmpty(), shortName);
            return;
        }
        BigDecimal expectedNumber = numberOrNull(expected);
        // FactGraphService omits a $0 dollar fact that has no <ExportZero />, so the field stays blank.
        if (expectedNumber != null && expectedNumber.signum() == 0 && printed.isEmpty()) {
            return;
        }
        assertFalse(printed.isEmpty(), fact + " prints on " + shortName);
        if (expectedNumber != null) {
            assertEquals(
                    0,
                    expectedNumber.compareTo(numberOrNull(printed)),
                    shortName + " = " + fact + " (\"" + printed + "\" vs \"" + expected + "\")");
            return;
        }
        assertEquals(expected, printed, shortName + " = " + fact);
    }

    private static BigDecimal numberOrNull(String value) {
        try {
            return new BigDecimal(value.replace(",", "").replace("$", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean checked(Map<String, String> fields, String shortName) {
        String value = field(fields, shortName);
        return !value.isEmpty() && !"Off".equals(value);
    }

    private static void assertChecked(Map<String, String> fields, Graph graph, String shortName, String fact) {
        Result<Object> result = graph.get(fact);
        assertTrue(result.complete(), fact);
        assertEquals(Boolean.TRUE.equals(result.get()), checked(fields, shortName), fact + " -> " + shortName);
    }
}
