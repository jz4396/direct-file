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
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * #93 slice 3: 2025 IL-1040 and Schedule IL-WIT as interim tax year 2026 templates. Single full-year Illinois
 * resident, one W-2, box 1 $55,000, box 15 Illinois, box 17 $3,000. Line 11 $52,075 × 4.95% = $2,577.7125, which
 * rounds to $2,578. Refund $422. Line 21 prints 0.
 */
class Il1040Ty2026PdfSmokeTest {
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
        m.put("/filerResidenceAndIncomeState", enumValue("il", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Springfield\",\"postalCode\":\"62704\",\"stateOrProvence\":\"IL\"}}");
        m.put("/filers/#" + W2 + "/tin", tin("900", "00", "3456"));
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("55000.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("3000.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/ilResidencyStatus", enumValue("fullYear", "/ilResidencyOptions"));
        m.put("/ilHasScheduleM", bool(false));
        m.put("/ilClaimsIlEitcOrCtc", bool(false));
        m.put("/ilHasNonrefundableCredits", bool(false));
        m.put("/ilHasUseTax", bool(false));
        m.put("/ilHasCannabisOrGamingSurcharge", bool(false));
        m.put("/ilHasPassThroughWithholdingOrCredit", bool(false));
        m.put("/ilHasEstimatedOrPriorYearCredit", bool(false));
        m.put("/ilNeedsForm2210", bool(false));
        m.put("/ilHasScheduleGDonation", bool(false));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLinesAndAZeroUseTax() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("55,000", form.getField("Illinois base income").getValueAsString());
            assertEquals("2,925", form.getField("Exemption allowance").getValueAsString());
            assertEquals("52,075", form.getField("Illinois net income from Schedule NR").getValueAsString());
            assertEquals("2,578", form.getField("Multiply residency rate").getValueAsString());
            assertEquals("0", form.getField("Use tax").getValueAsString());
            assertFalse(form.getField("Use tax").getValueAsString().isBlank());
            assertEquals("3,000", form.getField("Illinois Income Tax withheld").getValueAsString());
            assertEquals("422", form.getField("Refunded to you").getValueAsString());
            assertEquals("0", form.getField("Amount you owe").getValueAsString());
            assertEquals("paper check", form.getField("refund").getValueAsString());
            assertEquals("single", form.getField("filing_status").getValueAsString());
            assertEquals("3,000", form.getField("Total amount").getValueAsString());
            assertEquals("W", form.getField("Form type - 1").getValueAsString());
        }
    }
}
