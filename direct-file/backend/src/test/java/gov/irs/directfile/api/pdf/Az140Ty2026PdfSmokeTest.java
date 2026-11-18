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
import static org.junit.jupiter.api.Assertions.assertEquals;
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
}
