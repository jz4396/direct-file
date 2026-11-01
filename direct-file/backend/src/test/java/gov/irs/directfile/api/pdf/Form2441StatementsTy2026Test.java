package gov.irs.directfile.api.pdf;

import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #124 SWAP: Form 2441 statements are repo-built. Headings are the 2026 draft Form 2441 committed at
 * pdf/2026/IRS2441/en/f2441--dft.pdf (https://www.irs.gov/pub/irs-dft/f2441--dft.pdf, SHA-256
 * 67eca7567ce5ff06e72d40a07db487f406da33139e664c0c0d9c67a4e31e9385), page 2. There is no separate IRS
 * statement form, and this slice does not download a final Form 2441.
 */
class Form2441StatementsTy2026Test {

    static final String FORM_SHA = "67eca7567ce5ff06e72d40a07db487f406da33139e664c0c0d9c67a4e31e9385";

    @Test
    void qualifyingPersonsStatementUsesThe2026Line2Headings() throws Exception {
        String config = text("pdf/2026/CDCC_QUALIFYING_PERSON_STATEMENT/en/configuration.yml");
        assertTrue(config.contains("REPO-BUILT STATEMENT"));
        assertTrue(config.contains(FORM_SHA));
        assertTrue(config.contains("#124 SWAP"));
        assertTrue(config.contains(
                "(d) Qualified expenses you incurred and paid in 2026 for the person listed in column (a)"));
        assertFalse(config.contains("2024"));
        String page = pdfText("pdf/2026/CDCC_QUALIFYING_PERSON_STATEMENT/en/irs2441-qualifying-persons.pdf");
        assertTrue(page.contains("Form 2441 Additional Qualifying Persons"));
        assertTrue(page.contains(
                "Qualified expenses you incurred and paid in 2026 for the person listed in column (a)"));
        assertFalse(page.contains("2024"));
        assertFalse(page.contains("paid in 2024"));
        try (PDDocument doc = Loader.loadPDF(bytes(
                "pdf/2026/CDCC_QUALIFYING_PERSON_STATEMENT/en/irs2441-qualifying-persons.pdf"))) {
            assertNotNull(doc.getDocumentCatalog()
                    .getAcroForm()
                    .getField(
                            "d Qualified expenses you incurred and paid in 2026 for the person listed in column aRow1"));
        }
    }

    @Test
    void careProvidersStatementUsesThe2026Line1dHeading() throws Exception {
        String config = text("pdf/2026/CDCC_CAREGIVERS_STATEMENT/en/configuration.yml");
        assertTrue(config.contains("REPO-BUILT STATEMENT"));
        assertTrue(config.contains(FORM_SHA));
        assertTrue(config.contains("Was the care provider your household employee in 2026?"));
        assertFalse(config.contains("2024"));
        String page = pdfText("pdf/2026/CDCC_CAREGIVERS_STATEMENT/en/irs2441-care-providers.pdf");
        assertTrue(page.contains("Form 2441 Additional Care Providers"));
        assertTrue(page.contains("Was the care provider your household employee in 2026?"));
        assertTrue(page.contains("1c Identifying number (SSN or EIN)"));
        assertFalse(page.contains("2024"));
        assertFalse(page.contains("household employee in 2024"));
        try (PDDocument doc =
                Loader.loadPDF(bytes("pdf/2026/CDCC_CAREGIVERS_STATEMENT/en/irs2441-care-providers.pdf"))) {
            assertNotNull(doc.getDocumentCatalog()
                    .getAcroForm()
                    .getField("d Was the care provider your household employee in 2026Row1"));
        }
    }

    @Test
    void dueDiligenceStatementCitesForm2441Line1c() throws Exception {
        String config = text("pdf/2026/IRS2441_DUE_DILIGENCE_STATEMENT/en/configuration.yml");
        assertTrue(config.contains("REPO-BUILT STATEMENT"));
        assertTrue(config.contains(FORM_SHA));
        assertTrue(config.contains("Identifying number (SSN or EIN)"));
        assertTrue(config.contains("See Attached Statement"));
        assertFalse(config.contains("2024"));
        String page = pdfText("pdf/2026/IRS2441_DUE_DILIGENCE_STATEMENT/en/irs2441-due-diligence.pdf");
        assertTrue(page.contains("Form 2441 Due Diligence Statement"));
        assertTrue(page.contains("Identifying number (SSN or EIN)"));
        assertTrue(page.contains(
                "I can't get the identifying number (EIN/SSN) for the care provider(s) listed in this table."));
        assertFalse(page.contains("2024"));
    }

    @Test
    void applicationYamlPointsThe2026PrintPathAtTheRepoBuiltStatements() throws Exception {
        String app = text("application.yaml");
        assertTrue(app.contains("pdf/2026/CDCC_QUALIFYING_PERSON_STATEMENT/en/irs2441-qualifying-persons.pdf"));
        assertTrue(app.contains("pdf/2026/CDCC_CAREGIVERS_STATEMENT/en/irs2441-care-providers.pdf"));
        assertTrue(app.contains("pdf/2026/IRS2441_DUE_DILIGENCE_STATEMENT/en/irs2441-due-diligence.pdf"));
        assertFalse(app.contains("pdf/2024/CDCC_QUALIFYING_PERSON_STATEMENT"));
        assertFalse(app.contains("pdf/2024/CDCC_CAREGIVERS_STATEMENT"));
        assertFalse(app.contains("pdf/2024/IRS2441_DUE_DILIGENCE_STATEMENT"));
    }

    private static String text(String classpath) throws Exception {
        return new String(bytes(classpath), StandardCharsets.UTF_8);
    }

    private static byte[] bytes(String classpath) throws Exception {
        return new ClassPathResource(classpath).getContentAsByteArray();
    }

    private static String pdfText(String classpath) throws Exception {
        try (PDDocument doc = Loader.loadPDF(bytes(classpath))) {
            return new PDFTextStripper().getText(doc).replaceAll("\\s+", " ").trim();
        }
    }
}
