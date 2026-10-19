package gov.irs.directfile.api.pdf;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * #123: PA school district names by five-digit code, from "PA SCHOOL DISTRICTS &amp; CODES BY COUNTY" in the PA-40 IN
 * (2025) booklet, pp. 46-47 ({@code pdf/2026/PA40/pa-school-districts-2025.tsv}). paPit.xml /paSchoolDistrictCode
 * accepts exactly these codes.
 */
final class PaSchoolDistricts {
    static final String RESOURCE = "pdf/2026/PA40/pa-school-districts-2025.tsv";
    private static final Map<String, String> NAMES = load();

    private PaSchoolDistricts() {}

    /** The district name for a code, or "" for 99999, a blank or an unknown code. */
    static String name(final String code) {
        return code == null ? "" : NAMES.getOrDefault(code.trim(), "");
    }

    static Map<String, String> all() {
        return NAMES;
    }

    private static Map<String, String> load() {
        final Map<String, String> names = new HashMap<>();
        try (InputStream in = Objects.requireNonNull(
                        PaSchoolDistricts.class.getClassLoader().getResourceAsStream(RESOURCE),
                        "Missing resource " + RESOURCE);
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            reader.lines()
                    .filter(line -> !line.isBlank() && !line.startsWith("#"))
                    .forEach(line -> {
                        final String[] cols = line.split("\t", 2);
                        names.put(cols[0].trim(), cols[1].trim());
                    });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return Collections.unmodifiableMap(names);
    }
}
