package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
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
        Map<String, FactTypeWithItem> facts =
                mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2024); // PDF template config key; #35: Sch D / 8949 now use the 2026 drafts under pdf/2026
        taxReturn.setFactsWithoutDirtyingEntity(facts);

        byte[] bytes;
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
            bytes = in.readAllBytes();
        }
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedule-d-8949-smoke.pdf"), bytes);
        }

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
