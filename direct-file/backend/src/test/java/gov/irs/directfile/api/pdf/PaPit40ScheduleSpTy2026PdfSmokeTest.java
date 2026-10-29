package gov.irs.directfile.api.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #123: PA-40 and PA-40 Schedule SP (2025 forms as interim tax year 2026 templates) end-to-end through the real
 * PdfService, fact dictionary and application.yaml. Year-based field maps: re-verify when the 2026 forms are published.
 * Page cites are to the PA-40 IN (2025) booklet.
 *
 * <p>Golden end-to-end scenario (synthetic data, same filer as the Schedule D smoke fixture): single full-year PA
 * resident, one W-2 with $15,000 wages and PA compensation (box 16) and $500 PA tax withheld (box 17), two dependent
 * children, and no Form 8949 sales. Any sale needs PA Schedule D (/flowKnockoutPaScheduleD), which is not produced,
 * so a sale refuses the print and line 5 stays blank on a return that prints. Worked figures (whole dollars, half-up,
 * p. 4):
 *
 * <pre>
 *   PA-40: 1a 15,000  1b blank  1c 15,000  5 blank  9 15,000  11 15,000
 *          12 461 (15,000 x 3.07% = 460.50)  13 500  19a Unmarried  19b 2  20 15,000  21 461  24 961 (500 + 460.50)
 *          26 blank  28 blank  29 500  30 500
 *   SP:    line 1 15,000  11 15,000; table base 6,500 + 2 x 9,500 = 25,500 (p. 39), so line 15 = 1.0
 *          12 461  14 461  16 461
 * </pre>
 */
