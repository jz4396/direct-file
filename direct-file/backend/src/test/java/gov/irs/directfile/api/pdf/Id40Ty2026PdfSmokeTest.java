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
 * #93 slice 7: 2025 Form 40 as the interim tax year 2026 template. Single full-year Idaho resident, one W-2, box 1
 * $59,411, box 15 Idaho, box 17 $2,000. Line 19 is $43,311. 38,500 × 5.3% = $2,040.50, which rounds half-up to
 * $2,041. Line 41 is $2,051. Refund $104. The preprinted form still says 2025, and the $10 on line 31 is preprinted.
 */
class Id40Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static Map<String, String> supported() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("id", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Boise\",\"postalCode\":\"83702\",\"stateOrProvence\":\"ID\"}}");
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("59411.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("59411.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("2000.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/idResidencyStatus", enumValue("fullYear", "/idResidencyOptions"));
        m.put("/idHasUseTax", bool(false));
        m.put("/idReceivedPublicAssistance", bool(false));
        m.put("/idReceivedSnapOrIncarcerated", bool(false));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("FAKEY", form.getField("FirstName1").getValueAsString());
            assertEquals("T", form.getField("Initial1").getValueAsString());
            assertEquals("MCTESTFACE", form.getField("LastName1").getValueAsString());
            assertEquals("555555555", form.getField("SSN").getValueAsString());
            assertEquals("100 SYNTHETIC LN", form.getField("CurrentMailing").getValueAsString());
            assertEquals("BOISE", form.getField("City").getValueAsString());
            assertEquals("ID", form.getField("StateAbbrv").getValueAsString());
            assertEquals("83702", form.getField("ZIPcode").getValueAsString());
            assertEquals("4445550100", form.getField("TaxpayerPhoneNo 2").getValueAsString());
            assertEquals("Yes", form.getField("FilingStatusSingle").getValueAsString());
            assertEquals("Off", form.getField("FilingStatusMarriedJoint").getValueAsString());
            assertEquals("1", form.getField("6aYourself").getValueAsString());
            assertEquals("59411", form.getField("IncomeL7").getValueAsString());
            assertEquals("0", form.getField("IncomeL8").getValueAsString());
            assertEquals("16100", form.getField("TxCompL16").getValueAsString());
            assertEquals("43311", form.getField("TxCompL17").getValueAsString());
            assertEquals("0", form.getField("TxCompL18").getValueAsString());
            assertEquals("43311", form.getField("IncomeL19").getValueAsString());
            assertEquals("2041", form.getField("TxCompL20").getValueAsString());
            assertEquals("2041", form.getField("CreditsL26").getValueAsString());
            assertEquals("Off", form.getField("OtherTaxesL31Check").getValueAsString());
            assertEquals("2051", form.getField("OtherTaxesL32").getValueAsString());
            assertEquals("2051", form.getField("DonationsL41").getValueAsString());
            assertEquals("155", form.getField("FoodCreditL43-1 Amount 1").getValueAsString());
            assertEquals("Off", form.getField("FoodCreditL43-3 DonateCheckbox").getValueAsString());
            assertEquals("2000", form.getField("PymntOtherCreditL46").getValueAsString());
            assertEquals("2155", form.getField("PymntOtherCreditL50 Total 3").getValueAsString());
            assertEquals("0", form.getField("TxDueRefundL51").getValueAsString());
            assertEquals("0", form.getField("TxDueRefundL54").getValueAsString());
            assertEquals("104", form.getField("TxDueRefundL55").getValueAsString());
            assertEquals("104", form.getField("RefundedL56-1").getValueAsString());
            assertEquals("38500", form.getField("Frm40TaxWorksheetL10").getValueAsString());
            assertEquals("2041", form.getField("Frm40TaxWorksheetL12").getValueAsString());
            assertEquals("16100", form.getField("Frm40StdWorksheetL7").getValueAsString());
            assertEquals("12", form.getField("Frm40GroceryCreditWorksheetYourselfL2").getValueAsString());
            assertEquals("155", form.getField("Frm40GroceryCreditWorksheetL6").getValueAsString());
            assertEquals("", form.getField("SpouseSSN").getValueAsString());
        }
    }

    @Test
    void partYearRefusesPublicPrint() {
        Map<String, String> facts = supported();
        facts.put("/idResidencyStatus", enumValue("partYear", "/idResidencyOptions"));
        SubmissionBlockingFactsResponseStatusException ex =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(ex.getMessage().contains("/flowKnockoutIdPartYearOrNonresident"), ex.getMessage());
    }
}
