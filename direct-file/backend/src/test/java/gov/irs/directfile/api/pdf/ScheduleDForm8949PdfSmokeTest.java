package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.util.ReflectionTestUtils;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #41: end-to-end "Download PDF" smoke test. Drives the real PdfService (real fact dictionary, real PdfTemplate list,
 * real application.yaml PDF configuration) with a synthetic return: fake filer "Fakey McTestface", placeholder TIN
 * 555-55-5555 (the fact graph rejects an all-zero area, so the repo's standard fake TIN is used).
 *
 * Worked numbers (Form 8949 instr. (2025) p.11, col (h) = (d) - (e); Schedule D instr. (2025) p.10 lines 7/15,
 * line 16 = 7 + 15; Form 1040 line 7 = Schedule D line 16 when it is a gain, Schedule D instr. p.14):
 *   Box A short-term: 10,000 - 6,000 = 4,000  -> Sch D line 1b/7 = 4,000
 *   Box D long-term : 15,000 - 10,000 = 5,000 -> Sch D line 8b/15 = 5,000
 *   Sch D line 16 = 9,000 = Form 1040 line 7.
 * Set -Dpdf.smoke.out=/some/dir to keep the generated PDF for rendering.
 */
class ScheduleDForm8949PdfSmokeTest {

    @Test
    void downloadPdfContainsScheduleDAnd8949WithExpectedTotals() throws Exception {
        byte[] bytes = render(facts -> {}, "schedule-d-8949-smoke.pdf");

        try (PDDocument doc = Loader.loadPDF(bytes)) {
            List<String> values = new ArrayList<>();
            Map<String, String> byName = new java.util.HashMap<>();
            for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                byName.put(f.getFullyQualifiedName(), f.getValueAsString());
                values.add(f.getFullyQualifiedName() + "=" + f.getValueAsString());
            }
            // Form 8949: one form per transaction; col (h) totals 4,000 (Part I) and 5,000 (Part II).
            assertEquals(1, count(byName, "Table_Line1_Part1[0].Row1[0].f1_10[0]", "4000"), values::toString);
            assertEquals(1, count(byName, "Table_Line1_Part2[0].Row1[0].f2_10[0]", "5000"), values::toString);
            assertEquals(1, count(byName, "Table_Line1_Part1[0].Row1[0].f1_06[0]", "10000"), values::toString);
            assertEquals(1, count(byName, "Table_Line1_Part2[0].Row1[0].f2_06[0]", "15000"), values::toString);
            // #48: columns (b)/(c) dates print as MM/DD/YYYY (Form 8949 (2025) headings "(Mo., day, yr.)").
            assertEquals("02/02/2026", value(byName, "Table_Line1_Part1[0].Row1[0].f1_04[0]"), values::toString);
            assertEquals("05/05/2026", value(byName, "Table_Line1_Part1[0].Row1[0].f1_05[0]"), values::toString);
            assertEquals("03/03/2023", value(byName, "Table_Line1_Part2[0].Row1[0].f2_04[0]"), values::toString);
            assertEquals("06/06/2026", value(byName, "Table_Line1_Part2[0].Row1[0].f2_05[0]"), values::toString);
            // #40: line 2 totals per form, column (h) (Form 8949 (2025) line 2).
            assertEquals(1, count(byName, "Page1[0].f1_95[0]", "4000"), "8949 Part I line 2 (h)");
            assertEquals(1, count(byName, "Page2[0].f2_95[0]", "5000"), "8949 Part II line 2 (h)");
            // Schedule D lines 7 / 15 / 16.
            assertEquals(1, count(byName, "Page1[0].f1_22[0]", "4000"), "Sch D line 7");
            assertEquals(1, count(byName, "Page1[0].f1_43[0]", "5000"), "Sch D line 15");
            assertEquals(1, count(byName, "Page2[0].f2_1[0]", "9000"), "Sch D line 16");
            // #35 follow-up: Sch D lines 1b/8b columns (d) and (e) carry the Form 8949 line 2 totals; (g) is $0
            // (blank).
            assertEquals("10000", digits(byName, "Row1b[0].f1_7[0]"), "Sch D line 1b (d)");
            assertEquals("6000", digits(byName, "Row1b[0].f1_8[0]"), "Sch D line 1b (e)");
            assertEquals("", digits(byName, "Row1b[0].f1_9[0]"), "Sch D line 1b (g)");
            assertEquals("15000", digits(byName, "Row8b[0].f1_27[0]"), "Sch D line 8b (d)");
            assertEquals("10000", digits(byName, "Row8b[0].f1_28[0]"), "Sch D line 8b (e)");
            // Lines 15 and 16 are both gains: line 17 Yes, line 20 Yes (QDCG worksheet), line 22 not answered.
            assertEquals(List.of("17 Yes", "20 Yes"), scheduleDBoxes(doc), values::toString);
            // Form 1040 line 7a (#65: 2026 draft layout, field f1_70).
            assertEquals(1, count(byName, "Page1[0].f1_70[0]", "9000"), "1040 line 7a");
            assertTrue(doc.getNumberOfPages() >= 6, "1040 (2) + Sch D (2) + 8949 x2 (4)");
            // #35: no irs.gov draft cover sheet survives in the merged return (skipLeadingPages on Sch D and 8949).
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "draft cover dropped");
            assertTrue(text.contains("Schedule D (Form 1040) 2026"), "2026 Schedule D draft printed");
            assertTrue(text.contains("Form 8949 (2026)"), "2026 Form 8949 draft printed");
        }
    }

    /**
     * #35 follow-up, loss path. The Box D sale becomes 2,000 - 10,000 + 500 (column (g)) = (7,500), so Sch D line 8b is
     * (d) 2,000, (e) 10,000, (g) 500, (h) (7,500); line 15 = (7,500); line 16 = 4,000 - 7,500 = (3,500); line 21 =
     * smaller of the loss or $3,000 (IRC 1211(b)(1)) = 3,000. Line 16 is a loss, so lines 17-20 are skipped and line 22
     * is answered: no qualified dividends, so No.
     */
    @Test
    void lossReturnPrintsColumnGAndLine22No() throws Exception {
        String tx = "/form8949Transactions/#a2222222-2222-4222-8222-222222222222/";
        byte[] bytes = render(
                facts -> {
                    ((ObjectNode) facts.get(tx + "proceeds")).put("item", "2000");
                    facts.putObject(tx + "writableAdjustment")
                            .put("$type", "gov.irs.factgraph.persisters.DollarWrapper")
                            .put("item", "500");
                    facts.putObject(tx + "adjustmentCode")
                            .put("$type", "gov.irs.factgraph.persisters.StringWrapper")
                            .put("item", "B");
                },
                "schedule-d-8949-loss-smoke.pdf");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> byName = new java.util.HashMap<>();
            for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                byName.put(f.getFullyQualifiedName(), f.getValueAsString());
            }
            assertEquals("2000", digits(byName, "Row8b[0].f1_27[0]"), "Sch D line 8b (d)");
            assertEquals("10000", digits(byName, "Row8b[0].f1_28[0]"), "Sch D line 8b (e)");
            assertEquals("500", digits(byName, "Row8b[0].f1_29[0]"), "Sch D line 8b (g)");
            assertEquals("7500", digits(byName, "Row8b[0].f1_30[0]"), "Sch D line 8b (h)");
            assertEquals(1, count(byName, "Page2[0].f2_1[0]", "3500"), "Sch D line 16");
            assertEquals(1, count(byName, "Page2[0].f2_4[0]", "3000"), "Sch D line 21");
            assertEquals(List.of("22 No"), scheduleDBoxes(doc), byName::toString);
        }
    }

    /** Renders the synthetic return through the real PdfService after applying edit to its facts. */
    private static byte[] render(Consumer<ObjectNode> edit, String fileName) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.refresh();
        FactGraphService factGraphService = new FactGraphService(mapper, ctx);
        ReflectionTestUtils.setField(factGraphService, "loadAtStartup", true);
        ReflectionTestUtils.setField(factGraphService, "factDictionaryXmlPattern", "classpath:/tax/*.xml");
        Method init = FactGraphService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(factGraphService);

        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        PdfService pdfService = new PdfService(props, new IOLocationService(null), factGraphService);

        JsonNode root =
                mapper.readTree(new ClassPathResource("pdf-smoke/schedule-d-8949-synthetic.json").getInputStream());
        ObjectNode factsNode = (ObjectNode) root.get("facts");
        edit.accept(factsNode);
        Map<String, FactTypeWithItem> facts =
                mapper.convertValue(factsNode, new TypeReference<Map<String, FactTypeWithItem>>() {});
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026); // PDF template config key; #35: Sch D / 8949 now use the 2026 drafts under pdf/2026
        taxReturn.setFactsWithoutDirtyingEntity(facts);

        byte[] bytes;
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
            bytes = in.readAllBytes();
        }
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, fileName), bytes);
        }
        return bytes;
    }

    /** Checked Schedule D Part III boxes, read from the Schedule D page that carries line 17. */
    private static List<String> scheduleDBoxes(PDDocument doc) {
        String[][] boxes = {
            {"c2_1[0]", "17 Yes"},
            {"c2_1[1]", "17 No"},
            {"c2_2[0]", "20 Yes"},
            {"c2_2[1]", "20 No"},
            {"c2_3[0]", "22 Yes"},
            {"c2_3[1]", "22 No"}
        };
        List<String> checked = new ArrayList<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            String tip = f.getAlternateFieldName() == null ? "" : f.getAlternateFieldName();
            for (String[] box : boxes) {
                if (f.getFullyQualifiedName().endsWith("Page2[0]." + box[0])
                        && tip.startsWith(box[1].substring(0, 2) + ". ")
                        && f instanceof PDCheckBox cb
                        && cb.isChecked()) {
                    checked.add(box[1]);
                }
            }
        }
        return checked;
    }

    /** Whole-dollar digits of the non-blank value of the field whose name ends with the suffix, or "" when blank. */
    private static String digits(Map<String, String> byName, String suffix) {
        return value(byName, suffix).replaceAll("\\.00$", "").replaceAll("[^0-9]", "");
    }

    /** The non-blank value of the field whose name ends with the suffix (merge may rename/prefix). */
    private static String value(Map<String, String> byName, String suffix) {
        for (var e : byName.entrySet()) {
            if (e.getKey().endsWith(suffix)
                    && e.getValue() != null
                    && !e.getValue().isEmpty()) {
                return e.getValue();
            }
        }
        return "";
    }

    /** Count fields whose name ends with the suffix (merge may rename/prefix) and whose value, digits only, matches. */
    private static int count(Map<String, String> byName, String suffix, String expectedDigits) {
        int n = 0;
        for (var e : byName.entrySet()) {
            String v = e.getValue() == null ? "" : e.getValue().replaceAll("[^0-9]", "");
            if (e.getKey().endsWith(suffix) && (v.equals(expectedDigits) || v.equals(expectedDigits + "00"))) {
                n++;
            }
        }
        return n;
    }
}
