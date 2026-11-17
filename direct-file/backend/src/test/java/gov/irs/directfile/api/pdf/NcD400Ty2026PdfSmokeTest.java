package gov.irs.directfile.api.pdf;

import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
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
 * #93 slice 4: 2025 Form D-400 as the interim tax year 2026 template. Single full-year North Carolina resident, one
 * W-2, box 1 $55,000, box 17 $2,000. Line 11 $12,750. Line 14 $42,250 × 3.99% = $1,685.775, which rounds to $1,686.
 * Refund $314. The preprinted line 15 sentence still says 4.25 percent.
 */
class NcD400Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static Map<String, String> supported() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("nc", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Raleigh\",\"postalCode\":\"27601\",\"stateOrProvence\":\"NC\"}}");
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("55000.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("2000.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/ncResidencyStatus", enumValue("fullYear", "/ncResidencyOptions"));
        m.put("/ncCounty", "{\"$type\":\"gov.irs.factgraph.persisters.StringWrapper\",\"item\":\"Mecklenburg\"}");
        m.put("/ncIsVeteran", bool(false));
        m.put("/ncHasScheduleS", bool(false));
        m.put("/ncClaimsChildDeduction", bool(false));
        m.put("/ncItemizes", bool(false));
        m.put("/ncHasD400TcCredit", bool(false));
        m.put("/ncHasUseTax", bool(false));
        m.put("/ncHasOtherPayments", bool(false));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("FAKEY", form.getField("y_d400wf_fname1").getValueAsString());
            assertEquals("T", form.getField("y_d400wf_mi1").getValueAsString());
            assertEquals("MCTESTFACE", form.getField("y_d400wf_lname1").getValueAsString());
            assertEquals("555555555", form.getField("y_d400wf_ssn1").getValueAsString());
            assertEquals("[NC]", form.getField("y_d400wf_state").getValueAsString());
            assertEquals("MECKL", form.getField("y_d400wf_county").getValueAsString());
            assertEquals("Yes", form.getField("y_d400wf_fstat1").getValueAsString());
            assertEquals("Off", form.getField("y_d400wf_fstat2").getValueAsString());
            assertTrue(((PDCheckBox) form.getField("y_d400wf_v2no")).isChecked());
            assertTrue(((PDCheckBox) form.getField("y_d400wf_rs1yes")).isChecked());
            assertTrue(((PDCheckBox) form.getField("y_d400wf_ncstandarddeduction")).isChecked());
            assertTrue(((PDCheckBox) form.getField("y_d400wf_Consumer Use Tax")).isChecked());
            assertEquals("55000", form.getField("y_d400wf_li6_good").getValueAsString());
            assertEquals("0", form.getField("y_d400wf_li7_good").getValueAsString());
            assertEquals("0", form.getField("y_d400wf_li10b_good").getValueAsString());
            assertEquals("12750", form.getField("y_d400wf_li11_page1_good").getValueAsString());
            assertEquals("42250", form.getField("y_d400wf_li14_pg1_good").getValueAsString());
            assertEquals("1686", form.getField("y_d400wf_li15_pg1_good").getValueAsString());
            assertEquals("0", form.getField("y_d400wf_li18_pg2_good").getValueAsString());
            assertEquals("2000", form.getField("y_d400wf_li20a_pg2_good").getValueAsString());
            assertEquals("0", form.getField("y_d400wf_li20b_pg2_good").getValueAsString());
            assertEquals("0", form.getField("y_d400wf_li21a_pg2_good").getValueAsString());
            assertEquals("0", form.getField("y_d400wf_li27_pg2_good").getValueAsString());
            assertEquals("314", form.getField("y_d400wf_li34_pg2_good").getValueAsString());
            assertEquals("", form.getField("y_d400wf_li13_page1_good").getValueAsString());
        }
    }

    @Test
    void countyPrintsTheFirstFiveLetters() {
        assertEquals("MECKL", NcD400PdfForm.countyCode("Mecklenburg"));
        assertEquals("NEWHA", NcD400PdfForm.countyCode("New Hanover"));
        assertEquals("WAKE", NcD400PdfForm.countyCode("Wake"));
    }

    @Test
    void useTaxRefusesPublicPrint() {
        Map<String, String> facts = supported();
        facts.put("/ncHasUseTax", bool(true));
        SubmissionBlockingFactsResponseStatusException ex =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(ex.getMessage().contains("/flowKnockoutNcUseTax"), ex.getMessage());
    }
}
