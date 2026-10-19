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
 * #123: pdf/2026/state-interim-pdf-sha256.txt pins the SHA-256 of each state form committed as an interim tax year 2026
 * template (the latest published year, kept in the file name), as downloaded from the state's site. Recompute every hash
 * against the committed file so a template cannot change without the manifest and its year-based field map being
 * reviewed again.
 */
class StateInterimPdfHashManifestTest {

    static final String PA_DOR = "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/";

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
                assertTrue(cols[2].startsWith(PA_DOR), "source is the PA Department of Revenue: " + row);
                String year = cols[1].replaceAll(".*/(\\d{4})_[^/]*$", "$1");
                assertTrue(cols[2].contains("/" + year + "/" + year + "_"), "file name keeps the source year: " + row);
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
