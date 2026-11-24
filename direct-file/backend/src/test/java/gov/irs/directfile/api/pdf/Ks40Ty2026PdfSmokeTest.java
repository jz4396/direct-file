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
 * #93 slice 8: 2025 Form K-40 as the interim tax year 2026 template. Single full-year Kansas resident, one W-2, box 1
 * $130,000, box 15 Kansas, box 17 $6,500. Line 6 is $12,765. Line 7 is $117,235. 117,235 × 0.0558 − $87 = $6,454.713,
 * which rounds once, half up, to $6,455. Refund $45. The preprinted form still says 2025.
 */
class Ks40Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";

    static String enumValue(String value, String optionsPath) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"" + optionsPath + "\"}}";
    }

    static Map<String, String> supported() {
        Map<String, String> m = new HashMap<>();
        m.put("/filerResidenceAndIncomeState", enumValue("ks", "/scopedStateOptions"));
        m.put(
                "/address",
                "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"100 Synthetic"
                        + " Ln\",\"city\":\"Topeka\",\"postalCode\":\"66612\",\"stateOrProvence\":\"KS\"}}");
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("130000.00"));
        m.put("/formW2s/#" + W2 + "/writableState", enumValue("sameState", "/incomeFormStateOptions"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("130000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("6500.00"));
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        m.put("/soldCapitalAssets", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/ksResidencyStatus", enumValue("fullYear", "/ksResidencyOptions"));
        m.put("/filers/#" + W2 + "/canBeClaimed", bool(false));
        return m;
    }

    @Test
    void supportedReturnPrintsTheHandCheckedLines() throws Exception {
        byte[] bytes = generate(supported());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            var form = doc.getDocumentCatalog().getAcroForm();
            assertEquals("FAKEY", form.getField("your first name").getValueAsString());
            assertEquals("T", form.getField("your middle initial").getValueAsString());
            assertEquals("MCTESTFACE", form.getField("your last name").getValueAsString());
            assertEquals("MCTE", form.getField("enter the first four letters of your last name - all CAPS").getValueAsString());
            assertEquals("555555555", form.getField("your social security number").getValueAsString());
            assertEquals("100 SYNTHETIC LN", form.getField("mailing address").getValueAsString());
            assertEquals("TOPEKA", form.getField("city town or post office").getValueAsString());
            assertEquals("KS", form.getField("state - abbreviation").getValueAsString());
            assertEquals("66612", form.getField("zip code - 5 digit").getValueAsString());
            assertEquals("4445550100", form.getField("daytime telephone number").getValueAsString());
            assertEquals("Yes", form.getField("filing status - single").getValueAsString());
            assertEquals("Off", form.getField("filing status - married filing joint").getValueAsString());
            assertEquals("Yes", form.getField("residency status - resident").getValueAsString());
            assertEquals("Off", form.getField("residency status - part-year resident").getValueAsString());
            assertEquals("Off", form.getField("residency status - nonresident").getValueAsString());
            assertEquals("Off", form.getField(
                    "Check Box - Married individuals filing a joint return, check the box to the left, enter 2 in the box to the right and enter $18,320 in the currency box")
                    .getValueAsString());
            assertEquals("Yes", form.getField(
                    "Check Box - Married individuals filing a seperate return, individuals with a filing status of Single or Head of Household, check the box to the left, enter \"1\" in the box to the right and $9,160 in the currency box")
                    .getValueAsString());
            assertEquals("1", form.getField(
                    "Enter \"1\" in this box - Only if married filing seperate, filing status of single, or Heads of Household")
                    .getValueAsString());
            assertEquals("9160", form.getField(
                    "Enter $9,160 - Only if married filing seperate, filing status of single, or Heads of Household")
                    .getValueAsString());
            assertEquals("", form.getField("Enter \"2\" in this box - Only if Married filing Joint").getValueAsString());
            assertEquals("1", form.getField("total kansas exemptions").getValueAsString());
            assertEquals("9160", form.getField("Total Kansas Exemption Amount. Add all amounts and enter result here")
                    .getValueAsString());
            assertEquals("130000", form.getField(
                    "1 federal adjusted gross income, as reported on your federal income tax return").getValueAsString());
            assertEquals("0", form.getField("2 modifications, from Sch S line a27, enclose sch s").getValueAsString());
            assertEquals("130000", form.getField(
                    "3 kansas adjusted gross income, line 2 added or subtracted from line 1").getValueAsString());
            assertEquals("3605", form.getField("4 standard deduction or itemized deductions").getValueAsString());
            assertEquals("9160", form.getField("5 exemption allowance, x number of exemptions claimed").getValueAsString());
            assertEquals("12765", form.getField("6 total dudecutions, add lines 4 and 5").getValueAsString());
            assertEquals("117235", form.getField(
                    "7 taxable income, subtract line6 from line 3; if less than zero enter 0").getValueAsString());
            assertEquals("6455", form.getField("8 tax, use tax tables ot tax computation schedule").getValueAsString());
            assertEquals("0", form.getField("11 kansas tax on lump sum distributions, residents only").getValueAsString());
            assertEquals("6455", form.getField(
                    "12 total income tax, residnets add lines 8 and 11; nonresidents enter amount form line 10")
                    .getValueAsString());
            assertEquals("6455", form.getField("16 subtotal, subtract lines 13, 14 and 15 from line 12").getValueAsString());
            assertEquals("0", form.getField("17 earned income tax credit").getValueAsString());
            assertEquals("6455", form.getField(
                    "18 total tax balance, subtract lines 17 from line 16; Cannot be less than zero").getValueAsString());
            assertEquals("6500", form.getField("19 kansas income tax withheld from w2 and or 1099s").getValueAsString());
            assertEquals("6500", form.getField(
                    "27 total refundable credits, add lines 19 - 25 and subtract line 26").getValueAsString());
            assertEquals("0", form.getField(
                    "28 underpayment, if line 18 is greater than line 27 enter the difference here").getValueAsString());
            assertEquals("0", form.getField(
                    "32 amount you owe, add lines 28 - 31 and any entries on lines 35 - 42").getValueAsString());
            assertEquals("45", form.getField(
                    "33 overpayment, if line 18 is less than 27 enter differnce here").getValueAsString());
            assertEquals("0", form.getField("35 chickadee checkoff").getValueAsString());
            assertEquals("45", form.getField("43 refund, subtract lines 34 - 42 from line 33").getValueAsString());
            assertEquals("", form.getField("your spouses social security number").getValueAsString());
        }
    }

    @Test
    void partYearRefusesPublicPrint() {
        Map<String, String> facts = supported();
        facts.put("/ksResidencyStatus", enumValue("partYear", "/ksResidencyOptions"));
        SubmissionBlockingFactsResponseStatusException ex =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(ex.getMessage().contains("/flowKnockoutKsPartYearOrNonresident"), ex.getMessage());
    }
}
