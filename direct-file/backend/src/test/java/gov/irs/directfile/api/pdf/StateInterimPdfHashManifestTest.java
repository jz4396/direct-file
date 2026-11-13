package gov.irs.directfile.api.pdf;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * #123: pdf/2026/state-interim-pdf-sha256.txt pins the SHA-256 of each state form committed as an interim tax year 2026
 * template (the latest published year, kept in the file name), as downloaded from the state's site. Recompute every hash
 * against the committed file so a template cannot change without the manifest and its year-based field map being
 * reviewed again.
 */
class StateInterimPdfHashManifestTest {

    static final String PA_DOR = "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/";
    static final String IDOR = "https://tax.illinois.gov/";

    @Test
    void committedStateInterimPdfsMatchPinnedSha256() throws Exception {
        int checked = 0;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource("pdf/2026/state-interim-pdf-sha256.txt").getInputStream(),
                StandardCharsets.UTF_8))) {
            String row;
            while ((row = r.readLine()) != null) {
                if (row.isBlank() || row.startsWith("#")) {
                    continue;
                }
                String[] cols = row.trim().split("\\s+");
                assertTrue(cols.length >= 3, "manifest row has <sha256> <path> <url>: " + row);
                if (cols[2].startsWith(PA_DOR)) {
                    if (cols[1].matches(".*/\\d{4}_[^/]+")) {
                        String year = cols[1].replaceAll(".*/(\\d{4})_[^/]*$", "$1");
                        assertTrue(
                                cols[2].contains("/" + year + "/" + year + "_"),
                                "file name keeps the source year: " + row);
                    } else {
                        assertEquals(
                                "PA40C/en/pa-40c.pdf",
                                cols[1],
                                "only the undated PA-40 C (EX) 03-26 file omits a year stamp");
                        assertTrue(cols[2].endsWith("/pa-40c.pdf"), "PA-40 C source URL: " + row);
                    }
                } else if (cols[2].startsWith(IDOR)) {
                    assertTrue(
                            cols[1].matches("IL(1040|WIT)/en/2025_.*\\.pdf"),
                            "Illinois interim template keeps 2025 in the file name: " + row);
                } else {
                    fail("source is the PA Department of Revenue or the Illinois Department of Revenue: " + row);
                }
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                try (InputStream in = new ClassPathResource("pdf/2026/" + cols[1]).getInputStream()) {
                    sha.update(in.readAllBytes());
                }
                assertEquals(cols[0], HexFormat.of().formatHex(sha.digest()), cols[1]);
                checked++;
            }
        }
        assertTrue(checked >= 2, "manifest lists the PA-40 and Schedule SP templates");
    }
}
