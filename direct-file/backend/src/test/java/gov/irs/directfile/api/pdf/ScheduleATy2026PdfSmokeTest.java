package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
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
 * #67: 2026 draft Schedule A (irs.gov/pub/irs-dft/f1040sa--dft.pdf) end-to-end, same synthetic filer as #65.
 * Itemizer fixture: $9,000 medical, $9,000 state income tax, $6,000 real estate tax, $12,000 Form 1098 mortgage
 * interest, $800 cash gifts. Synthetic PII only. Asserts lines tie out on the face of the form and the cover is dropped.
 */
class ScheduleATy2026PdfSmokeTest {

    static byte[] generate(Map<String, String> extraFactsJson) throws Exception {
        return generate(extraFactsJson, false);
    }

    /** The public print path only, with no field-map fill: refused returns throw. */
    static byte[] generatePublicPrint(Map<String, String> extraFactsJson) throws Exception {
        return generate(extraFactsJson, true);
    }

    private static byte[] generate(Map<String, String> extraFactsJson, boolean publicPrintOnly) throws Exception {
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
        for (var e : extraFactsJson.entrySet()) {
            facts.put(e.getKey(), mapper.readValue(e.getValue(), FactTypeWithItem.class));
        }
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026); // configured-pdfs bucket; the IRS1040 en template itself is the 2026 draft
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        if (publicPrintOnly) {
            try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
                return in.readAllBytes();
            }
        }
        // #89: a Schedule C return (Schedule SE tests) is refused by the public path; its other forms are still filled.
        return PrintRefusingKnockoutsTest.printForFieldMaps(pdfService, taxReturn, factGraphService.getGraph(facts));
    }

    static String bool(boolean b) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":" + b + "}";
    }

    static String dollar(String d) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.DollarWrapper\",\"item\":\"" + d + "\"}";
    }

    static String string(String s) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.StringWrapper\",\"item\":\"" + s + "\"}";
    }

    static String collection(String... ids) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[\""
                + String.join("\",\"", ids) + "\"]}}";
    }

    static Map<String, String> fields(PDDocument doc) {
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            byName.put(f.getFullyQualifiedName(), f.getValueAsString());
        }
        return byName;
    }

    static String value(Map<String, String> byName, String suffix) {
        for (var e : byName.entrySet()) {
            if (e.getKey().endsWith(suffix)
                    && e.getValue() != null
                    && !e.getValue().isEmpty()) {
                return e.getValue();
            }
        }
        return "";
    }

    static long cents(String v) {
        String d = v.replaceAll("[^0-9.]", "");
        return d.isEmpty() ? 0 : Math.round(Double.parseDouble(d) * 100);
    }

    static Map<String, String> itemizer() {
        Map<String, String> m = new HashMap<>();
        m.put("/scheduleAWantsToItemize", bool(true));
        m.put("/scheduleAHasUnsupportedItems", bool(false));
        m.put("/scheduleAWritableMedical", dollar("9000.00"));
        m.put("/scheduleAWritableStateLocalIncomeOrSalesTax", dollar("9000.00"));
        m.put("/scheduleAWritableRealEstateTaxes", dollar("6000.00"));
        m.put("/scheduleAWritablePersonalPropertyTaxes", dollar("0.00"));
        m.put("/scheduleAWritableMortgageInterest", dollar("12000.00"));
        m.put("/scheduleAWritableCashGifts", dollar("800.00"));
        m.put("/scheduleAWritableElectsToItemize", bool(false));
        return m;
    }

    @Test
    void itemizedLinesTieOutAndDraftCoverIsDropped() throws Exception {
        byte[] bytes = generate(itemizer());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedulea-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fields(doc);
            long l1 = cents(value(f, "form1[0].Page1[0].f1_03[0]"));
            long l2 = cents(value(f, "form1[0].Page1[0].f1_04[0]"));
            long l3 = cents(value(f, "form1[0].Page1[0].f1_05[0]"));
            long l4 = cents(value(f, "form1[0].Page1[0].f1_06[0]"));
            assertEquals(900000, l1, "line 1 medical");
            assertTrue(l2 > 0, "line 2 = 1040 line 11b printed");
            assertEquals(Math.round(l2 * 0.075 / 100.0) * 100, l3, "line 3 = line 2 x 7.5%");
            assertEquals(Math.max(0, l1 - l3), l4, "line 4 = line 1 - line 3, not below 0");
            assertEquals(1500000, cents(value(f, "form1[0].Page1[0].f1_10[0]")), "5d = 5a + 5b + 5c");
            assertEquals(1500000, cents(value(f, "form1[0].Page1[0].f1_11[0]")), "5e = smaller of 5d or $40,400");
            assertEquals(1500000, cents(value(f, "form1[0].Page1[0].f1_14[0]")), "7 = 5e + 6");
            assertEquals(1200000, cents(value(f, "form1[0].Page1[0].f1_15[0]")), "8a Form 1098 interest");
            assertEquals(1200000, cents(value(f, "form1[0].Page1[0].f1_22[0]")), "10 = 8e + 9");
            assertEquals(80000, cents(value(f, "form1[0].Page2[0].Line11_ReadOrder[0].f2_01[0]")), "11 cash gifts");
            long l15 = cents(value(f, "form1[0].Page2[0].f2_05[0]"));
            long l18 = cents(value(f, "form1[0].Page2[0].f2_19[0]"));
            assertEquals(l4 + 1500000 + 1200000 + l15, l18, "18 = 4 + 7 + 10 + 15");
            // Issue #67: Schedule A line 18 (older forms: line 17) equals Form 1040 line 12e.
            // #178: on the 2026 Form 1040 draft line 12e is Page 2 f2_02 (tooltip "12e. Standard deduction or itemized
            // deductions (from Schedule A)."); f1_57 is line 1z ("1z. Add lines 1a through 1h."). The full name keeps
            // Schedule A's own form1[0].Page2[0].f2_02[0] (line 12) out of the match.
            assertEquals(
                    l18,
                    cents(value(f, "topmostSubform[0].Page2[0].f2_02[0]")),
                    "Sch A line 18 == 1040 line 12e (/standardOrItemizedDeductions)");
            String no = value(f, "form1[0].Page2[0].c2_1[0]");
            assertFalse(no.isEmpty() || "Off".equals(no), "line 18 No box checked");
            // Unsupported lines stay blank, not a silent 0.
            assertEquals("", value(f, "form1[0].Page1[0].f1_21[0]"), "line 9 blank");
            assertEquals("", value(f, "form1[0].Page2[0].f2_04[0]"), "line 14 blank");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }
}
