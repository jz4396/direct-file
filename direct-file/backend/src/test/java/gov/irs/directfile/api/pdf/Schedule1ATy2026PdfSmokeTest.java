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
 * #66: 2026 draft Schedule 1-A (irs.gov/pub/irs-dft/f1040s1a--dft.pdf) end-to-end, same synthetic filer as #65.
 * Two vehicles with $4,000 of car loan interest each (IRC 163(h)(4)). Synthetic PII only; VINs are made-up
 * 17-character values. Asserts both VINs print on 28a/28b column (i) and nowhere else, Part IV ties out, cover dropped.
 */
class Schedule1ATy2026PdfSmokeTest {

    private static final String P2 = "topmostSubform[0].Page2[0].";

    static byte[] generate(Map<String, String> extraFactsJson) throws Exception {
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
        taxReturn.setTaxYear(2024); // configured-pdfs bucket; the IRS1040 en template itself is the 2026 draft
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
            return in.readAllBytes();
        }
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

    static final String V1 = "c1111111-1111-4111-8111-111111111111";
    static final String V2 = "c2222222-2222-4222-8222-222222222222";
    static final String V3 = "c3333333-3333-4333-8333-333333333333";
    /** Synthetic VINs (17 chars, no I/O/Q). Never real. */
    static final Map<String, String> VINS = Map.of(V1, "1HGCM82633A004352", V2, "2T1BR32E54C000001", V3, "3VWFE21C04M000002");

    static Map<String, String> vehicle(String id, String interest) {
        Map<String, String> m = new HashMap<>();
        String p = "/carLoans/#" + id + "/";
        m.put(p + "isNewVehicle", bool(true));
        m.put(p + "usAssembly", bool(true));
        m.put(p + "after2024", bool(true));
        m.put(p + "hasBusinessUse", bool(false));
        m.put(p + "isLease", bool(false));
        m.put(p + "hasOtherExceptions", bool(false));
        m.put(p + "vin", string(VINS.get(id)));
        m.put(p + "writableInterest", dollar(interest));
        return m;
    }

    static Map<String, String> giftsAndCarLoans(String... vehicleIds) {
        Map<String, String> m = new HashMap<>();
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/nonItemizerHadCashGifts", bool(true));
        m.put("/nonItemizerWritableCashGifts", dollar("500.00"));
        m.put("/carLoanHadInterest", bool(true));
        m.put("/carLoansIsDone", bool(true));
        m.put("/carLoans", collection(vehicleIds));
        for (String id : vehicleIds) {
            m.putAll(vehicle(id, "4000.00"));
        }
        return m;
    }

    static Map<String, String> fields(PDDocument doc) {
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            byName.put(f.getFullyQualifiedName(), f.getValueAsString());
        }
        return byName;
    }

    /** Value of the first non-blank field whose name ends with the suffix (merge may prefix names). */
    static String value(Map<String, String> byName, String suffix) {
        for (var e : byName.entrySet()) {
            if (e.getKey().endsWith(suffix) && e.getValue() != null && !e.getValue().isEmpty()) {
                return e.getValue();
            }
        }
        return "";
    }

    static long cents(String v) {
        String d = v.replaceAll("[^0-9.]", "");
        if (d.isEmpty()) {
            return 0;
        }
        return Math.round(Double.parseDouble(d) * 100);
    }

    static final String P3 = "form1[0].Page3[0].";

    @Test
    void twoVehiclesPrintBothVinsAndPartIvAddsUp() throws Exception {
        byte[] bytes = generate(giftsAndCarLoans(V1, V2));
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedule1a-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fields(doc);
            // 28a / 28b column (i): each VIN prints (IRC 163(h)(4)(B)(iii)); column (iii): this vehicle's interest.
            assertEquals(VINS.get(V1), value(f, P3 + "Table_Line28a[0].Line28a[0].VIN-1_Comb[0].f3_01[0]"), "28a(i)");
            assertEquals(VINS.get(V2), value(f, P3 + "Table_Line28b[0].Line28b[0].VIN-2_Comb[0].f3_04[0]"), "28b(i)");
            assertEquals(400000, cents(value(f, P3 + "Table_Line28a[0].Line28a[0].f3_03[0]")), "28a(iii)");
            assertEquals(400000, cents(value(f, P3 + "Table_Line28b[0].Line28b[0].f3_06[0]")), "28b(iii)");
            assertEquals(800000, cents(value(f, P3 + "f3_07[0]")), "29 = 28a + 28b column (iii)");
            assertEquals(800000, cents(value(f, P3 + "f3_08[0]")), "30 = smaller of line 29 or $10,000");
            assertEquals(800000, cents(value(f, P3 + "f3_14[0]")), "36 (MAGI under $100,000: no phaseout)");
            assertEquals(800000, cents(value(f, P3 + "f3_23[0]")), "44 = 15 + 27 + 36 + 43");
            assertFalse(value(f, P3 + "c3_1[0]").isEmpty() || "Off".equals(value(f, P3 + "c3_1[0]")), "28a(1) Yes");
            assertFalse(value(f, P3 + "c3_3[0]").isEmpty() || "Off".equals(value(f, P3 + "c3_3[0]")), "28b(1) Yes");

            // VINs appear only in the two VIN fields.
            long vinFields = f.entrySet().stream()
                    .filter(e -> e.getValue() != null
                            && (e.getValue().contains(VINS.get(V1)) || e.getValue().contains(VINS.get(V2))))
                    .count();
            assertEquals(2, vinFields, "VIN only in 28a/28b column (i)");

            // Draft cover sheet must not print; three form pages remain.
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
            assertTrue(text.contains("Schedule 1-A") || text.contains("SCHEDULE 1-A"), "Schedule 1-A present");
        }
    }
}
