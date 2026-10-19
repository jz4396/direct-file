package gov.irs.directfile.api.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #123: PA-40 and PA-40 Schedule SP (2025 forms as interim tax year 2026 templates) end-to-end through the real
 * PdfService, fact dictionary and application.yaml. Year-based field maps: re-verify when the 2026 forms are published.
 * Page cites are to the PA-40 IN (2025) booklet.
 *
 * <p>Golden end-to-end scenario (synthetic data, same filer as the Schedule D smoke fixture): single full-year PA
 * resident, one W-2 with $15,000 wages and PA compensation (box 16) and $500 PA tax withheld (box 17), two dependent
 * children, and the fixture's two Form 8949 sales changed to a $1,000 net loss
 * ($4,000 gain, $5,000 loss). Worked figures (whole dollars, half-up, p. 4):
 *
 * <pre>
 *   PA-40: 1a 15,000  1c 15,000  5 1,000 with the loss oval  9 15,000 (losses not added, p. 20)  11 15,000
 *          12 461 (15,000 x 3.07% = 460.50)  13 500  19a Unmarried  19b 2  20 15,000  21 461  24 961 (500 + 460.50)
 *          26 blank  29 500  30 500
 *   SP:    line 1 15,000  11 15,000; table base 6,500 + 2 x 9,500 = 25,500 (p. 39), so line 15 = 1.0
 *          12 461  14 461  16 461
 * </pre>
 */
