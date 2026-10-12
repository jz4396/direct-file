package gov.irs.directfile.api.pdf;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.yaml.snakeyaml.Yaml;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #19: every field named in the Schedule D / Form 8949 configuration.yml must exist in the committed IRS AcroForm
 * (PdfForm throws "Failed to find field" otherwise), and each one must accept a value through PdfFieldHandler.
 */
class ScheduleDForm8949PdfTemplateTest {
    private static final String ROOT = "src/main/resources/pdf/2024/";

    @ParameterizedTest
    @ValueSource(strings = {"IRS1040SD/en/f1040sd.pdf", "IRS8949/en/f8949.pdf"})
    void everyConfiguredFieldExistsAndFills(String pdf) throws Exception {
        String config = ROOT + pdf.substring(0, pdf.lastIndexOf('/')) + "/configuration.yml";
        Map<String, String> fields = new LinkedHashMap<>();
        try (InputStream in = new FileInputStream(config)) {
            Map<String, Object> yaml = new Yaml().load(in);
            flatten("", (Map<?, ?>) yaml.get("form"), fields);
        }
        assertTrue(fields.size() >= 8, "expected mapped fields in " + config);
        try (PDDocument doc = Loader.loadPDF(new File(ROOT + pdf))) {
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            for (String name : fields.keySet()) {
                PDField field = form.getField(name);
                assertNotNull(field, pdf + " is missing AcroForm field " + name);
                if (field instanceof PDCheckBox) {
                    PdfFieldHandler.setFieldInPDF(field, Boolean.TRUE);
                    assertTrue(((PDCheckBox) field).isChecked(), name);
                } else {
                    PdfFieldHandler.setFieldInPDF(field, "1234");
                    assertEquals("1234", field.getValueAsString(), name);
                }
            }
        }
    }

    private static void flatten(String prefix, Map<?, ?> node, Map<String, String> out) {
        node.forEach((k, v) -> {
            String name = prefix.isEmpty() ? k.toString() : prefix + "." + k;
            if (v instanceof Map<?, ?> m) {
                flatten(name, m, out);
            } else {
                out.put(name, String.valueOf(v));
            }
        });
    }
}
