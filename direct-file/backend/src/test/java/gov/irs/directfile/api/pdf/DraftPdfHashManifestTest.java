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

/**
 * #122: pdf/2026/draft-pdf-sha256.txt pins the SHA-256 of each IRS early-release draft PDF as downloaded from
 * irs.gov/pub/irs-dft. Recompute every hash against the committed file so a template cannot change without the manifest
 * (and the draft-based field map) being reviewed again.
 */
class DraftPdfHashManifestTest {

    @Test
    void committedDraftPdfsMatchPinnedSha256() throws Exception {
        int checked = 0;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource("pdf/2026/draft-pdf-sha256.txt").getInputStream(), StandardCharsets.UTF_8))) {
            String row;
            while ((row = r.readLine()) != null) {
                if (row.isBlank() || row.startsWith("#")) {
                    continue;
                }
                String[] cols = row.trim().split("\\s+");
                assertTrue(cols.length >= 3, "manifest row has <sha256> <path> <url>: " + row);
                assertTrue(
                        cols[2].startsWith("https://www.irs.gov/pub/irs-dft/"), "source is an irs.gov draft: " + row);
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                try (InputStream in = new ClassPathResource("pdf/2026/" + cols[1]).getInputStream()) {
                    sha.update(in.readAllBytes());
                }
                assertEquals(cols[0], HexFormat.of().formatHex(sha.digest()), cols[1]);
                checked++;
            }
        }
        assertTrue(checked > 0, "manifest lists at least one draft PDF");
    }
}
