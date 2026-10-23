package gov.irs.directfile.api.pdf;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #124 template-swap harness. Covers every PDF template configured for tax year 2026 in application.yaml (the 2026
 * drafts and interim state forms under pdf/2026, plus the earlier-year templates still configured for 2026), so that
 * swapping a draft for the final form is one change:
 *
 * <ol>
 *   <li>replace the PDF (and its row in pdf/2026/draft-pdf-sha256.txt or state-interim-pdf-sha256.txt);
 *   <li>run {@code ./mvnw test -Dtest=Ty2026TemplateSwapHarnessTest -Dty2026.templates.write=true} to rewrite
 *       {@value #MANIFEST} and {@value #UNMAPPED} under src/test/resources;
 *   <li>fix every mapped field this test reports as missing or skipped, then review the diff of the two files: a changed
 *       hash, page count or unmapped-field list is what the new form changed.
 * </ol>
 *
 * <p>Checks: (1) every field the configuration maps, including Form 8949 rows 2-11 and table rows 1..rowsPerPage,
 * exists in the template's AcroForm and sits on a page that skipLeadingPages/skipTrailingPages keeps (a final form
 * without the draft cover sheet must drop skipLeadingPages); (2) the fillable fields left unmapped match {@value
 * #UNMAPPED}; (3) each template's SHA-256 and counts match {@value #MANIFEST}, and agree with the source manifests.
 */
class Ty2026TemplateSwapHarnessTest {
    static final String MANIFEST = "ty2026-template-manifest.txt";
    static final String UNMAPPED = "ty2026-unmapped-fields.txt";
    private static final Path GOLDEN_DIR = Path.of("src/test/resources/pdf/2026");
    private static final List<String> SOURCE_MANIFESTS =
            List.of("pdf/2026/draft-pdf-sha256.txt", "pdf/2026/state-interim-pdf-sha256.txt");
    private static final int TOOLTIP_CHARS = 72;

    /** One configured template file: the union of the fields its configurations map. */
    record Template(
            String location,
            String sha256,
            int pages,
            List<String> problems,
            Set<String> mapped,
            List<String> unmappedRows) {}

    private static final Map<String, Template> TEMPLATES = new TreeMap<>();

    @BeforeAll
    static void loadTemplates() throws Exception {
        Map<String, List<String>> configsByPdf = new TreeMap<>();
        for (Map<String, Object> pdf : configuredPdfs()) {
            if (Integer.valueOf(2026).equals(pdf.get("year"))) {
                configsByPdf
                        .computeIfAbsent(pdf.get("location").toString(), k -> new ArrayList<>())
                        .add(pdf.get("configuration-location").toString());
            }
        }
        for (Map.Entry<String, List<String>> e : configsByPdf.entrySet()) {
            TEMPLATES.put(e.getKey(), inspect(e.getKey(), e.getValue()));
        }
    }

    @Test
    void everyMappedFieldExistsOnAKeptPage() {
        assertTrue(TEMPLATES.size() >= 30, "expected the TY2026 configured templates, found " + TEMPLATES.size());
        List<String> problems = new ArrayList<>();
        TEMPLATES.values().forEach(t -> problems.addAll(t.problems()));
        assertEquals(List.of(), problems, "mapped fields that would fail or print on a dropped page");
    }

    @Test
    void manifestAndUnmappedFieldsMatchCommittedTemplates() throws Exception {
        String manifest = manifestText();
        String unmapped = unmappedText();
        if (Boolean.getBoolean("ty2026.templates.write")) {
            Files.writeString(GOLDEN_DIR.resolve(MANIFEST), manifest, StandardCharsets.UTF_8);
            Files.writeString(GOLDEN_DIR.resolve(UNMAPPED), unmapped, StandardCharsets.UTF_8);
        }
        String rerun = " (after swapping a template, rerun with -Dty2026.templates.write=true and review the diff)";
        assertEquals(golden(MANIFEST), manifest, MANIFEST + rerun);
        assertEquals(golden(UNMAPPED), unmapped, UNMAPPED + rerun);
    }

    @Test
    void sourceManifestsAgreeWithHarnessManifest() throws Exception {
        int checked = 0;
        for (String source : SOURCE_MANIFESTS) {
            for (String[] row : rows(new ClassPathResource(source).getInputStream())) {
                Template t = TEMPLATES.get("pdf/2026/" + row[1]);
                assertTrue(t != null, source + " lists a template not configured for 2026: " + row[1]);
                assertEquals(row[0], t.sha256(), row[1]);
                checked++;
            }
        }
        assertTrue(checked > 0, "source manifests list at least one template");
    }

    private static Template inspect(String location, List<String> configLocations) throws IOException {
        byte[] bytes = new ClassPathResource(location).getInputStream().readAllBytes();
        List<String> problems = new ArrayList<>();
        Set<String> mapped = new LinkedHashSet<>();
        List<String> unmappedRows = new ArrayList<>();
        int pages;
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            pages = doc.getNumberOfPages();
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            Map<COSDictionary, Integer> widgetPage = widgetPages(doc);
            for (String configLocation : configLocations) {
                PdfConfiguration config;
                try (InputStream in = new ClassPathResource(configLocation).getInputStream()) {
                    config = PdfConfiguration.load(in);
                }
                int first = templateInt(config, "skipLeadingPages");
                int last = pages - 1 - templateInt(config, "skipTrailingPages");
                if (first > last) {
                    problems.add(configLocation + ": skipLeadingPages/skipTrailingPages drop all " + pages + " pages");
                }
                for (String name : mappedFieldNames(location, config)) {
                    mapped.add(name);
                    PDField field = form == null ? null : form.getField(name);
                    if (field == null) {
                        problems.add(configLocation + ": no AcroForm field " + name);
                        continue;
                    }
                    for (PDAnnotationWidget w : field.getWidgets()) {
                        Integer page = widgetPage.get(w.getCOSObject());
                        if (page != null && (page < first || page > last)) {
                            problems.add(configLocation + ": " + name + " is on PDF page " + (page + 1)
                                    + ", which the configuration drops");
                        }
                    }
                }
            }
            if (form != null) {
                for (PDField field : form.getFieldTree()) {
                    if (isFillable(field) && !mapped.contains(field.getFullyQualifiedName())) {
                        unmappedRows.add(location + "\t" + field.getFullyQualifiedName() + "\t" + field.getFieldType()
                                + "\t" + tooltip(field));
                    }
                }
            }
        }
        MessageDigest sha;
        try {
            sha = MessageDigest.getInstance("SHA-256");
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
        return new Template(
                location, HexFormat.of().formatHex(sha.digest(bytes)), pages, problems, mapped, unmappedRows);
    }

    /** The AcroForm field names PdfForm, Irs8949PdfForm or PdfTable would look up for this configuration. */
    private static List<String> mappedFieldNames(String location, PdfConfiguration config) {
        List<String> names = new ArrayList<>();
        TableConfig table = config.getTableConfig();
        if (table != null) {
            for (PdfTableFactExpressionMapping column : table.columns()) {
                for (int row = 1; row <= table.rowsPerPage(); row++) {
                    names.add(column.fieldName() + row);
                }
            }
            table.oncePerPageFields().forEach(f -> names.add(f.fieldName()));
            return names;
        }
        boolean form8949 = location.contains("/IRS8949/");
        for (String name : new TreeMap<>(config.getMapPdfFieldsToFactExpressions()).keySet()) {
            names.add(name);
            if (form8949 && Irs8949PdfForm.rowFieldName(name, 1) != null) {
                for (int row = 2; row <= Irs8949PdfForm.ROWS_PER_PART; row++) {
                    names.add(Irs8949PdfForm.rowFieldName(name, row));
                }
            }
        }
        Map<String, String> custom =
                config.getCustomData() == null ? null : config.getCustomData().get("template");
        if (custom != null && custom.get("fitTextToWidth") != null) {
            for (String name : custom.get("fitTextToWidth").split("\\|")) {
                names.add(name.trim());
            }
        }
        return names;
    }

    private static int templateInt(PdfConfiguration config, String key) {
        Map<String, String> custom =
                config.getCustomData() == null ? null : config.getCustomData().get("template");
        return custom == null || custom.get(key) == null
                ? 0
                : Integer.parseInt(custom.get(key).trim());
    }

    private static Map<COSDictionary, Integer> widgetPages(PDDocument doc) throws IOException {
        Map<COSDictionary, Integer> out = new HashMap<>();
        int i = 0;
        for (PDPage page : doc.getPages()) {
            for (PDAnnotation a : page.getAnnotations()) {
                out.put(a.getCOSObject(), i);
            }
            i++;
        }
        return out;
    }

    private static boolean isFillable(PDField field) {
        return field instanceof PDTerminalField
                && !(field instanceof PDPushButton)
                && !(field instanceof PDSignatureField)
                && !field.isReadOnly();
    }

    private static String tooltip(PDField field) {
        String tip = field.getAlternateFieldName() == null
                ? ""
                : field.getAlternateFieldName().replaceAll("\\s+", " ").trim();
        return tip.length() > TOOLTIP_CHARS ? tip.substring(0, TOOLTIP_CHARS) + "..." : tip;
    }

    private static String manifestText() {
        StringBuilder sb = new StringBuilder(
                "# SHA-256, page count and field counts of every PDF template configured for tax year 2026 in"
                        + " application.yaml.\n# Generated and verified by Ty2026TemplateSwapHarnessTest; see its"
                        + " Javadoc before editing.\n# <sha256>  <classpath location>  pages=  mapped=  unmapped=\n");
        TEMPLATES.values().forEach(t -> sb.append(t.sha256())
                .append("  ")
                .append(t.location())
                .append("  pages=")
                .append(t.pages())
                .append("  mapped=")
                .append(t.mapped().size())
                .append("  unmapped=")
                .append(t.unmappedRows().size())
                .append('\n'));
        return sb.toString();
    }

    private static String unmappedText() {
        StringBuilder sb = new StringBuilder(
                "# Fillable AcroForm fields (not push buttons, signatures or read-only) that no tax year 2026"
                        + " configuration maps.\n# Generated and verified by Ty2026TemplateSwapHarnessTest."
                        + " <location>\\t<field>\\t<type>\\t<tooltip>\n");
        TEMPLATES.values().forEach(t -> t.unmappedRows()
                .forEach(r -> sb.append(r).append('\n')));
        return sb.toString();
    }

    private static String golden(String name) throws IOException {
        Path p = GOLDEN_DIR.resolve(name);
        return Files.exists(p) ? Files.readString(p, StandardCharsets.UTF_8) : "";
    }

    private static List<String[]> rows(InputStream in) throws IOException {
        List<String[]> out = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String row;
            while ((row = r.readLine()) != null) {
                if (!row.isBlank() && !row.startsWith("#")) {
                    out.add(row.trim().split("\\s+"));
                }
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> configuredPdfs() throws IOException {
        try (InputStream in = new ClassPathResource("application.yaml").getInputStream()) {
            for (Object doc : new Yaml().loadAll(in)) {
                Map<String, Object> root = (Map<String, Object>) doc;
                Map<String, Object> df = root == null ? null : (Map<String, Object>) root.get("direct-file");
                Map<String, Object> pdfs = df == null ? null : (Map<String, Object>) df.get("pdfs");
                if (pdfs != null && pdfs.get("configured-pdfs") != null) {
                    return (List<Map<String, Object>>) pdfs.get("configured-pdfs");
                }
            }
        }
        throw new IllegalStateException("application.yaml has no direct-file.pdfs.configured-pdfs");
    }
}
