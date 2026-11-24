package gov.irs.directfile.api.pdf;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrintOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #93 slice 5: 2025 Form 140 as the interim tax year 2026 template. Single full-year Arizona resident, one W-2, box 1
 * $55,000, box 15 Arizona, box 17 $1,100. Line 45 is $38,900. 38,900 × 2.5% = $972.50, which rounds half-up to $973.
 * Refund $127. The preprinted form still says 2025 in the header and on several lines.
 */
class Az140Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static Map<String, String> supported() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("az", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Phoenix\",\"postalCode\":\"85004\",\"stateOrProvence\":\"AZ\"}}");
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("55000.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("1100.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/azResidencyStatus", enumValue("fullYear", "/azResidencyOptions"));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("FAKEY T", form.getField("Your First Name and Middle Initial").getValueAsString());
            assertEquals("MCTESTFACE", form.getField("Your Last Name").getValueAsString());
            assertEquals("555555555", form.getField("Your SSN").getValueAsString());
            assertEquals("100 SYNTHETIC LN", form.getField("Current Home Address - number and street, rural route")
                    .getValueAsString());
            assertEquals("PHOENIX", form.getField("City, Town, Post Office").getValueAsString());
            assertEquals("AZ", form.getField("State").getValueAsString());
            assertEquals("85004", form.getField("ZIP Code").getValueAsString());
            assertEquals("4445550100", form.getField("Daytime Phone").getValueAsString());
            assertEquals("Single", form.getField("Filing Status").getValueAsString());
            assertEquals("Standard", form.getField("Itemized/Standard").getValueAsString());
            assertEquals(
                    "55000",
                    form.getField("Federal adjusted gross income (from your federal return)")
                            .getValueAsString());
            assertEquals("0", form.getField("Small Bussiness Income").getValueAsString());
            assertEquals(
                    "16100", form.getField("Deductions:  Check box and enter amount").getValueAsString());
            assertEquals(
                    "0",
                    form.getField(
                                    "If you checked box 43S and claim charitable contributions, check 44C. Complete page 3")
                            .getValueAsString());
            assertEquals(
                    "38900",
                    form.getField(
                                    "Arizona taxable income:  Subtract lines 43 and 44 from line 42.  If less than zero, enter “0”")
                            .getValueAsString());
            assertEquals(
                    "973",
                    form.getField("Tax:  Multiply line 45 by 2.5% (.025).  Enter the result")
                            .getValueAsString());
            assertEquals("1100", form.getField("2025 AZ income tax withheld").getValueAsString());
            assertEquals("0", form.getField("Age 65 or over").getValueAsString());
            assertEquals("0", form.getField("40E").getValueAsString());
            assertEquals(
                    "0",
                    form.getField(
                                    "TAX DUE:  If line 52 is larger than line 59, subtract line 59 from line 52.  Enter amount of tax due. Skip lines 61, 62 and 63")
                            .getValueAsString());
            assertEquals("127", form.getField("REFUND: Subtract line 78 from line 63").getValueAsString());
            assertEquals("", form.getField("Spouse's SSN").getValueAsString());
        }
    }

    @Test
    void filingStatusExportValuesMatchTheForm() {
        assertEquals("Single", Az140PdfForm.filingStatusExport("single"));
        assertEquals("Married Filing Joint Return", Az140PdfForm.filingStatusExport("marriedFilingJointly"));
        assertEquals("Head of Household", Az140PdfForm.filingStatusExport("headOfHousehold"));
        assertEquals("Married Filing Separate Return", Az140PdfForm.filingStatusExport("marriedFilingSeparately"));
        assertEquals("", Az140PdfForm.filingStatusExport("qualifiedSurvivingSpouse"));
    }

    @Test
    void partYearRefusesPublicPrint() {
        Map<String, String> facts = supported();
        facts.put("/azResidencyStatus", enumValue("partYear", "/azResidencyOptions"));
        SubmissionBlockingFactsResponseStatusException ex =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(ex.getMessage().contains("/flowKnockoutAzPartYearOrNonresident"), ex.getMessage());
    }

    /**
     * Golden W (#135), public print path. The facts are {@code golden-profileW-complete.json}, the persisted client
     * profile {@code profileWAzMfjW2}: Indy and Jules Example, full-year Arizona, married filing jointly, both under
     * 65, no dependents, standard deduction. Two W-2s, box 15 Arizona. Primary boxes 1, 3, and 5 $70,000, box 2
     * $5,800, box 16 $70,000, box 17 $1,300. Spouse boxes 1, 3, and 5 $45,000, box 2 $3,700, box 16 $45,000, box 17
     * $800.
     *
     * <p>Form 1040 line 1z, line 9, and line 11 are $115,000. Line 12e is the $32,200 joint standard deduction. Rev.
     * Proc. 2025-32 §4.14, PDF p. 18. Line 15 is $82,800. The Tax Table row is $82,800–$82,850; the tax on the $82,825
     * midpoint is $2,480 + 12% × ($82,825 − $24,800) = $9,443. Rev. Proc. 2025-32 §4.01 Table 1, PDF p. 10. Instructions
     * for Form 1040 (2025), PDF p. 36. Line 24 is $9,443. Line 25a is $9,500. Line 34 and line 35a are the $57 refund.
     *
     * <p>Form 140 line 12 and line 42 are $115,000. Line 43 is $32,200. A.R.S. 43-1041; Rev. Proc. 2025-32 §4.14. Line
     * 45 is $82,800. Line 46 is 82,800 × 2.5% = $2,070 exactly. 2025 Form 140 instructions, line 46; A.R.S. 43-1011.
     * Credits are $0, so line 52 is $2,070. Line 53 is $2,100. The refund is $30.
     *
     * <p>Group-00 test SSNs (the SSA never assigns group 00). A 9xx area is not an SSN. The same pattern is Golden G,
     * Golden Q, Golden R, Golden S, Golden T, and Golden U. These are the next pair after Golden V.
     */
    @Test
    void goldenWPrintsForm1040AndForm140OnThePublicPath() throws Exception {
        byte[] bytes = generatePublicPrintOf("submission-blocking/golden-profileW-complete.json");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f =
                    PaPit40ScheduleSpTy2026PdfSmokeTest.fieldsOnPages(doc, Schedules123Ty2026PdfSmokeTest.F1040);
            assertTrue(
                    Schedules123Ty2026PdfSmokeTest.any(f, "f1_14[0]").toUpperCase().contains("INDY"),
                    "Form 1040 first name");
            assertTrue(
                    Schedules123Ty2026PdfSmokeTest.any(f, "f1_17[0]").toUpperCase().contains("JULES"),
                    "Form 1040 spouse first name");
            assertEquals(
                    "444002017",
                    PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].f1_16[0]").replaceAll("\\D", ""),
                    "SSN");
            assertEquals(
                    "444002018",
                    PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].f1_19[0]").replaceAll("\\D", ""),
                    "spouse SSN");
            assertEquals("Off", PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[0]"), "single is not checked");
            assertFalse(
                    Set.of("", "Off").contains(PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[1]")),
                    "married filing jointly is checked");
            assertEquals(
                    "Off",
                    PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[2]"),
                    "married filing separately is not checked");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_31[0]", "no dependent");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_47[0]", 115000, "Form 1040 line 1a wages");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_57[0]", 115000, "Form 1040 line 1z");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_73[0]", 115000, "Form 1040 line 9");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_74[0]", "Form 1040 line 10 ($0 adjustments)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_75[0]", 115000, "Form 1040 line 11a AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_01[0]", 115000, "Form 1040 line 11b AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_02[0]", 32200, "Form 1040 line 12e standard deduction");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_07[0]", 82800, "Form 1040 line 15 taxable income");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_09[0]", 9443, "Form 1040 line 16 tax");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_12[0]", "Form 1040 line 19 child tax credit ($0)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_15[0]", 9443, "Form 1040 line 22 tax after credits");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_17[0]", 9443, "Form 1040 line 24a total tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_20[0]", 9500, "Form 1040 line 25a withholding");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_23[0]", 9500, "Form 1040 line 25d");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_34[0]", 9500, "Form 1040 line 33 payments");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_35[0]", 57, "Form 1040 line 34 overpayment");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_36[0]", 57, "Form 1040 line 35a refund");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_40[0]", 0, "Form 1040 line 37 amount owed ($0)");

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            assertNotNull(form, "Form 140 is in the package");
            assertEquals("INDY", form.getField("Your First Name and Middle Initial").getValueAsString());
            assertEquals("EXAMPLE", form.getField("Your Last Name").getValueAsString());
            assertEquals("444002017", form.getField("Your SSN").getValueAsString());
            assertEquals("JULES", form.getField("Spouse's First Name and Middle Initial").getValueAsString());
            assertEquals("EXAMPLE", form.getField("Spouse's Last Name").getValueAsString());
            assertEquals("444002018", form.getField("Spouse's SSN").getValueAsString());
            assertEquals(
                    "123 EXAMPLE ST",
                    form.getField("Current Home Address - number and street, rural route").getValueAsString());
            assertEquals("PHOENIX", form.getField("City, Town, Post Office").getValueAsString());
            assertEquals("AZ", form.getField("State").getValueAsString());
            assertEquals("85004", form.getField("ZIP Code").getValueAsString());
            assertEquals("4445550100", form.getField("Daytime Phone").getValueAsString());
            assertEquals("Married Filing Joint Return", form.getField("Filing Status").getValueAsString());
            assertEquals("Standard", form.getField("Itemized/Standard").getValueAsString());
            assertEquals(
                    "115000",
                    form.getField("Federal adjusted gross income (from your federal return)").getValueAsString());
            assertEquals(
                    "115000",
                    form.getField(
                                    "Arizona adjusted gross income:  Subtract lines 38 through 41 from line 37.  If less than zero, enter “0”")
                            .getValueAsString());
            assertEquals("32200", form.getField("Deductions:  Check box and enter amount").getValueAsString());
            assertEquals(
                    "0",
                    form.getField(
                                    "If you checked box 43S and claim charitable contributions, check 44C. Complete page 3")
                            .getValueAsString());
            assertEquals(
                    "82800",
                    form.getField(
                                    "Arizona taxable income:  Subtract lines 43 and 44 from line 42.  If less than zero, enter “0”")
                            .getValueAsString());
            assertEquals(
                    "2070",
                    form.getField("Tax:  Multiply line 45 by 2.5% (.025).  Enter the result").getValueAsString());
            assertEquals("0", form.getField("Dependent Tax Credit.  See instructions").getValueAsString());
            assertEquals(
                    "0",
                    form.getField("Family income tax credit (from the worksheet - see instructions)")
                            .getValueAsString());
            assertEquals(
                    "0",
                    form.getField("Nonrefundable Credits from Arizona Form 301, Part 2, line 60")
                            .getValueAsString());
            assertEquals(
                    "2070",
                    form.getField(
                                    "Balance of tax:  Subtract lines 49, 50 and 51 from line 48.  If the sum of lines 49, 50 and 51 is greater than line 48, enter “0”")
                            .getValueAsString());
            assertEquals("2100", form.getField("2025 AZ income tax withheld").getValueAsString());
            assertEquals(
                    "0",
                    form.getField(
                                    "TAX DUE:  If line 52 is larger than line 59, subtract line 59 from line 52.  Enter amount of tax due. Skip lines 61, 62 and 63")
                            .getValueAsString());
            assertEquals(
                    "30",
                    form.getField(
                                    "OVERPAYMENT:  If line 59 is larger than line 52, subtract line 52 from line 59.  Enter amount of overpayment")
                            .getValueAsString());
            assertEquals("30", form.getField("REFUND: Subtract line 78 from line 63").getValueAsString());
            assertEquals("0", form.getField("Age 65 or over").getValueAsString());
            assertEquals("0", form.getField("40E").getValueAsString());

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Schedule B (Form 1040) 2026"), "no Schedule B");
            assertFalse(text.contains("SCHEDULE A (Form 1040) 2026"), "no Schedule A");
            assertFalse(text.contains("Schedule 1 (Form 1040) 2026"), "no Schedule 1");
            assertFalse(text.contains("Schedule D (Form 1040) 2026"), "no Schedule D");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheets dropped");
            assertFalse(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1),
                    "no PA-40 for a full-year Arizona resident");
            assertTrue(Form6251Ty2026PdfSmokeTest.form6251Fields(doc).isEmpty(), "Form 6251 is not attached");
        }
    }
}
