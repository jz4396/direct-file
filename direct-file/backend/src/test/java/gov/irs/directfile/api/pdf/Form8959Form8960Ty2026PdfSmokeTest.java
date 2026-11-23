package gov.irs.directfile.api.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.cents;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrintOf;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 2026 draft Forms 8959 (https://www.irs.gov/pub/irs-dft/f8959--dft.pdf) and 8960
 * (https://www.irs.gov/pub/irs-dft/f8960--dft.pdf) end-to-end through the real PdfService, fact dictionary and
 * application.yaml. Draft-based field maps: re-verify when the final forms are released.
 *
 * <p>Golden end-to-end scenario (synthetic data, same filer as the Schedule D smoke fixture): single, one W-2 with
 * $250,000 wages and Medicare wages and $4,075 Medicare tax withheld, one Form 1099-INT with $10,000 interest (box 1)
 * and a $150 early withdrawal penalty (box 2), and the fixture's two Form 8949 sales ($4,000 short-term and $5,000
 * long-term gain, $9,000 on Form 1040 line 7a). Worked figures:
 *
 * <pre>
 *   Form 8959: 1 250,000  4 250,000  5 200,000  6 50,000  7 450 (0.9%)  12 450 (Schedule 2 line 17b)
 *              13 0  14 200,000  15 250,000  16 0  17 0  18 blank (0)
 *              19 4,075  20 250,000  21 3,625 (1.45%)  22 450  24 450 (Form 1040 line 25c)
 *   Form 8960: 1 10,000  5a 9,000  5d 9,000  8 19,000  10 150 (Schedule 1 line 18)  11 150  12 18,850
 *              13 268,850 (AGI = 250,000 + 10,000 + 9,000 - 150)  14 200,000  15 68,850  16 18,850
 *              17 716 (18,850 x 3.8% = 716.30, whole dollars; Schedule 2 line 6)
 * </pre>
 */
class Form8959Form8960Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";
    static final String INT = "b8960000-0000-4000-8000-000000000001";

    static Map<String, String> highIncomeScenario() {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("250000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar("250000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWithholding", dollar("4075.00"));
        m.put("/interestReports", collection(INT));
        m.put("/interestReports/#" + INT + "/payer", string("Synthetic Savings Bank"));
        m.put("/interestReports/#" + INT + "/filer", collectionItem(W2));
        m.put("/interestReports/#" + INT + "/has1099", bool(true));
        m.put("/interestReports/#" + INT + "/writable1099Amount", dollar("10000.00"));
        m.put("/interestReports/#" + INT + "/writableEarlyWithdrawlPenaltyAmount", dollar("150.00"));
        m.put("/interestReports/#" + INT + "/hasSeenLastAvailableScreen", bool(true));
        return m;
    }

    static String collectionItem(String id) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.CollectionItemWrapper\",\"item\":{\"id\":\"" + id + "\"}}";
    }

    /** Field values on the pages whose text contains {@code footer} (fully qualified name -> value). */
    static Map<String, String> fieldsOnPages(PDDocument doc, String footer) throws Exception {
        Set<COSBase> widgets = new HashSet<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            if (stripper.getText(doc).contains(footer)) {
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

    /** Value of the one field on these pages whose name ends with {@code Page1[0].<name>}. */
    static String field(Map<String, String> f, String name) {
        String suffix = "Page1[0]." + name;
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field is unique on the form: " + suffix);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present on the form: " + suffix);
        return found;
    }

    static void amount(Map<String, String> f, String name, long dollars, String line) {
        String v = field(f, name);
        assertFalse(v.isEmpty(), line + " printed");
        assertEquals(dollars * 100, cents(v), line);
    }

    static void blank(Map<String, String> f, String name, String line) {
        assertEquals("", field(f, name), line + " blank");
    }

    @Test
    void form8959PrintsPartsIIIIVAndVFromTheFacts() throws Exception {
        byte[] bytes = generate(highIncomeScenario());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "form8959-form8960-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fieldsOnPages(doc, "Form 8959 (2026)");
            assertFalse(f.isEmpty(), "Form 8959 page printed");
            assertTrue(field(f, "f1_1[0]").contains("McTestface"), "name");
            amount(f, "f1_3[0]", 250000, "line 1 Medicare wages (W-2 box 5)");
            blank(f, "f1_4[0]", "line 2 Form 4137");
            blank(f, "f1_5[0]", "line 3 Form 8919");
            amount(f, "f1_6[0]", 250000, "line 4");
            amount(f, "f1_7[0]", 200000, "line 5 threshold (single)");
            amount(f, "f1_8[0]", 50000, "line 6");
            amount(f, "f1_9[0]", 450, "line 7");
            for (String rrta : new String[] {"f1_10[0]", "f1_11[0]", "f1_12[0]", "f1_13[0]", "f1_25[0]"}) {
                blank(f, rrta, "RRTA lines 8-11 and 23");
            }
            amount(f, "f1_14[0]", 450, "line 12");
            amount(f, "f1_15[0]", 0, "line 13 (enter -0-)");
            amount(f, "f1_16[0]", 200000, "line 14 threshold");
            amount(f, "f1_17[0]", 250000, "line 15 = line 4");
            amount(f, "f1_18[0]", 0, "line 16 (enter -0-)");
            amount(f, "f1_19[0]", 0, "line 17 (enter -0-)");
            blank(f, "f1_20[0]", "line 18 ($0)");
            amount(f, "f1_21[0]", 4075, "line 19 Medicare tax withheld (W-2 box 6)");
            amount(f, "f1_22[0]", 250000, "line 20 = line 1");
            amount(f, "f1_23[0]", 3625, "line 21");
            amount(f, "f1_24[0]", 450, "line 22");
            amount(f, "f1_26[0]", 450, "line 24");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    @Test
    void form8960PrintsPartsIIIAndIIIFromTheFacts() throws Exception {
        byte[] bytes = generate(highIncomeScenario());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fieldsOnPages(doc, "Form 8960 (2026)");
            assertFalse(f.isEmpty(), "Form 8960 page printed");
            assertTrue(field(f, "f1_1[0]").contains("McTestface"), "name");
            amount(f, "f1_3[0]", 10000, "line 1 taxable interest");
            blank(f, "f1_4[0]", "line 2 ($0 ordinary dividends)");
            blank(f, "f1_5[0]", "line 3");
            blank(f, "f1_7[0]", "line 4b");
            blank(f, "f1_10[0]", "line 5b");
            blank(f, "f1_11[0]", "line 5c");
            blank(f, "f1_13[0]", "line 6");
            blank(f, "f1_14[0]", "line 7");
            amount(f, "f1_9[0]", 9000, "line 5a (Form 1040 line 7a)");
            amount(f, "f1_12[0]", 9000, "line 5d = 5a");
            amount(f, "f1_15[0]", 19000, "line 8");
            blank(f, "f1_16[0]", "line 9a");
            blank(f, "f1_19[0]", "line 9d");
            amount(f, "f1_20[0]", 150, "line 10 (Schedule 1 line 18 early withdrawal penalty)");
            amount(f, "f1_21[0]", 150, "line 11 = 9d + 10");
            amount(f, "f1_22[0]", 18850, "line 12");
            amount(f, "f1_23[0]", 268850, "line 13 MAGI");
            amount(f, "f1_24[0]", 200000, "line 14 threshold (single)");
            amount(f, "f1_25[0]", 68850, "line 15");
            amount(f, "f1_26[0]", 18850, "line 16 = smaller of 12 or 15");
            amount(f, "f1_27[0]", 716, "line 17 = line 16 x 3.8%, whole dollars");
            blank(f, "f1_6[0]", "line 4a");
            blank(f, "f1_8[0]", "line 4c");
            for (String et : new String[] {"f1_28[0]", "f1_30[0]", "f1_34[0]", "f1_35[0]"}) {
                blank(f, et, "estates and trusts lines 18a-21");
            }
        }
    }

    /**
     * Golden N (#135), public print path. The facts are {@code golden-profileN-complete.json}, the persisted client
     * profile {@code profileNPaSingleAmt8959}: Finley Example, full-year Pennsylvania, school code 22275. One W-2,
     * box 1 and box 5 $600,000, box 6 $12,300, box 16 $600,000, box 17 $18,420.
     *
     * <p>Form 8959 Part I is ($600,000 − $200,000) × 0.9% = $3,600. 26 U.S.C. §3101(b)(2); §1401(b)(2) threshold,
     * statutory, not indexed. Part V is $12,300 − 1.45% × $600,000 = $3,600, Form 1040 line 25c.
     *
     * <p>Form 8960 prints because MAGI $600,000 is over the $200,000 threshold. Instructions for Form 8960 (2026)
     * draft p. 1, Who Must File. Line 12 is $0, so line 17 is $0. 26 U.S.C. §1411(a)(1).
     *
     * <p>Form 6251 line 7 is $151,882 and line 10 is $173,134, so line 11 is $0. Instructions for Form 6251 (2025) p.
     * 1, Who Must File, item 1 attaches the form only when line 7 is greater than line 10, so the page is not in the
     * package. Rev. Proc. 2025-32 §4.10, PDF pp. 16–17; 26 U.S.C. §55(d)(1), (d)(3) as amended by P.L. 119-21 (50%,
     * not 25%); §55(b)(1)(A).
     *
     * <p>PA-40 line 1a is box 16, $600,000. Line 12 is 600,000 × 3.07% = $18,420.00. 72 P.S. §7302. Line 13 is box 17,
     * $18,420. Lines 26 and 29 are $0.
     */
    @Test
    void goldenNPrintsPa40AndForm8959OnThePublicPath() throws Exception {
        byte[] bytes = generatePublicPrintOf("submission-blocking/golden-profileN-complete.json");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f8959 = fieldsOnPages(doc, "Form 8959 (2026)");
            assertFalse(f8959.isEmpty(), "Form 8959 page printed");
            assertTrue(field(f8959, "f1_1[0]").toUpperCase().contains("FINLEY"), "name");
            amount(f8959, "f1_3[0]", 600000, "line 1 Medicare wages");
            amount(f8959, "f1_7[0]", 200000, "line 5 threshold, single");
            amount(f8959, "f1_8[0]", 400000, "line 6");
            amount(f8959, "f1_9[0]", 3600, "line 7 = 400,000 x 0.9%");
            amount(f8959, "f1_14[0]", 3600, "line 12");
            amount(f8959, "f1_21[0]", 12300, "line 19 box 6");
            amount(f8959, "f1_23[0]", 8700, "line 21 = 1.45% x 600,000");
            amount(f8959, "f1_24[0]", 3600, "line 22");
            amount(f8959, "f1_26[0]", 3600, "line 24 to Form 1040 line 25c");

            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            assertFalse(f8960.isEmpty(), "Form 8960 page printed because MAGI is over the threshold");
            amount(f8960, "f1_22[0]", 0, "line 12 net investment income");
            amount(f8960, "f1_23[0]", 600000, "line 13 MAGI");
            amount(f8960, "f1_24[0]", 200000, "line 14");
            amount(f8960, "f1_25[0]", 400000, "line 15");
            blank(f8960, "f1_26[0]", "line 16");
            blank(f8960, "f1_27[0]", "line 17");

            assertTrue(
                    Form6251Ty2026PdfSmokeTest.form6251Fields(doc).isEmpty(),
                    "Form 6251 is not attached when line 11 is $0");

            assertTrue(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(
                            doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1),
                    "PA-40 is in the package");
            assertFalse(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.SP_PAGE1),
                    "no Schedule SP when line 21 is $0");
            Map<String, String> pa = PaPit40ScheduleSpTy2026PdfSmokeTest.fieldsOnPages(
                    doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1);
            PaPit40ScheduleSpTy2026PdfSmokeTest.is(pa, "Residency Status", "1", "(R) Resident");
            PaPit40ScheduleSpTy2026PdfSmokeTest.is(pa, "1a. Gross Compensation", "600,000.00", "line 1a = box 16");
            PaPit40ScheduleSpTy2026PdfSmokeTest.is(pa, "11. Adjusted PA Taxable Income", "600,000.00", "line 11");
            Map<String, String> p2 = PaPit40ScheduleSpTy2026PdfSmokeTest.fieldsOnPages(
                    doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE2);
            PaPit40ScheduleSpTy2026PdfSmokeTest.is(
                    p2, "12. PA Tax Liability. Multiply Line 11 by 3.07%", "18,420.00", "line 12");
            PaPit40ScheduleSpTy2026PdfSmokeTest.is(p2, "13. Total PA Tax Withheld", "18,420.00", "line 13 = box 17");
            PaPit40ScheduleSpTy2026PdfSmokeTest.blank(p2, "26. TAX DUE", "line 26");
            PaPit40ScheduleSpTy2026PdfSmokeTest.blank(p2, "29. OVERPAYMENT", "line 29");
        }
    }

    /**
     * Golden S (#135), public print path. The facts are {@code golden-profileS-complete.json}, the persisted client
     * profile {@code profileSFlMfjStandardAmt}: Lane and Noor Example, full-year Florida, married filing jointly, both
     * under 65, no dependents, standard deduction. Two W-2s: primary boxes 1, 3, and 5 $300,000, box 2 $72,000, box 4
     * $11,439, box 6 $5,250; spouse boxes 1, 3, and 5 $150,000, box 2 $30,000, box 4 $9,300, box 6 $2,175. One Form
     * 1099-DIV, box 12 and box 13 $60,000.
     *
     * <p>Form 1040 line 1a is $450,000. Line 2a is $60,000. Tax-exempt interest is not gross income. 26 U.S.C.
     * §103(a). Line 11 is $450,000. Line 12e is the $32,200 joint standard deduction. Rev. Proc. 2025-32 §4.14(1), PDF
     * p. 18. Line 15 is $417,800. The Tax Computation Worksheet tax is $82,048 + 32% × $14,250 = $86,608. Rev. Proc.
     * 2025-32 §4.01 Table 1, PDF p. 10. Instructions for Form 1040 (2025), PDF p. 36.
     *
     * <p>Form 6251 line 1a is $32,200 (Form 1040 line 14; no Schedule 1-A). The cite's "line 1 $417,800" is draft line
     * 1b. Line 2a is the standard deduction, $32,200. 26 U.S.C. §56(b)(1)(E). Line 2g is box 13, $60,000. 26 U.S.C.
     * §57(a)(5). Line 4 is $510,000. Line 5 is the $140,200 exemption. Rev. Proc. 2025-32 §4.10, PDF pp. 16–17. Line 6
     * is $369,800. Line 7 is 28% × $369,800 − $4,890 = $98,654. Line 11 is $12,046. Schedule 2 line 2 is $12,046 and
     * line 3 is $12,046 (the cite's "line 1"; line 1z is blank). Form 1040 line 17 is $12,046.
     *
     * <p>Form 8959 line 7 is ($450,000 − $250,000) × 0.9% = $1,800. 26 U.S.C. §3101(b)(2). Line 19 is $7,425. Line 21
     * is 1.45% × $450,000 = $6,525. Line 24 is $900, Form 1040 line 25c. Form 8960 prints because MAGI $450,000 is over
     * the $250,000 threshold. Instructions for Form 8960 (2026) draft p. 1, Who Must File. Exempt-interest dividends
     * are not net investment income, so line 12 and line 17 are $0. 26 U.S.C. §1411(c). Schedule 2 line 17b is
     * $1,800 and line 21 is $1,800. Form 1040 line 23 is $1,800. Line 24 is $100,454. Line 25a is $102,000. Line 33 is
     * $102,900. Line 34 and line 35a are the $2,446 refund. Schedule A line 18 is $0, under the standard deduction, so
     * the return does not itemize and Schedule A is not in the package. No Schedule B, Schedule 1, Schedule D,
     * Schedule 8812, or state return.
     *
     * <p>Group-00 test SSNs (the SSA never assigns group 00). A 9xx area is not an SSN. {@code Tin.isSSN} rejects it,
     * so the fixture uses group 00. The same pattern is Golden G, Golden Q, and Golden R.
     */
    @Test
    void goldenSPrintsForm1040Form6251Form8959AndSchedule2OnThePublicPath() throws Exception {
        byte[] bytes = generatePublicPrintOf("submission-blocking/golden-profileS-complete.json");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fieldsOnPages(doc, Schedules123Ty2026PdfSmokeTest.F1040);
            assertTrue(
                    Schedules123Ty2026PdfSmokeTest.any(f, "f1_14[0]")
                            .toUpperCase()
                            .contains("LANE"),
                    "Form 1040 first name");
            assertTrue(
                    Schedules123Ty2026PdfSmokeTest.any(f, "f1_17[0]")
                            .toUpperCase()
                            .contains("NOOR"),
                    "Form 1040 spouse first name");
            // Page1 c1_8[1] is MFJ. HOH-QSS_ReadOrder also has a c1_8[1] (qualifying surviving spouse), so the
            // short name is not unique. The export value is the PDF's on-state, not a locked literal.
            assertEquals(
                    "Off", PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[0]"), "single is not checked");
            assertFalse(
                    Set.of("", "Off").contains(PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[1]")),
                    "married filing jointly is checked");
            assertEquals(
                    "Off",
                    PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[2]"),
                    "married filing separately is not checked");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_31[0]", "no dependent");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_47[0]", 450000, "Form 1040 line 1a wages");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_58[0]", 60000, "Form 1040 line 2a tax-exempt interest");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_59[0]", "Form 1040 line 2b ($0 taxable interest)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_73[0]", 450000, "Form 1040 line 9");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_74[0]", "Form 1040 line 10 ($0 adjustments)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_75[0]", 450000, "Form 1040 line 11a AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_01[0]", 450000, "Form 1040 line 11b AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_02[0]", 32200, "Form 1040 line 12e standard deduction");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_07[0]", 417800, "Form 1040 line 15 taxable income");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_09[0]", 86608, "Form 1040 line 16 tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_10[0]", 12046, "Form 1040 line 17 AMT");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_11[0]", 98654, "Form 1040 line 18");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_12[0]", "Form 1040 line 19 child tax credit ($0)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_15[0]", 98654, "Form 1040 line 22 tax after credits");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_16[0]", 1800, "Form 1040 line 23 additional Medicare tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_17[0]", 100454, "Form 1040 line 24a total tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_20[0]", 102000, "Form 1040 line 25a withholding");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_22[0]", 900, "Form 1040 line 25c Form 8959");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_23[0]", 102900, "Form 1040 line 25d");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_26[0]", "Form 1040 line 27a EITC ($0)");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_27[0]", "Form 1040 line 28 additional child tax credit ($0)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_34[0]", 102900, "Form 1040 line 33 payments");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_35[0]", 2446, "Form 1040 line 34 overpayment");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_36[0]", 2446, "Form 1040 line 35a refund");
            // /balanceDue has ExportZero, so $0 owed prints "0.00" rather than a blank.
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_40[0]", 0, "Form 1040 line 37 amount owed ($0)");

            Map<String, String> f6251 = Form6251Ty2026PdfSmokeTest.form6251Fields(doc);
            assertFalse(f6251.isEmpty(), "Form 6251 is attached when line 7 is greater than line 10");
            assertEquals(3220000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_3[0]"), "Form 6251 line 1a");
            assertEquals(41780000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_4[0]"), "Form 6251 line 1b");
            assertEquals(3220000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_5[0]"), "Form 6251 line 2a");
            assertEquals(6000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_11[0]"), "Form 6251 line 2g");
            assertEquals(51000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_26[0]"), "Form 6251 line 4");
            assertEquals(14020000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_27[0]"), "Form 6251 line 5");
            assertEquals(36980000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_28[0]"), "Form 6251 line 6");
            assertEquals(9865400, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_29[0]"), "Form 6251 line 7");
            assertEquals(9865400, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_31[0]"), "Form 6251 line 9");
            assertEquals(8660800, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_32[0]"), "Form 6251 line 10");
            assertEquals(1204600, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_33[0]"), "Form 6251 line 11");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_1[0]"), "Form 6251 Part III blank");

            Map<String, String> f8959 = fieldsOnPages(doc, "Form 8959 (2026)");
            assertFalse(f8959.isEmpty(), "Form 8959 page printed");
            assertTrue(field(f8959, "f1_1[0]").toUpperCase().contains("LANE"), "Form 8959 name");
            amount(f8959, "f1_3[0]", 450000, "line 1 Medicare wages");
            amount(f8959, "f1_7[0]", 250000, "line 5 threshold, married filing jointly");
            amount(f8959, "f1_8[0]", 200000, "line 6");
            amount(f8959, "f1_9[0]", 1800, "line 7 = 200,000 x 0.9%");
            amount(f8959, "f1_14[0]", 1800, "line 12");
            amount(f8959, "f1_21[0]", 7425, "line 19 box 6");
            amount(f8959, "f1_23[0]", 6525, "line 21 = 1.45% x 450,000");
            amount(f8959, "f1_24[0]", 900, "line 22");
            amount(f8959, "f1_26[0]", 900, "line 24 to Form 1040 line 25c");

            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            assertFalse(f8960.isEmpty(), "Form 8960 page printed because MAGI is over the threshold");
            amount(f8960, "f1_22[0]", 0, "line 12 net investment income");
            amount(f8960, "f1_23[0]", 450000, "line 13 MAGI");
            amount(f8960, "f1_24[0]", 250000, "line 14");
            amount(f8960, "f1_25[0]", 200000, "line 15");
            blank(f8960, "f1_26[0]", "line 16");
            blank(f8960, "f1_27[0]", "line 17");

            Map<String, String> s2 = Schedules123Ty2026PdfSmokeTest.page(doc, Schedules123Ty2026PdfSmokeTest.SCH2);
            assertTrue(field(s2, "f1_01[0]").toUpperCase().contains("LANE"), "Schedule 2 name");
            blank(s2, "f1_11[0]", "Schedule 2 line 1z");
            amount(s2, "f1_12[0]", 12046, "Schedule 2 line 2 AMT");
            amount(s2, "f1_13[0]", 12046, "Schedule 2 line 3");
            blank(s2, "f1_15[0]", "Schedule 2 line 4 (no Schedule SE)");
            blank(s2, "f1_17[0]", "Schedule 2 line 6 (no NIIT)");
            Schedules123Ty2026PdfSmokeTest.amount2(s2, "f2_12[0]", 1800, "Schedule 2 line 17b");
            Schedules123Ty2026PdfSmokeTest.amount2(s2, "f2_20[0]", 1800, "Schedule 2 line 21");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("SCHEDULE A (Form 1040) 2026"), "no Schedule A");
            assertFalse(text.contains("Schedule A (Form 1040) 2026"), "no Schedule A page 2");
            assertFalse(text.contains("Schedule B (Form 1040) 2026"), "no Schedule B");
            assertFalse(text.contains("Schedule 1 (Form 1040) 2026"), "no Schedule 1");
            assertFalse(text.contains("Schedule D (Form 1040) 2026"), "no Schedule D");
            assertTrue(
                    CreditFormsTy2026PdfSmokeTest.pages(
                                    CreditFormsTy2026PdfSmokeTest.pageTexts(doc), CreditFormsTy2026PdfSmokeTest::is8812)
                            .isEmpty(),
                    "no Schedule 8812");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheets dropped");
            assertFalse(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1),
                    "no PA-40 for a full-year Florida resident");
        }
    }

    /**
     * Golden U (#135), public print path. The facts are {@code golden-profileU-complete.json}, the persisted client
     * profile {@code profileUFlSingleAmtPartIii}: Marlow Example, full-year Florida, single, under 65, no dependents,
     * standard deduction. One W-2: boxes 1 and 5 $200,000, box 3 $184,500, box 2 $48,000, box 4 $11,439, box 6
     * $2,900. One Form 1099-DIV: box 1a $20,000, box 1b $20,000, box 2a $10,000, box 12 $50,000, box 13 $50,000.
     *
     * <p>Form 1040 line 1a is $200,000. Line 2a is $50,000. Tax-exempt interest is not gross income. 26 U.S.C.
     * §103(a); §852(b)(5)(B). Line 3a is $20,000. Line 3b is $20,000. Line 7a is $10,000 and line 7b is checked,
     * because box 2a alone does not require Schedule D. Form 1040 instr. (2025), line 7a Exception 1. Line 11 is
     * $230,000. Line 12e is the $16,100 single standard deduction. Rev. Proc. 2025-32 §4.14, PDF p. 18. Line 15 is
     * $213,900. The QDCG worksheet tax is $41,234. Rev. Proc. 2025-32 §4.01 Table 3 and §4.03. The regular-table tax
     * on $213,900 is $44,904.
     *
     * <p>Form 6251 line 1a is $16,100. The cite's "line 1 $213,900" is draft line 1b. Line 2a is the standard
     * deduction, $16,100. 26 U.S.C. §56(b)(1)(E). Line 2g is box 13, $50,000. 26 U.S.C. §57(a)(5). Line 4 is
     * $280,000. Line 5 is the $90,100 exemption. Rev. Proc. 2025-32 §4.10, PDF pp. 16–17. Part III taxes $30,000 at
     * 15%. Line 38 is $46,074. Line 39 is $49,374, the amount line 7 would be if Part III were skipped. Line 11 is
     * $4,840. 26 U.S.C. §55(b)(3). Schedule 2 line 2 is $4,840 (the cite's "line 1"; line 1z is blank). Line 14 is
     * blank, so lines 35–37 are blank. Line 26 prints the line 21 zero.
     *
     * <p>Form 8960 line 2 is $20,000. Line 5a is $10,000. Line 17 is $1,140. 26 U.S.C. §1411(a)(1), (c)(1).
     * Exempt-interest dividends are not on line 1. Form 8959 is omitted: Medicare wages of $200,000 are not over the
     * threshold, and box 6 is exactly 1.45%. 26 U.S.C. §3101(b)(2). Schedule 2 line 6 is $1,140. Form 1040 line 24
     * is $47,214. Line 25a is $48,000. Line 34 and line 35a are the $786 refund. No Schedule D and no state return.
     *
     * <p>Group-00 test SSN (the SSA never assigns group 00). A 9xx area is not an SSN. {@code Tin.isSSN} rejects it,
     * so the fixture uses group 00. The same pattern is Golden G, Golden Q, Golden R, Golden S, and Golden T.
     */
    @Test
    void goldenUPrintsScheduleBSchedule2Form6251AndForm8960OnThePublicPath() throws Exception {
        byte[] bytes = generatePublicPrintOf("submission-blocking/golden-profileU-complete.json");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fieldsOnPages(doc, Schedules123Ty2026PdfSmokeTest.F1040);
            assertTrue(
                    Schedules123Ty2026PdfSmokeTest.any(f, "f1_14[0]")
                            .toUpperCase()
                            .contains("MARLOW"),
                    "Form 1040 first name");
            assertEquals("444002015", PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].f1_16[0]").replaceAll("\\D", ""), "SSN");
            assertFalse(
                    Set.of("", "Off").contains(PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[0]")),
                    "single is checked");
            assertEquals(
                    "Off", PaPit40ScheduleSpTy2026PdfSmokeTest.field(f, "Page1[0].c1_8[1]"), "MFJ is not checked");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_31[0]", "no dependent");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_47[0]", 200000, "Form 1040 line 1a wages");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_58[0]", 50000, "Form 1040 line 2a tax-exempt interest");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_59[0]", "Form 1040 line 2b ($0 taxable interest)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_60[0]", 20000, "Form 1040 line 3a");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_61[0]", 20000, "Form 1040 line 3b");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_70[0]", 10000, "Form 1040 line 7a");
            assertTrue(Ty2026PdfPackageTest.checked(f, "c1_45[0]"), "Form 1040 line 7b Schedule D not required");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_73[0]", 230000, "Form 1040 line 9");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_74[0]", "Form 1040 line 10 ($0 adjustments)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_75[0]", 230000, "Form 1040 line 11a AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_01[0]", 230000, "Form 1040 line 11b AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_02[0]", 16100, "Form 1040 line 12e standard deduction");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_07[0]", 213900, "Form 1040 line 15 taxable income");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_09[0]", 41234, "Form 1040 line 16 tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_10[0]", 4840, "Form 1040 line 17 AMT");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_11[0]", 46074, "Form 1040 line 18");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_12[0]", "Form 1040 line 19 child tax credit ($0)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_15[0]", 46074, "Form 1040 line 22 tax after credits");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_16[0]", 1140, "Form 1040 line 23 NIIT");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_17[0]", 47214, "Form 1040 line 24a total tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_20[0]", 48000, "Form 1040 line 25a withholding");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_22[0]", "Form 1040 line 25c (no Form 8959)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_34[0]", 48000, "Form 1040 line 33 payments");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_35[0]", 786, "Form 1040 line 34 overpayment");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_36[0]", 786, "Form 1040 line 35a refund");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_40[0]", 0, "Form 1040 line 37 amount owed ($0)");

            Map<String, String> sb = fieldsOnPages(doc, "Schedule B (Form 1040) 2026");
            assertFalse(sb.isEmpty(), "Schedule B printed");
            assertEquals("Example Income Fund", ScheduleSETy2026PdfSmokeTest.value(sb, "f1_34[0]").trim(), "Schedule B payer");
            ScheduleSETy2026PdfSmokeTest.amount(sb, "f1_35[0]", 20000, "Schedule B line 5");
            ScheduleSETy2026PdfSmokeTest.amount(sb, "f1_64[0]", 20000, "Schedule B line 6");
            assertFalse(Ty2026PdfPackageTest.checked(sb, "c1_1[0]"), "Schedule B line 7a Yes");
            assertTrue(Ty2026PdfPackageTest.checked(sb, "c1_1[1]"), "Schedule B line 7a No");

            Map<String, String> f6251 = Form6251Ty2026PdfSmokeTest.form6251Fields(doc);
            assertFalse(f6251.isEmpty(), "Form 6251 is attached when line 7 is greater than line 10");
            assertEquals(1610000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_3[0]"), "Form 6251 line 1a");
            assertEquals(21390000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_4[0]"), "Form 6251 line 1b");
            assertEquals(1610000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_5[0]"), "Form 6251 line 2a");
            assertEquals(5000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_11[0]"), "Form 6251 line 2g");
            assertEquals(28000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_26[0]"), "Form 6251 line 4");
            assertEquals(9010000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_27[0]"), "Form 6251 line 5");
            assertEquals(18990000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_28[0]"), "Form 6251 line 6");
            assertEquals(4607400, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_29[0]"), "Form 6251 line 7");
            assertEquals(4607400, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_31[0]"), "Form 6251 line 9");
            assertEquals(4123400, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_32[0]"), "Form 6251 line 10");
            assertEquals(484000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_33[0]"), "Form 6251 line 11");
            assertEquals(18990000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_1[0]"), "12 = line 6");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_2[0]"), "13 = QDCG worksheet line 4");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_3[0]"), "14 blank");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_4[0]"), "15 = line 13");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_5[0]"), "16 = smaller of 12 or 15");
            assertEquals(15990000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_6[0]"), "17 = 12 - 16");
            assertEquals(4157400, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_7[0]"), "18 = 26% of 17");
            assertEquals(4945000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_8[0]"), "19 single zero-rate amount");
            assertEquals(18390000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_9[0]"), "20 = QDCG worksheet line 5");
            assertEquals("0.00", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_10[0]"), "21 enter -0-");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_11[0]"), "22 = smaller of 12 or 13");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_12[0]"), "23 blank");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_13[0]"), "24 = 22 - 23");
            assertEquals(54550000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_14[0]"), "25 single 15% amount");
            assertEquals("0.00", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_15[0]"), "26 = line 21");
            assertEquals(18390000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_16[0]"), "27 = QDCG worksheet line 5");
            assertEquals(18390000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_17[0]"), "28 = 26 + 27");
            assertEquals(36160000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_18[0]"), "29 = 25 - 28");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_19[0]"), "30 = smaller of 24 or 29");
            assertEquals(450000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_20[0]"), "31 = 15% of 30");
            assertEquals(3000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_21[0]"), "32 = 23 + 30");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_22[0]"), "33 blank ($0)");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_23[0]"), "34 blank ($0)");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_24[0]"), "35 blank (line 14 is zero)");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_25[0]"), "36 blank");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_26[0]"), "37 blank");
            assertEquals(4607400, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_27[0]"), "38 = 18 + 31");
            assertEquals(4937400, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_28[0]"), "39 = 26% of 12");
            assertEquals(4607400, Form6251Ty2026PdfSmokeTest.line(f6251, "f2_29[0]"), "40 = smaller of 38 or 39");

            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            assertFalse(f8960.isEmpty(), "Form 8960 page printed because MAGI is over the threshold");
            blank(f8960, "f1_3[0]", "line 1 (exempt-interest dividends are not taxable interest)");
            amount(f8960, "f1_4[0]", 20000, "line 2 ordinary dividends");
            amount(f8960, "f1_9[0]", 10000, "line 5a capital gain");
            amount(f8960, "f1_15[0]", 30000, "line 8");
            amount(f8960, "f1_22[0]", 30000, "line 12 net investment income");
            amount(f8960, "f1_23[0]", 230000, "line 13 MAGI");
            amount(f8960, "f1_24[0]", 200000, "line 14");
            amount(f8960, "f1_25[0]", 30000, "line 15");
            amount(f8960, "f1_26[0]", 30000, "line 16");
            amount(f8960, "f1_27[0]", 1140, "line 17");

            Map<String, String> s2 = Schedules123Ty2026PdfSmokeTest.page(doc, Schedules123Ty2026PdfSmokeTest.SCH2);
            assertTrue(field(s2, "f1_01[0]").toUpperCase().contains("MARLOW"), "Schedule 2 name");
            blank(s2, "f1_11[0]", "Schedule 2 line 1z");
            amount(s2, "f1_12[0]", 4840, "Schedule 2 line 2 AMT");
            amount(s2, "f1_13[0]", 4840, "Schedule 2 line 3");
            amount(s2, "f1_17[0]", 1140, "Schedule 2 line 6 NIIT");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Form 8959 (2026)"), "no Form 8959");
            assertFalse(text.contains("SCHEDULE A (Form 1040) 2026"), "no Schedule A");
            assertFalse(text.contains("Schedule 1 (Form 1040) 2026"), "no Schedule 1");
            assertFalse(text.contains("Schedule D (Form 1040) 2026"), "no Schedule D");
            assertTrue(
                    CreditFormsTy2026PdfSmokeTest.pages(
                                    CreditFormsTy2026PdfSmokeTest.pageTexts(doc), CreditFormsTy2026PdfSmokeTest::is8812)
                            .isEmpty(),
                    "no Schedule 8812");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheets dropped");
            assertFalse(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1),
                    "no PA-40 for a full-year Florida resident");
        }
    }

    @Test
    void neitherFormPrintsBelowTheThresholds() throws Exception {
        byte[] bytes = generate(Map.of());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Form 8959 (2026)"), "no Form 8959 at $50,000 wages");
            assertFalse(text.contains("Form 8960 (2026)"), "no Form 8960 at $50,000 wages");
        }
    }
}
