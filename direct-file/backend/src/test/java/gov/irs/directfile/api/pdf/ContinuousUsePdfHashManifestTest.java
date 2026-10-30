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
 * #89: pdf/2026/continuous-use-pdf-sha256.txt pins the SHA-256 of each IRS continuous-use final PDF as downloaded from
 * irs.gov/pub/irs-pdf (forms a TY2026 return files, e.g. Form 8862 Rev. 12-2025). Recompute every hash against the
 * committed file so a template cannot change without the manifest and its year-based field map being reviewed again.
 */
class ContinuousUsePdfHashManifestTest {

    @Test
    void committedContinuousUsePdfsMatchPinnedSha256() throws Exception {
        int checked = 0;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource("pdf/2026/continuous-use-pdf-sha256.txt").getInputStream(),
                StandardCharsets.UTF_8))) {
            String row;
            while ((row = r.readLine()) != null) {
                if (row.isBlank() || row.startsWith("#")) {
                    continue;
                }
                String[] cols = row.trim().split("\\s+");
                assertTrue(cols.length >= 3, "manifest row has <sha256> <path> <url>: " + row);
                assertTrue(
                        cols[2].startsWith("https://www.irs.gov/pub/irs-pdf/"),
                        "source is an irs.gov final continuous-use PDF: " + row);
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                try (InputStream in = new ClassPathResource("pdf/2026/" + cols[1]).getInputStream()) {
                    sha.update(in.readAllBytes());
                }
                assertEquals(cols[0], HexFormat.of().formatHex(sha.digest()), cols[1]);
                checked++;
            }
        }
        assertTrue(checked > 0, "manifest lists at least one continuous-use PDF");
    }
}