class PaPit40ScheduleSpTy2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";
    static final String KID1 = "c1230000-0000-4000-8000-000000000001";
    static final String KID2 = "c1230000-0000-4000-8000-000000000002";
    static final String PA40_TEMPLATE = "src/main/resources/pdf/2026/PA40/en/2025_pa-40.pdf";
    static final String PA40_CONFIG = "src/main/resources/pdf/2026/PA40/en/configuration.yml";
    static final String SP_TEMPLATE = "src/main/resources/pdf/2026/PA40SP/en/2025_pa-40sp.pdf";
    static final String SP_CONFIG = "src/main/resources/pdf/2026/PA40SP/en/configuration.yml";
    static final String EMPTY_COLLECTION =
            "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}";
    static final String SP_LINE2_PRINTED_BOX = "2. – Enter the total amount of any alimony received when completing the"
            + " ovals for Lines 1a, 1b, 2, 3a or 4 in Section I. See the instructions";
    static final String SP_LINE3_PRINTED_BOX = "3. - Enter the total amount of any nontaxable interest, dividends and"
            + " gains and/or annualized income when completing the ovals for Lines 1a, 1b, 2, 3a or 4 in Section I."
            + " See the instructions";
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
        // Answered no. An unanswered screener stays incomplete and PrintRefusingKnockouts refuses the PDF.
        m.put("/paHasUnreimbursedEmployeeExpenses", bool(false));
        m.put("/paHasUnsupportedItems", bool(false));
        m.put("/paHasSpNontaxableIncome", bool(false));
        m.put("/paPartYearHasNonresidentPaSourcePay", bool(false));
        return m;
    }

    static Map<String, String> goldenScenario() {
        Map<String, String> m = paResident();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("15000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("15000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("500.00"));
        // No property sales: any PA sale needs PA Schedule D (/flowKnockoutPaScheduleD), which isn't produced.
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        m.put("/familyAndHousehold", collection(KID1, KID2));
        child(m, KID1, "Kiddo", "biologicalChild", "2015-03-03", "0011");
        child(m, KID2, "Second", "biologicalChild", "2017-04-04", "0022");
        // Harrisburg City, PA-40 IN (2025) p. 46.
        m.put("/paSchoolDistrictCode", string("22275"));
        return m;
    }

    static Map<String, String> partYearScenario() {
        Map<String, String> m = paResident();
        m.put("/filerResidenceAndIncomeState", enumValue("moreThanOne", "/scopedStateOptions"));
        m.put("/paPartYearMove", enumValue("paToFl", "/paPartYearMoveOptions"));
        m.put("/paPartYearMoveDate", day("2026-07-01"));
        m.put("/formW2s/#" + W2 + "/paPartYearW2State", enumValue("pa", "/paPartYearW2StateOptions"));
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        return m;
    }

    /** FL to PA on April 1: PA residency is the move date through December 31 (PA-40 IN (2025) p. 6). */
    static Map<String, String> flToPaScenario() {
        Map<String, String> m = partYearScenario();
        m.put("/paPartYearMove", enumValue("flToPa", "/paPartYearMoveOptions"));
        m.put("/paPartYearMoveDate", day("2026-04-01"));
        m.put("/paSchoolDistrictCode", string("22275"));
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

    /** Top and bottom (from the page top) of the first text on page {@code pageIndex} that contains {@code text}. */
    static float[] textLine(PDDocument doc, int pageIndex, String text) throws Exception {
        float[][] found = new float[1][];
        PDFTextStripper stripper = new PDFTextStripper() {
            @Override
            protected void writeString(String s, List<TextPosition> positions) {
                int at = s.indexOf(text);
                if (found[0] == null && at >= 0 && at < positions.size()) {
                    TextPosition first = positions.get(at);
                    found[0] = new float[] {first.getYDirAdj() - first.getHeightDir(), first.getYDirAdj()};
                }
            }
        };
        stripper.setStartPage(pageIndex + 1);
        stripper.setEndPage(pageIndex + 1);
        stripper.getText(doc);
        assertTrue(found[0] != null, "text on the page: " + text);
        return found[0];
    }

    /** Top and bottom (from the page top) of the widget of field {@code name} on page {@code pageIndex}. */
    static float[] widget(PDDocument doc, int pageIndex, String name) {
        PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
        PDField f = form.getField(name);
        assertTrue(f instanceof PDTerminalField, "field: " + name);
        float height = doc.getPage(pageIndex).getMediaBox().getHeight();
        PDRectangle r = ((PDTerminalField) f).getWidgets().get(0).getRectangle();
        return new float[] {height - r.getUpperRightY(), height - r.getLowerLeftY()};
    }

    @Test
    void scheduleSpLine2BoxSitsOnThePrintedNontaxableInterestRow() throws Exception {
        // The template's line 2 and 3 field names (tooltips) are swapped against the printed captions; the config maps
        // /paSpLine2 by position. Check the boxes against the printed rows of Section III, column A (template page 2).
        try (PDDocument doc = Loader.loadPDF(Files.readAllBytes(Path.of(SP_TEMPLATE)))) {
            float[] line2Row = textLine(doc, 1, "Nontaxable interest, dividends and gains");
            float[] line3Row = textLine(doc, 1, "Alimony");
            float[] mapped = widget(doc, 1, SP_LINE2_PRINTED_BOX);
            float[] other = widget(doc, 1, SP_LINE3_PRINTED_BOX);
            float mappedMid = (mapped[0] + mapped[1]) / 2;
            float otherMid = (other[0] + other[1]) / 2;
            assertTrue(
                    mappedMid > line2Row[0] && mappedMid < line2Row[1] + 2,
                    "box mapped to /paSpLine2 is on printed row 2");
            assertTrue(
                    otherMid > line3Row[0] && otherMid < line3Row[1] + 2,
                    "the other box is on printed row 3 (alimony)");
        }
        String config = Files.readString(Path.of(SP_CONFIG));
        assertTrue(
                config.contains("\"" + SP_LINE2_PRINTED_BOX + "\": /paSpLine2"), "config maps the printed row 2 box");
        assertFalse(config.contains("\"" + SP_LINE3_PRINTED_BOX + "\":"), "printed row 3 (alimony) is not mapped");
    }

    @Test
    void schoolDistrictCodesMatchTheFactLimitAndTheBooklet() throws Exception {
        // PA-40 IN (2025) pp. 46-47 list 500 districts; paPit.xml /paSchoolDistrictCode accepts exactly those codes.
        Map<String, String> names = PaSchoolDistricts.all();
        assertEquals(500, names.size(), "500 school districts");
        assertEquals("Harrisburg City", PaSchoolDistricts.name("22275"));
        assertEquals("", PaSchoolDistricts.name("99999"), "99999 has no district name");
        String xml = Files.readString(Path.of("src/main/resources/tax/paPit.xml"));
        Matcher m = Pattern.compile(
                        "<Fact path=\"/paSchoolDistrictCode\">.*?<!\\[CDATA\\[\\(\\?:([0-9|]+)\\)\\]\\]>",
                        Pattern.DOTALL)
                .matcher(xml);
        assertTrue(m.find(), "Match limit on /paSchoolDistrictCode");
        Set<String> limit = new TreeSet<>(List.of(m.group(1).split("\\|")));
        assertEquals(new TreeSet<>(names.keySet()), limit, "fact limit codes == booklet codes");
        assertTrue(limit.stream().allMatch(c -> c.matches("[0-9]{5}")), "five digits");
        assertFalse(limit.contains("99999"), "99999 is filled in, not entered");
    }

    @Test
    void longestSchoolDistrictNameFitsItsBox() throws Exception {
        // "Name of School District" has an automatic font size; the config lists it under fitTextToWidth.
        String longest = PaSchoolDistricts.all().values().stream()
                .map(n -> n.toUpperCase(java.util.Locale.US))
                .max(java.util.Comparator.comparingInt(String::length))
                .orElseThrow();
        try (PDDocument doc = Loader.loadPDF(Files.readAllBytes(Path.of(PA40_TEMPLATE)))) {
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            var field =
                    (org.apache.pdfbox.pdmodel.interactive.form.PDTextField) form.getField("Name of School District");
            PdfForm.fitTextToWidth(form, field, longest);
            Matcher size = Pattern.compile("/Helv ([0-9.]+) Tf").matcher(field.getDefaultAppearance());
            assertTrue(size.find(), "font size set");
            var font = form.getDefaultResources().getFont(org.apache.pdfbox.cos.COSName.getPDFName("Helv"));
            float width = font.getStringWidth(longest) / 1000f * Float.parseFloat(size.group(1));
            float box = field.getWidgets().get(0).getRectangle().getWidth();
            assertTrue(width <= box - 3.9f, longest + " fits: " + width + " <= " + box);
        }
        String config = Files.readString(Path.of(PA40_CONFIG));
        assertTrue(config.contains("fitTextToWidth: \"Name of School District\""), "config lists the field");
    }

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
            is(p1, "Enter five digit School Code from list on pags 42 & 43", "22275", "school code (p. 5)");
            is(p1, "Name of School District", "HARRISBURG CITY", "school district name (pp. 46-47)");
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
            is(p1, "5. Loss", "Off", "line 5 loss oval");
            blank(p1, "5. Net Gain or Loss from Sale, etc. of Property", "line 5 ($0; any sale is a Schedule D stop)");
            is(p1, "4. Loss", "Off", "line 4 loss oval");
            is(p1, "6. Loss", "Off", "line 6 loss oval");
            blank(p1, "6. Net Income or Loss from Rents, etc", "line 6 ($0; no Schedule E)");
            is(p1, "9. Total PA Taxable Income", "15,000.00", "line 9 (p. 20)");
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
            is(p2, "20. Total Eligibility Income", "15,000.00", "line 20 = SP line 11");
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

    /**
     * Full-year resident, Schedule E Part I rents $12,000 minus expenses $4,000. PA-40 IN (2025) p. 18, LINE 6: "You
     * may use federal Schedule E, if using only Part I, and with the following adjustments". Tax Reform Code of 1971
     * §303(a)(4). Line 6 is $8,000 and line 9 is wages $50,000 plus that net.
     */
    @Test
    void pa40Line6PrintsFederalScheduleEPartINetRents() throws Exception {
        Map<String, String> m = paResident();
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        m.put("/paSchoolDistrictCode", string("22275"));
        ScheduleBAndETy2026PdfSmokeTest.partIScreeners(m, "12000.00", "0.00", "4000.00");
        m.put("/scheduleEHasPartIIIncome", bool(false));
        m.put("/scheduleEHasPartIIIIncome", bool(false));
        m.put("/scheduleEHasPartIVIncome", bool(false));
        byte[] bytes = generate(m);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PA40_PAGE1);
            is(p1, "1a. Gross Compensation", "50,000.00", "line 1a");
            is(p1, "6. Loss", "Off", "line 6 loss oval");
            is(p1, "6. Net Income or Loss from Rents, etc", "8,000.00", "line 6 = 12,000 − 4,000");
            is(p1, "9. Total PA Taxable Income", "58,000.00", "line 9 includes line 6");
        }
    }

    @Test
    void pa40RefusesScheduleEWhenAK1IsPresent() throws Exception {
        Map<String, String> m = paResident();
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        m.put("/paSchoolDistrictCode", string("22275"));
        ScheduleBAndETy2026PdfSmokeTest.partIScreeners(m, "12000.00", "0.00", "4000.00");
        ScheduleBAndETy2026PdfSmokeTest.partIIGate(m);
        m.put("/scheduleEK1s", collection(ScheduleBAndETy2026PdfSmokeTest.K1));
        ScheduleBAndETy2026PdfSmokeTest.k1(m, ScheduleBAndETy2026PdfSmokeTest.K1, "Northwind Partners", "P", "12000.00");
        refusesPa(m);
    }

    @Test
    void pa40RefusesScheduleEForAPartYearResident() throws Exception {
        Map<String, String> m = partYearScenario();
        ScheduleBAndETy2026PdfSmokeTest.partIScreeners(m, "12000.00", "0.00", "4000.00");
        m.put("/scheduleEHasPartIIIncome", bool(false));
        m.put("/scheduleEHasPartIIIIncome", bool(false));
        m.put("/scheduleEHasPartIVIncome", bool(false));
        refusesPa(m);
    }

    /** Print fails closed on /flowKnockoutPaUnsupportedIncome. No new print-refuse path. */
    static void refusesPa(Map<String, String> facts) {
        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(
                List.of("/flowKnockoutPaUnsupportedIncome"),
                e.getBody().getProperties().get("blockingFacts"));
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
            blank(p2, SP_LINE2_PRINTED_BOX, "printed line 2 ($0: box 3 interest is a Schedule A stop)");
            blank(p2, SP_LINE3_PRINTED_BOX, "printed line 3 (alimony, not collected)");
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
            blank(p1, "Name of School District", "no district for 99999");
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
            blank(p2, "22. Resident Credit", "line 22");
        }
    }

    @Test
    void flToPaMoverPrintsThePaResidencyPeriod() throws Exception {
        byte[] bytes = generate(flToPaScenario());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PA40_PAGE1);
            assertFalse(p1.isEmpty(), "PA-40 printed");
            is(p1, "Residency Status", "3", "(P) Part-Year Resident (p. 6)");
            is(p1, "Part Year Resident from", "04/01", "PA residency from the move date");
            is(p1, "Part year resident to", "12/31", "through the end of the year");
            is(p1, "Enter five digit School Code from list on pags 42 & 43", "22275", "still in PA on Dec. 31");
            is(p1, "Name of School District", "HARRISBURG CITY", "school district name (pp. 46-47)");
            is(p1, "1a. Gross Compensation", "50,000.00", "line 1a (PA W-2 box 16)");
            Map<String, String> p2 = fieldsOnPages(doc, PA40_PAGE2);
            is(p2, "12. PA Tax Liability. Multiply Line 11 by 3.07%", "1,535.00", "line 12 = 50,000 x 3.07%");
            blank(p2, "22. Resident Credit", "line 22");
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
