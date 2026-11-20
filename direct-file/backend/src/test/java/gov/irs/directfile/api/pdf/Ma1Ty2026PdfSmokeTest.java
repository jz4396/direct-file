package gov.irs.directfile.api.pdf;

import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #93 slice 6: 2025 Form 1 and Schedule HC as the interim tax year 2026 templates. Single full-year Massachusetts
 * resident, box 16 $60,010, boxes 4 and 6 at least $2,000, rent $18,000, box 17 $2,700. Line 21 is $49,610.
 * 49,610 × 5% = $2,480.50, which rounds half-up to $2,481. Refund $219. The preprinted form still says 2025.
 */
class Ma1Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static Map<String, String> supported() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("ma", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Boston\",\"postalCode\":\"02108\",\"stateOrProvence\":\"MA\"}}");
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("60010.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("60010.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWithholding", dollar("1500.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWithholding", dollar("500.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("2700.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/maResidencyStatus", enumValue("fullYear", "/maResidencyOptions"));
        m.put("/maRentPaid", dollar("18000.00"));
        m.put("/maHasUseTax", bool(false));
        m.put("/maHasFullYearMcc", bool(true));
        m.put("/maHasRetirementContribution", bool(false));
        m.put("/maElectsOptionalRate", bool(false));
        m.put("/maInsurerName", string("Bay State Health"));
        m.put("/maSubscriberId", string("HC100"));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("FAKEY", form.getField("taxpayer's first name").getValueAsString());
            assertEquals("MCTESTFACE", form.getField("taxpayer's last name").getValueAsString());
            assertEquals("555555555", form.getField("taxpayer's social security number").getValueAsString());
            assertEquals(
                    "100 SYNTHETIC LN",
                    form.getField(
                                    "Mailing address (no. & street; apt./suite/postal box). If you have a foreign address, also complete line below")
                            .getValueAsString());
            assertEquals("BOSTON", form.getField("city or town").getValueAsString());
            assertEquals("MA", form.getField("state").getValueAsString());
            assertEquals("02108", form.getField("zip").getValueAsString());
            assertEquals("Single", form.getField("line 1 filing status").getValueAsString());
            assertEquals("Off", form.getField(
                            "line 22 oval. Note: If choosing the optional 5.85% tax rate, fill in oval and see instructions")
                    .getValueAsString());
            assertEquals(
                    "60010",
                    form.getField(
                                    "line 3. Wages, salaries, tips and other employee compensation (from all Forms W-2)")
                            .getValueAsString());
            assertEquals(
                    "2000",
                    form.getField(
                                    "line 11a. Amount you paid to Social Security, Medicare, Railroad, U.S. or Massachusetts retirement. Not more than $2,000")
                            .getValueAsString());
            assertEquals(
                    "18000",
                    form.getField("line 14a. Enter the total qualified rent paid in 2025 in the box")
                            .getValueAsString());
            assertEquals(
                    "4000",
                    form.getField("line 14 rental deduction. line 14a divided by 2").getValueAsString());
            assertEquals("6000", form.getField("line 16. Total deductions. Add lines 11 through 15")
                    .getValueAsString());
            assertEquals(
                    "54010",
                    form.getField(
                                    "line 17. 5.0% Income after deductions. Subtract line 16 from line 10. Not less than 0")
                            .getValueAsString());
            assertEquals(
                    "49610",
                    form.getField("line 21. Total Taxable 5.0% Income. Add lines 19 and 20")
                            .getValueAsString());
            assertEquals(
                    "2481",
                    form.getField(
                                    "line 22. Tax On 5.0% Income (from tax table). If line 21 is more than $24,000, multiply by .05")
                            .getValueAsString());
            assertEquals(
                    "2700",
                    form.getField("Line 38a. Massachusetts income tax withheld from Form(s) W-2")
                            .getValueAsString());
            assertEquals(
                    "219",
                    form.getField(
                                    "line 54. This Is Your Refund. Subtract line 53 from line 52. Mail to: Massachusetts DOR, PO Box 7000, Boston, MA 02204")
                            .getValueAsString());
            assertEquals(
                    "0",
                    form.getField(
                                    "line 55. Tax Due. Subtract line 51 from line 37. Pay in full online at mass.gov/masstaxconnect")
                            .getValueAsString());
            assertEquals("0", form.getField("line 5. Massachusetts bank interest").getValueAsString());
            assertEquals(
                    "0",
                    form.getField("line 33. Total voluntary fund contributions. Add lines 33a through 33f")
                            .getValueAsString());
            assertEquals("", form.getField("spouse's social security number").getValueAsString());
            assertEquals("Bay State Health", form.getField(
                            "4f line 1. Name of private insurance company, administrator or other government program (from box 1 of form ma 1099-hc)")
                    .getValueAsString());
            assertEquals(
                    "HC100",
                    form.getField(
                                    "4f line 1a. Subscriber number (from form ma 1099-hc) note: if you were not issued form ma 1099-hc, enter the identification number from your health insurance card")
                            .getValueAsString());
            assertEquals(
                    "Full-year MCC",
                    form.getField(
                                    "3a. Indicate the time period that you were enrolled in a Minimum Creditable Coverage (MCC) health insurance plan(s). See Form MA 1099-HC from your insurer or Schedule HC instructions")
                            .getValueAsString());
            assertEquals("1", form.getField("line 1c. Family size. See instructions").getValueAsString());
        }
    }

    /**
     * Line 22 double-rounding guard. Single, 5.85 percent elected, box 16 $30,870, boxes 4 and 6 already $2,000 on
     * the synthetic filer, no rent. Line 17 is $28,870 and line 21 is $24,470. 24,470 × 0.0585 = $1,431.495. Cent
     * rounding half-even makes that $1,431.50, so an unguarded Round would print $1,432. Line 22 is $1,431.
     */
    @Test
    void optionalRateDropsTheDoubleRoundedHalfCent() throws Exception {
        Map<String, String> facts = supported();
        facts.put("/formW2s/#" + W2 + "/writableStateWages", dollar("30870.00"));
        facts.put("/maRentPaid", dollar("0.00"));
        facts.put("/maElectsOptionalRate", bool(true));
        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals(
                    "28870",
                    form.getField(
                                    "line 17. 5.0% Income after deductions. Subtract line 16 from line 10. Not less than 0")
                            .getValueAsString());
            assertEquals(
                    "24470",
                    form.getField("line 21. Total Taxable 5.0% Income. Add lines 19 and 20")
                            .getValueAsString());
            assertEquals(
                    "1431",
                    form.getField(
                                    "line 22. Tax On 5.0% Income (from tax table). If line 21 is more than $24,000, multiply by .05")
                            .getValueAsString());
        }
    }

    @Test
    void filingStatusExportValuesMatchTheForm() {
        assertEquals("Single", Ma1PdfForm.filingStatusExport("single"));
        assertEquals("Married filing jointly", Ma1PdfForm.filingStatusExport("marriedFilingJointly"));
        assertEquals("Head of household", Ma1PdfForm.filingStatusExport("headOfHousehold"));
        assertEquals("Married filing separately", Ma1PdfForm.filingStatusExport("marriedFilingSeparately"));
        assertEquals("", Ma1PdfForm.filingStatusExport("qualifiedSurvivingSpouse"));
    }

    @Test
    void partYearRefusesPublicPrint() {
        Map<String, String> facts = supported();
        facts.put("/maResidencyStatus", enumValue("partYear", "/maResidencyOptions"));
        SubmissionBlockingFactsResponseStatusException ex =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(ex.getMessage().contains("/flowKnockoutMaPartYearOrNonresident"), ex.getMessage());
    }
}
