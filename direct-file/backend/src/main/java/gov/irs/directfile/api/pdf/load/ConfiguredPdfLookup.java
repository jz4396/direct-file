package gov.irs.directfile.api.pdf.load;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import lombok.extern.slf4j.Slf4j;

import gov.irs.directfile.api.config.ConfiguredPdfProperties;
import gov.irs.directfile.api.errors.DefaultCaseException;
import gov.irs.directfile.api.io.IOLocationException;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.pdf.PdfCreationException;

@Slf4j
@SuppressFBWarnings(value = "CT_CONSTRUCTOR_THROW", justification = "Java 21 update")
public class ConfiguredPdfLookup {
    private static final String locationPrefix = "pdflookup";

    /**
     * Tax year whose prescribed forms are the templates under {@code pdf/2026/}. 26 U.S.C. 6011(a) requires a return
     * "according to the forms and regulations prescribed by the Secretary."
     */
    static final String PRESCRIBED_FORM_YEAR = "2026";

    /** Directory of templates prescribed for {@link #PRESCRIBED_FORM_YEAR}. */
    static final String PRESCRIBED_TEMPLATE_PREFIX = "pdf/2026/";

    private static final String ENGLISH = "en";

    private final ConfiguredPdfMap map = new ConfiguredPdfMap();