class PaPit40ScheduleSpTy2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";
    static final String TX2 = "a2222222-2222-4222-8222-222222222222";
    static final String KID1 = "c1230000-0000-4000-8000-000000000001";
    static final String KID2 = "c1230000-0000-4000-8000-000000000002";
    static final String PA40_PAGE1 = "2500110057";
    static final String PA40_PAGE2 = "2500210055";
    static final String SP_PAGE1 = "2509510059";
    static final String SP_PAGE2 = "2509610057";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static String day(String isoDate) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.DayWrapper\",\"item\":{\"date\":\"" + isoDate + "\"}}";
    }

    static String tin(String area, String group, String serial) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.TinWrapper\",\"item\":{\"area\":\"" + area + "\",\"group\":\""
                + group + "\",\"serial\":\"" + serial + "\"}}";
    }

    static String paAddress() {
        return "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                + " Ln\",\"city\":\"Harrisburg\",\"postalCode\":\"17101\",\"stateOrProvence\":\"PA\"}}";
    }

    /** Same facts as the client test helper makeChildData (df-client-app src/test/testData.ts). */
    static void child(Map<String, String> m, String id, String first, String relationship, String dob, String serial) {
        String p = "/familyAndHousehold/#" + id + "/";
        m.put(p + "firstName", string(first));
        m.put(p + "lastName", string("McTestface"));
        m.put(p + "relationshipCategory", enumValue("childOrDescendants", "/relationshipCategoryOptions"));
        m.put(p + "childRelationship", enumValue(relationship, "/childRelationshipOptions"));
        m.put(p + "dateOfBirth", day(dob));
        m.put(p + "hasOtherBiologicalOrAdoptiveParent", bool(false));
        m.put(p + "residencyDuration", enumValue("allYear", "/residencyDurationOptions"));
        m.put(p + "monthsLivedWithTPInUS", enumValue("seven", "/monthsLivedWithTPInUSOptions"));
        m.put(p + "ssnEmploymentValidity", enumValue("neither", "/familyAndHouseholdSsnEmploymentValidityOptions"));
        m.put(p + "isUsCitizenFullYear", bool(true));
        m.put(p + "married", bool(false));
        m.put(p + "ownSupport", bool(false));
        m.put(p + "tpClaims", bool(true));
        m.put(p + "tin", tin("555", "55", serial));
        m.put(p + "tinType", enumValue("ssn", "/tinTypeOptions"));
        m.put(p + "writableCouldBeQualifyingChildOfAnother", bool(false));
    }

    static Map<String, String> paResident() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("pa", "/scopedStateOptions"));
        m.put("/address", paAddress());
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("50000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("1535.00"));
        return m;
    }

    static Map<String, String> goldenScenario() {
        Map<String, String> m = paResident();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("15000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("15000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("500.00"));
        m.put("/form8949Transactions/#" + TX2 + "/costBasis", dollar("20000"));
        m.put("/familyAndHousehold", collection(KID1, KID2));
        child(m, KID1, "Kiddo", "biologicalChild", "2015-03-03", "0011");
        child(m, KID2, "Second", "biologicalChild", "2017-04-04", "0022");
        return m;
    }

    static Map<String, String> partYearScenario() {
        Map<String, String> m = paResident();
        m.put("/filerResidenceAndIncomeState", enumValue("moreThanOne", "/scopedStateOptions"));
        m.put("/paPartYearMove", enumValue("paToFl", "/paPartYearMoveOptions"));
        m.put("/paPartYearMoveDate", day("2026-07-01"));
        m.put("/formW2s/#" + W2 + "/paPartYearW2State", enumValue("pa", "/paPartYearW2StateOptions"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":" + "{\"items\":[]}}");
        return m;
    }

    /** Field values on the pages whose text contains {@code marker} (fully qualified name -> value). */
    static Map<String, String> fieldsOnPages(PDDocument doc, String marker) throws Exception {
        Set<COSBase> widgets = new HashSet<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            if (stripper.getText(doc).contains(marker)) {
                for (PDAnnotation a : doc.getPage(i).getAnnotations()) {
                    if (a instanceof PDAnnotationWidget) {
                        widgets.add(a.getCOSObject());
                    }
                }
            }
        }
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            if (f instanceof PDTerminalField t) {
                for (PDAnnotationWidget w : t.getWidgets()) {
                    if (widgets.contains(w.getCOSObject())) {
                        byName.put(f.getFullyQualifiedName(), f.getValueAsString());
                    }
                }
            }
        }
        return byName;
    }

    /**
     * Value of the one field on these pages named {@code name}. PdfService merges forms in PDFBox legacy mode, which
     * renames a top-level field whose name is already taken: Schedule SP's "12. – ..." (parent "12") collides with the
     * PA-40's "12. PA Tax Liability ..." and becomes "dummyFieldNameN. – ...". The value is unaffected, so a renamed
     * field is matched by the part of its name after the parent.
     */
    static String field(Map<String, String> f, String name) {
        String found = null;
        String leaf = name.contains(".") ? name.substring(name.indexOf('.')) : null;
        for (var e : f.entrySet()) {
            String key = e.getKey();
            boolean renamed = leaf != null
                    && key.matches("dummyFieldName\\d+\\..*")
                    && key.substring(key.indexOf('.')).equals(leaf);
            if (key.equals(name) || key.endsWith("." + name) || renamed) {
                assertTrue(found == null, "field is unique on the page: " + name);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present on the page: " + name);
        return found;
    }

    static void is(Map<String, String> f, String name, String expected, String line) {
        assertEquals(expected, field(f, name), line);
    }

    static void blank(Map<String, String> f, String name, String line) {
        assertEquals("", field(f, name), line + " blank");
    }

    static boolean pageWith(PDDocument doc, String marker) throws Exception {
        return new PDFTextStripper().getText(doc).contains(marker);
    }

    static final String SP_LINE1 =
            "1. – Enter the total taxable income from Line 9 of the PA-40 return when completing the"
                    + " ovals for Lines 1a, 1b, 2, 3a or 4 in Section I";
    static final String SP_LINE11 = "11 – Add the Column A amounts for Lines 1 through 10 and enter the result here";
    static final String SP_LINE12 =
            "12. – Enter the PA tax liability from Line 12 of the PA-40 return when completing the"
                    + " ovals for Lines 1a, 1b, 2, 3a or 4 in Section I";
    static final String SP_LINE14 = "14. – Subtract Line 13 from Line 12 and enter the result here when completing the"
            + " ovals for Lines 1a, 1b, 2, 3a or 4 in Section I";
    static final String SP_LINE15 = "15 – Enter the appropriate percentage of Tax Forgiveness as a decimal from the"
            + " appropriate eligibility income table found on Page 4 of the instructions  for this form while using the"
            + " total number of dependents from Section II, Line 2";
    static final String SP_LINE16 =
            "16 – Multiply Line 14 by the decimal on Line 15 and enter the result here and on Line"
                    + " 21 of the PA-40 return when completing the ovals for Lines 1a, 1b, 2, 3a or 4 in Section I";

    @Test
    void pa40PrintsTheGoldenScenario() throws Exception {
        byte[] bytes = generate(goldenScenario());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "pa40-sp-ty2026-golden.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PA40_PAGE1);
            assertFalse(p1.isEmpty(), "PA-40 page 1 printed");
            is(p1, "Enter SSN shown first without dashes or spaces", "555555555", "SSN, no dashes (p. 5)");
            blank(p1, "Enter SSN of spouse without dashes or spaces", "spouse SSN (single)");
            is(p1, "Use all caps to enter taxpayer's last name", "MCTESTFACE", "last name, upper case (p. 5)");
            is(p1, "Use all caps to enter taxpayer's first name", "FAKEY", "first name");
            is(p1, "Use Cap For Your Middle Initial", "T", "middle initial");
            is(p1, "Use all caps to enter First Line of Address", "100 SYNTHETIC LN", "address");
            is(p1, "Use all caps to enter City or Post Office", "HARRISBURG", "city");
            is(p1, "Use all caps to enter two character State abbreviation", "PA", "state");
            is(p1, "Enter five digit Zip Code", "17101", "ZIP");
            is(p1, "Enter Daytime Telephone Number without parenthesis, dashes or spaces", "4445550100", "phone");
            blank(p1, "Enter five digit School Code from list on pags 42 & 43", "school code (not collected)");
            is(p1, "Residency Status", "1", "(R) Pennsylvania Resident (p. 6)");
            blank(p1, "Part Year Resident from", "part-year from");
            blank(p1, "Part year resident to", "part-year to");
            is(p1, "Filing Status", "1", "(S) Single (p. 6)");
            is(p1, "Your Occupation", "CAT", "occupation");
            is(p1, "1a. Gross Compensation", "15,000.00", "line 1a (p. 10)");
            blank(p1, "1b. Unreimbursed Employee Business Expenses", "line 1b (#102 stop)");
            is(p1, "1c. Net Compensation", "15,000.00", "line 1c");
            blank(p1, "2. Interest Income", "line 2 ($0)");
            blank(p1, "3. Dividend  and Capital Gains Distributions Income", "line 3 ($0)");
            is(p1, "5. Loss", "none", "line 5 loss oval (p. 15)");
            is(p1, "5. Net Gain or Loss from Sale, etc. of Property", "1,000.00", "line 5 (p. 17)");
            is(p1, "4. Loss", "Off", "line 4 loss oval");
            is(p1, "6. Loss", "Off", "line 6 loss oval");
            is(p1, "9. Total PA Taxable Income", "15,000.00", "line 9, loss not added (p. 20)");
            blank(p1, "10.  Other Deductions", "line 10");
            is(p1, "11. Adjusted PA Taxable Income", "15,000.00", "line 11 (p. 21)");

            Map<String, String> p2 = fieldsOnPages(doc, PA40_PAGE2);
            assertFalse(p2.isEmpty(), "PA-40 page 2 printed");
            is(p2, "Enter SSN shown first without dashes or spaces", "555555555", "page 2 SSN");
            assertTrue(field(p2, "Name(s)").contains("MCTESTFACE"), "Name(s)");
            is(p2, "12. PA Tax Liability. Multiply Line 11 by 3.07%", "461.00", "line 12, 460.50 rounded half-up");
            is(p2, "13. Total PA Tax Withheld", "500.00", "line 13 (p. 21)");
            blank(p2, "18.Total Estimated Payments and Credits", "line 18");
            is(p2, "Tax Forgiveness", "1", "line 19a Unmarried (p. 22)");
            is(p2, "Dependents", "2", "line 19b");
            is(p2, "20. Total Eligibility Income", "15,000.00", "line 20");
            is(p2, "21. Tax Forgiveness Credit", "461.00", "line 21");
            blank(p2, "22. Resident Credit", "line 22");
            is(p2, "24. Total Payments and Credits", "961.00", "line 24 = 500 + 460.50, half-up");
            blank(p2, "26. TAX DUE", "line 26 ($0)");
            blank(p2, "28. TOTAL PAYMENT", "line 28 ($0)");
            is(p2, "29. OVERPAYMENT", "500.00", "line 29 (p. 24)");
            is(p2, "30. Refund", "500.00", "line 30 = line 29");
            blank(p2, "31. Credit", "line 31");
        }
    }

    @Test
    void scheduleSpPrintsTheGoldenScenario() throws Exception {
        byte[] bytes = generate(goldenScenario());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, SP_PAGE1);
            assertFalse(p1.isEmpty(), "Schedule SP page 1 printed");
            is(
                    p1,
                    "Enter the name of the taxpayer claiming Tax Forgiveness",
                    "FAKEY TEST MCTESTFACE",
                    "name (fixture middle name)");
            is(p1, "Enter the Social Security number shown first on the return", "555555555", "SSN");
            blank(p1, "Enter the spouse’s name (even if filing separately)", "spouse name");
            is(
                    p1,
                    "1. – Enter: Yes, if a dependent on another taxpayer’s federal tax return; or, No, if not a dependent"
                            + " on another taxpayer’s federal return",
                    "No",
                    "question 1 (p. 36)");
            is(
                    p1,
                    "Click on the appropriate filing status of: unmarried; separated; married; or, deceased. See the"
                            + " instructions",
                    "1",
                    "Section I oval 1 Unmarried");
            is(
                    p1,
                    "Click on the appropriate status of: single/unmarried/divorced; or, single and claimed as a dependent"
                            + " on another taxpayer’s return. See the instructions",
                    "1",
                    "Section I oval 1a");
            is(p1, "1i.- Enter the dependent’s first and last name", "KIDDO MCTESTFACE", "row i name");
            is(p1, "1i. – Enter the dependent’s age", "11", "row i age at end of 2026");
            is(
                    p1,
                    "1i. – Enter the dependent’s relationship (child, step-child, foster child, adopted child or"
                            + " grandchild) to the taxpayer. See the instructions",
                    "Child",
                    "row i relationship");
            is(p1, "1i. – Enter the dependent’s Social Security number", "555550011", "row i SSN");
            is(p1, "1ii.- Enter the dependent’s first and last name", "SECOND MCTESTFACE", "row ii name");
            is(
                    p1,
                    "1ii. – Enter the dependent’s relationship (child, step-child, foster child, adopted child or"
                            + " grandchild) to the taxpayer. See the instructions",
                    "Child",
                    "row ii relationship");
            blank(p1, "1iii.- Enter the dependent’s first and last name", "row iii");
            is(p1, "Enter the total number of dependents listed on Line 1", "2", "Section II line 2");

            Map<String, String> p2 = fieldsOnPages(doc, SP_PAGE2);
            assertFalse(p2.isEmpty(), "Schedule SP page 2 printed");
            is(p2, SP_LINE1, "15,000.00", "line 1 = PA-40 line 9");
            is(p2, SP_LINE11, "15,000.00", "line 11");
            is(p2, SP_LINE12, "461.00", "line 12");
            is(p2, SP_LINE14, "461.00", "line 14");
            is(p2, SP_LINE15, "1.0", "line 15, table decimal (p. 39)");
            is(p2, SP_LINE16, "461.00", "line 16");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Instructions for PA-40 Schedule SP"), "instruction pages dropped");
        }
    }

    @Test
    void partYearMoverPrintsResidencyDatesAndNoScheduleSp() throws Exception {
        byte[] bytes = generate(partYearScenario());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "pa40-ty2026-part-year.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PA40_PAGE1);
            assertFalse(p1.isEmpty(), "PA-40 printed");
            is(p1, "Residency Status", "3", "(P) Part-Year Resident (p. 6)");
            is(p1, "Part Year Resident from", "01/01", "PA residency from");
            is(p1, "Part year resident to", "06/30", "to the day before the move to FL");
            is(p1, "Enter five digit School Code from list on pags 42 & 43", "99999", "p. 6, not in PA on Dec. 31");
            is(p1, "1a. Gross Compensation", "50,000.00", "line 1a (PA W-2 box 16)");
            is(p1, "5. Loss", "Off", "no line 5 loss");
            blank(p1, "5. Net Gain or Loss from Sale, etc. of Property", "line 5 ($0)");
            Map<String, String> p2 = fieldsOnPages(doc, PA40_PAGE2);
            is(p2, "12. PA Tax Liability. Multiply Line 11 by 3.07%", "1,535.00", "line 12 = 50,000 x 3.07%");
            is(p2, "13. Total PA Tax Withheld", "1,535.00", "line 13");
            is(p2, "Tax Forgiveness", "Off", "line 19a (no forgiveness)");
            blank(p2, "20. Total Eligibility Income", "line 20");
            blank(p2, "21. Tax Forgiveness Credit", "line 21");
            assertTrue(fieldsOnPages(doc, SP_PAGE1).isEmpty(), "no Schedule SP without a credit");
        }
    }

    @Test
    void noPaFormsForANonPaReturn() throws Exception {
        byte[] bytes = generate(Map.of());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertFalse(pageWith(doc, PA40_PAGE1), "no PA-40");
            assertFalse(pageWith(doc, SP_PAGE1), "no Schedule SP");
        }
    }
}
