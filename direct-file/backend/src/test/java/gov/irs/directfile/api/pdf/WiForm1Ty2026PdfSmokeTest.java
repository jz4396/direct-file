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
 * #93 slice 10: 2025 Form 1 as the interim tax year 2026 template. Single full-year Wisconsin resident, one W-2, box 1
 * $60,000, box 15 Wisconsin, box 17 $2,500. Line 7 is $60,000, in the $60,000–$60,500 standard deduction row.
 * The midpoint is $60,250: $13,560 − 12% × $40,700 = $8,676. Line 11 is $50,624. The tax-table midpoint is $50,650:
 * $2,089 + 5.3% × $170 = $2,098.01, which rounds once, half up, to $2,098. Refund $402. The preprinted form still
 * says 2025.
 */
class WiForm1Ty2026PdfSmokeTest {
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
        m.put("/filerResidenceAndIncomeState", enumValue("wi", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Madison\",\"postalCode\":\"53703\",\"stateOrProvence\":\"WI\"}}");
        m.put("/filers/#" + W2 + "/tin", tin("444", "00", "0001"));
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("2500.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/wiResidencyStatus", enumValue("fullYear", "/wiResidencyOptions"));
        m.put("/wiHasAdditionsOrSubtractions", bool(false));
        m.put("/wiHasUnmodeledCredits", bool(false));
        m.put("/wiHasUseTax", bool(false));
        m.put("/wiHasTaxPaidOtherState", bool(false));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("444", form.getField("ss3").getValueAsString());
            assertEquals("00", form.getField("ss2").getValueAsString());
            assertEquals("0001", form.getField("ss4").getValueAsString());
            assertEquals("Single", form.getField("status").getValueAsString());
            assertEquals("Yes", form.getField("23-checkbox").getValueAsString());
            assertEquals("60000", form.getField("line1").getValueAsString());
            assertEquals("60000", form.getField("7").getValueAsString());
            assertEquals("8676", form.getField("8").getValueAsString());
            assertEquals("51324", form.getField("9").getValueAsString());
            assertEquals("1", form.getField("10a").getValueAsString());
            assertEquals("700", form.getField("line10a").getValueAsString());
            assertEquals("50624", form.getField("11").getValueAsString());
            assertEquals("2098", form.getField("12").getValueAsString());
            assertEquals("0", form.getField("18").getValueAsString());
            assertEquals("2098", form.getField("22").getValueAsString());
            assertEquals("2098", form.getField("27").getValueAsString());
            assertEquals("2500", form.getField("line28").getValueAsString());
            assertEquals("402", form.getField("41").getValueAsString());
            assertEquals("0", form.getField("45").getValueAsString());
            assertEquals("100 SYNTHETIC LN", form.getField("address").getValueAsString());
            assertEquals("MADISON", form.getField("city").getValueAsString());
            assertEquals("WI", form.getField("state").getValueAsString());
            assertEquals("53703", form.getField("zip").getValueAsString());
        }
    }
}
