package gov.irs.directfile.api.pdf;

import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * #93 slice 9: 2025 PIT-1 as the interim tax year 2026 template. Single full-year New Mexico resident, one W-2, box 1
 * $60,000, box 15 New Mexico, box 17 $2,000. Line 12 is $16,100. Line 17 is $43,900, the top of the $43,800–$43,900
 * row. The midpoint is $43,850: $1,165.50 + 4.7% × $10,350 = $1,651.95, which rounds once, half up, to $1,652. Refund
 * $348. The preprinted form still says 2025.
 */
class NmPit1Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static String tin(String area, String group, String serial) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.TinWrapper\",\"item\":{\"area\":\"" + area + "\",\"group\":\""
                + group + "\",\"serial\":\"" + serial + "\"}}";
    }

    static Map<String, String> supported() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("nm", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Santa Fe\",\"postalCode\":\"87501\",\"stateOrProvence\":\"NM\"}}");
        m.put("/filers/#" + W2 + "/tin", tin("444", "00", "0001"));
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("2000.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/nmResidencyStatus", enumValue("fullYear", "/nmResidencyOptions"));
        m.put("/nmHasPitAdj", bool(false));
        m.put("/nmHasCreditForTaxesPaid", bool(false));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("444000001", form.getField("NmSsn").getValueAsString());
            assertEquals("X", form.getField("NmSingle").getValueAsString());
            assertEquals("", form.getField("NmJoint").getValueAsString());
            assertEquals("R", form.getField("NmResidency").getValueAsString());
            assertEquals("R", form.getField("Nm18a").getValueAsString());
            assertEquals("60000", form.getField("NmL9").getValueAsString());
            assertEquals("16100", form.getField("NmL12").getValueAsString());
            assertEquals("0", form.getField("NmL10").getValueAsString());
            assertEquals("0", form.getField("NmL14").getValueAsString());
            assertEquals("43900", form.getField("NmL17").getValueAsString());
            assertEquals("1652", form.getField("NmL18").getValueAsString());
            assertEquals("1652", form.getField("NmL22").getValueAsString());
            assertEquals("1652", form.getField("NmL23").getValueAsString());
            assertEquals("2000", form.getField("NmL27").getValueAsString());
            assertEquals("2000", form.getField("NmL32").getValueAsString());
            assertEquals("0", form.getField("NmL33").getValueAsString());
            assertEquals("348", form.getField("NmL42").getValueAsString());
            assertEquals("100 SYNTHETIC LN", form.getField("NmStreet").getValueAsString());
            assertEquals("SANTA FE", form.getField("NmCity").getValueAsString());
            assertEquals("NM", form.getField("NmState").getValueAsString());
            assertEquals("87501", form.getField("NmZip").getValueAsString());
        }
    }
}