    /** Year, then form, then language, to the configured template location. */
    private final Map<String, Map<String, Map<String, String>>> templateLocations;

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).trim();
    }

    public ConfiguredPdfLookup(IOLocationService ioLocationService, List<ConfiguredPdfProperties> properties)
            throws IOLocationException, IOException, DefaultCaseException {
        templateLocations = indexTemplateLocations(properties);
        for (int i = 0; i < properties.size(); i++) {
            var prop = properties.get(i);
            var name = normalize(prop.getName());
            var year = prop.getYear();
            var lang = normalize(prop.getLanguageCode());
            if (lang.length() > 2) throw new RuntimeException("PDF generation accepts only 2 letter language codes");
            log.info("Getting stream access to PDF");
            AtomicReference<InputStream> pdfStream = new AtomicReference<>(ioLocationService.read(
                    IOLocationService.getConfiguredLocationType(prop.getLocationType()), prop.getLocation()));
            log.info("Getting stream access to PDF config");
            AtomicReference<InputStream> configStream = new AtomicReference<>(ioLocationService.read(
                    IOLocationService.getConfiguredLocationType(prop.getConfigurationLocationType()),
                    prop.getConfigurationLocation()));
            // if we need to, put the PDF in memory to make it work faster!
            if (prop.isCacheInMemory()) {
                ioLocationService.write(
                        IOLocationService.ConfiguredLocations.memory,
                        inMemoryCacheName(name, year, lang, false),
                        pdfStream.get());
                pdfStream.set(ioLocationService.read(
                        IOLocationService.ConfiguredLocations.memory, inMemoryCacheName(name, year, lang, false)));
            }
            // the configs are small, so they should be in memory generally
            ioLocationService.write(
                    IOLocationService.ConfiguredLocations.memory,
                    inMemoryCacheName(name, year, lang, true),
                    configStream.get());
            configStream.set(ioLocationService.read(
                    IOLocationService.ConfiguredLocations.memory, inMemoryCacheName(name, year, lang, true)));
            var languages = map.getFormLanguages(year, name);
            var configuredPdf = new ConfiguredPdf(
                    pdfStream.get(), PdfConfiguration.load(configStream.get()), prop.getPagesToInclude());
            languages.put(lang, configuredPdf);
        }
    }

    private String inMemoryCacheName(String name, String year, String language, boolean config) {
        if (!config) {
            return String.format("%s:%s-%s-%s", locationPrefix, year, name, language);
        } else {
            return String.format("%s:%s-%s-%s-config", locationPrefix, year, name, language);
        }
    }

    public ConfiguredPdf getBlankPdfStream(String year, String formName, String language) throws PdfCreationException {
        // if the form isn't available in the specified language, it may still
        // be available in english.  This should probably be configurable
        var stream = map.getForm(year, normalize(formName), normalize(language), true);
        if (stream == null) throw new PdfCreationException(String.format("%s form missing", formName));

        try {
            // Not the ideal solution, but solves the error from multiple reads for a file stored in the map
            // Problem: putting the ConfiguredPdf blankPDF stream into the map then reading it moves the position
            // to the end of the file causing an unexpected error on the second read of that stream
            // (e.g. two calls to generate a PDF )
            stream.reset();
        } catch (IOException e) {
            throw new PdfCreationException(e);
        }
        return stream;
    }

    /**
     * Template locations for {@code year} and {@code language} that are not the form prescribed for that year.
     *
     * <p>26 U.S.C. 6011(a): a return is made according to the forms prescribed by the Secretary. For
     * {@link #PRESCRIBED_FORM_YEAR}, that form is the template under {@code pdf/2026/}. When the requested language
     * resolves to some other location and the same form has a 2026 English template, the other location is a
     * prior-year (or otherwise unprescribed) form and is refused. An {@code es} entry wins over the English fallback,
     * matching {@link ConfiguredPdfMap}. A language with no entry resolves to English. Any other year is unchanged.
     * The result is every such location, not a fixed list of forms.
     */
    public List<String> templateLocationsOutsidePrescribedYear(String year, String language) {
        return templateLocationsOutsidePrescribedYear(year, language, templateLocations);
    }

    /** {@link #templateLocationsOutsidePrescribedYear(String, String)} for a configured-pdf list. */
    public static List<String> templateLocationsOutsidePrescribedYear(
            String year, String language, List<ConfiguredPdfProperties> configured) {
        return templateLocationsOutsidePrescribedYear(year, language, indexTemplateLocations(configured));
    }

    private static List<String> templateLocationsOutsidePrescribedYear(
            String year, String language, Map<String, Map<String, Map<String, String>>> locations) {
        if (year == null || language == null || !PRESCRIBED_FORM_YEAR.equals(year.trim())) {
            return List.of();
        }
        Map<String, Map<String, String>> forms = locations.get(PRESCRIBED_FORM_YEAR);
        if (forms == null) {
            return List.of();
        }
        String requested = normalize(language);
        List<String> refused = new ArrayList<>();
        for (Map<String, String> byLanguage : forms.values()) {
            String english = byLanguage.get(ENGLISH);
            if (!isPrescribedYearTemplate(english)) {
                continue;
            }
            // Same resolution as ConfiguredPdfMap: the requested language wins; English is the fallback.
            String resolved = byLanguage.get(requested);
            if (resolved == null && !ENGLISH.equals(requested)) {
                resolved = english;
            }
            if (resolved != null && !isPrescribedYearTemplate(resolved)) {
                refused.add(resolved);
            }
        }
        return List.copyOf(refused);
    }

    /** True when {@code location} is a template under {@code pdf/2026/}, classpath or directory layout. */
    static boolean isPrescribedYearTemplate(String location) {
        if (location == null) {
            return false;
        }
        String path = location.replace('\\', '/');
        return path.startsWith(PRESCRIBED_TEMPLATE_PREFIX) || path.contains("/" + PRESCRIBED_TEMPLATE_PREFIX);
    }

    private static Map<String, Map<String, Map<String, String>>> indexTemplateLocations(
            List<ConfiguredPdfProperties> configured) {
        Map<String, Map<String, Map<String, String>>> indexed = new LinkedHashMap<>();
        if (configured == null) {
            return indexed;
        }
        for (ConfiguredPdfProperties prop : configured) {
            if (prop == null || prop.getYear() == null || prop.getName() == null || prop.getLanguageCode() == null) {
                continue;
            }
            indexed.computeIfAbsent(prop.getYear().trim(), ignored -> new LinkedHashMap<>())
                    .computeIfAbsent(normalize(prop.getName()), ignored -> new LinkedHashMap<>())
                    .put(normalize(prop.getLanguageCode()), prop.getLocation());
        }
        return indexed;
    }
}
