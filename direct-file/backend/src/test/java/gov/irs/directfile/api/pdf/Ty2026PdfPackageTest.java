package gov.irs.directfile.api.pdf;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.util.ReflectionTestUtils;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.config.ConfiguredPdfProperties;
import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.loaders.domain.TaxFact;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.collectionItem;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.tin;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #167: end-to-end print package for TY2026. Named *Test, not *EndToEndTest, so it runs in the {@code test} phase.
 * Each golden scenario (synthetic data; made-up names; test-only TINs in the 900 area, which the fact graph treats as
 * ITINs) is run through the real fact dictionary, application.yaml and PdfService for tax year 2026, and the combined
 * PDF is split back into forms by matching every page against the blank template pages. For every form the test
 * checks that it renders, that it has the expected page count with no draft cover sheet, that its key mapped fields
 * carry the expected values, and that its template still matches the pinned SHA-256 manifests.
 *
 * <p>Expected amounts are either inputs, a cited constant, or the form's own line arithmetic on other printed lines.
 *
 * <pre>
 * Scenario 1, investor (federal, DC): single; W-2 $250,000 wages / $184,500 social security wages / $250,000 Medicare
 *   wages / $4,075 Medicare tax withheld; 1099-INT $10,000 with a $150 early withdrawal penalty; Form 8949 box A
 *   $10,000 proceeds / $6,000 basis and box D $1,001,000 proceeds / $1,000 basis; standard deduction.
 *   Prints Form 1040, Schedules 1, 2, B, D, Form 8949 (one per sale), 6251, 8959, 8960 and the W-2.
 * Scenario 2, itemizer (PA resident): single; W-2 $60,000 (all wage boxes, PA box 16) with $1,842 PA tax withheld;
 *   1099-DIV $1,000 box 1a with $50 foreign tax (26 U.S.C. 904(j) election); Schedule A $9,000 medical, $9,000 state
 *   income tax, $6,000 real estate tax, $12,000 Form 1098 interest, $800 cash gifts; one new US-assembled vehicle with
 *   $4,000 loan interest. Prints Form 1040, Schedules 1-A, 3, A, the W-2 and PA-40.
 * Scenario 3, PA tax forgiveness: single; W-2 $15,000 with $500 PA tax withheld; two dependent children.
 *   Prints Form 1040, the W-2, PA-40 and PA-40 Schedule SP.
 * </pre>
 */
class Ty2026PdfPackageTest {
    static final int TAX_YEAR = 2026;
    static final String W2 = Form8959Form8960Ty2026PdfSmokeTest.W2;
    static final String ST = "a1111111-1111-4111-8111-111111111111";
    static final String LT = Form6251Ty2026PdfSmokeTest.LT;
    static final String SSN_DASHED = "900-00-0001";
    static final String SSN_DIGITS = "900000001";
    static final String LAST_NAME = "Exampleton";

    /** Pages printed per form instance, from the face of each form (draft cover sheets excluded). */
    static final Map<String, Integer> PAGES = Map.ofEntries(
            Map.entry("IRS1040", 2),
            Map.entry("IRS1040S1", 2),
            Map.entry("IRS1040S1A", 3),
            Map.entry("IRS1040S2", 2),
            Map.entry("IRS1040S3", 1),
            Map.entry("IRS1040SA", 2),
            Map.entry("IRS1040SB", 1),
            Map.entry("IRS1040SD", 2),
            Map.entry("IRS8949", 2),
            Map.entry("IRS6251", 2),
            Map.entry("IRS8959", 1),
            Map.entry("IRS8960", 1),
            Map.entry("PA40", 2),
            Map.entry("PA40SP", 2),
            Map.entry("IRSW2", 1));

    /**
     * English templates this package does not print, with the reason. Every configured English template is either
     * printed by a scenario below or listed here, so a new template fails this test until it is covered.
     */
    static final Map<String, String> EXCLUDED = Map.ofEntries(
            Map.entry("IRS1040SR", "2024 Form 1040-SR template only (filer 65 or older); no 2026 form committed"),
            Map.entry("DEPENDENTS_STATEMENT", "2024 statement template only (more than 4 dependents)"),
            Map.entry("SCHEDULE_R", "2024 Schedule R template only; no 2026 form committed"),
            Map.entry("IRS2441", "2024 Form 2441 template only; 2026 draft print is #120"),
            Map.entry("CDCC_QUALIFYING_PERSON_STATEMENT", "2024 Form 2441 statement template only (#120)"),
            Map.entry("CDCC_CAREGIVERS_STATEMENT", "2024 Form 2441 statement template only (#120)"),
            Map.entry("IRS2441_DUE_DILIGENCE_STATEMENT", "2024 Form 2441 statement template only (#120)"),
            Map.entry("IRS1040EIC", "2024 Schedule EIC template only; no 2026 form committed"),
            Map.entry("IRS1040S8812", "2024 Schedule 8812 template only; 2026 draft print is #120"),
            Map.entry("IRS8889", "2024 Form 8889 template only; 2026 draft print is #120"),
            Map.entry("IRS8880", "2024 Form 8880 template only; 2026 draft print is #120"),
            Map.entry("IRS8962", "2024 Form 8962 template only; no 2026 form committed"),
            Map.entry("FORM9000", "2021 Form 9000 template only (alternative media preference)"),
            Map.entry("SCHEDULE_LEP", "2024 Schedule LEP template only (language preference)"),
            Map.entry("IRS8862", "2024 Form 8862 template only; no 2026 form committed"),
            Map.entry("CTC_DEPENDENTS_STATEMENT", "2024 Form 8862 statement template only"),
            Map.entry("ODC_DEPENDENTS_STATEMENT", "2024 Form 8862 statement template only"),
            Map.entry("DF1099R", "2024 Form 1099-R copy template only; no 2026 form committed"));

    static final ObjectMapper MAPPER = new ObjectMapper();
    static FactGraphService factGraphService;
    static PdfService pdfService;
    static Map<String, ConfiguredPdfProperties> templates;
    static Map<String, List<String>> blankPageText;
    static Map<String, String> pinnedSha256;

    @BeforeAll
    static void init() throws Exception {
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.refresh();
        factGraphService = new FactGraphService(MAPPER, ctx);
        ReflectionTestUtils.setField(factGraphService, "loadAtStartup", true);
        ReflectionTestUtils.setField(factGraphService, "factDictionaryXmlPattern", "classpath:/tax/*.xml");
        Method load = FactGraphService.class.getDeclaredMethod("init");
        load.setAccessible(true);
        load.invoke(factGraphService);

        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        pdfService = new PdfService(props, new IOLocationService(null), factGraphService);

        templates = new LinkedHashMap<>();
        blankPageText = new HashMap<>();
        for (ConfiguredPdfProperties p : props.getConfiguredPdfs()) {
            if (!"en".equals(p.getLanguageCode()) || !String.valueOf(TAX_YEAR).equals(p.getYear())) {
                continue;
            }
            templates.put(p.getName(), p);
            try (PDDocument blank = Loader.loadPDF(new ClassPathResource(p.getLocation()).getContentAsByteArray())) {
                List<String> pages = new ArrayList<>();
                for (int i = 0; i < blank.getNumberOfPages(); i++) {
                    pages.add(pageText(blank, i));
                }
                blankPageText.put(p.getName(), pages);
            }
        }

        pinnedSha256 = new HashMap<>();
        for (String manifest : List.of("pdf/2026/draft-pdf-sha256.txt", "pdf/2026/state-interim-pdf-sha256.txt")) {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(new ClassPathResource(manifest).getInputStream(), StandardCharsets.UTF_8))) {
                String row;
                while ((row = r.readLine()) != null) {
                    if (!row.isBlank() && !row.startsWith("#")) {
                        String[] cols = row.trim().split("\\s+");
                        pinnedSha256.put("pdf/2026/" + cols[1], cols[0]);
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------- scenarios

    /** Made-up filer name and a test-only SSN (900 area) over the shared smoke fixture's filer. */
    static Map<String, String> syntheticFiler(Map<String, String> m) {
        String p = "/filers/#" + W2 + "/";
        m.put(p + "firstName", string("Avery"));
        m.put(p + "writableMiddleInitial", string("Q"));
        m.put(p + "lastName", string(LAST_NAME));
        m.put(p + "tin", tin("900", "00", "0001"));
        // A 9xx TIN is an ITIN to the fact graph (Tin.isSSN), so the W-2's box a TIN is its own fact
        // (/formW2s/*/usedTin); give it the same test-only number.
        m.put("/formW2s/#" + W2 + "/tin", tin("900", "00", "0001"));
        return m;
    }

    static Map<String, String> investor() {
        Map<String, String> m = new HashMap<>(Form8959Form8960Ty2026PdfSmokeTest.highIncomeScenario());
        m.putAll(Form6251Ty2026PdfSmokeTest.amtScenario());
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("250000.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWages", dollar("184500.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWithholding", dollar("11439.00"));
        m.put("/nonItemizerHadCashGifts", bool(false));
        m.put("/form8949Transactions", collection(ST, LT));
        return syntheticFiler(m);
    }

    static Map<String, String> itemizer() {
        Map<String, String> m = new HashMap<>(PaPit40ScheduleSpTy2026PdfSmokeTest.paResident());
        m.putAll(ScheduleATy2026PdfSmokeTest.itemizer());
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWithholding", dollar("3720.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWithholding", dollar("870.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWages", dollar("60000.00"));
        m.put("/formW2s/#" + W2 + "/writableStateWithholding", dollar("1842.00"));
        // No property sales: any PA sale needs PA Schedule D (/flowKnockoutPaScheduleD), which isn't produced.
        m.put("/form8949Transactions", PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION);
        // Harrisburg City, PA-40 IN (2025) p. 46.
        m.put("/paSchoolDistrictCode", string("22275"));

        String div = Schedules123Ty2026PdfSmokeTest.DIV;
        m.put("/dividendReports", collection(div));
        m.put("/dividendReports/#" + div + "/filer", collectionItem(W2));
        m.put("/dividendReports/#" + div + "/payer", string("Synthetic Index Fund"));
        m.put("/dividendReports/#" + div + "/ordinaryDividends", dollar("1000.00"));
        m.put("/dividendReports/#" + div + "/writableForeignTaxPaid", dollar("50.00"));
        m.put("/dividendReports/#" + div + "/foreignTaxElectionRequirementsMet", bool(true));
        m.put("/dividendReports/#" + div + "/hasUnsupportedBoxes", bool(false));
        m.put("/dividendReports/#" + div + "/receivedAsNominee", bool(false));
        m.put("/dividendReports/#" + div + "/hasSeenLastAvailableScreen", bool(true));
        m.put("/dividendReportsIsDone", bool(true));

        String car = Schedule1ATy2026PdfSmokeTest.V1;
        m.put("/carLoanHadInterest", bool(true));
        m.put("/carLoansIsDone", bool(true));
        m.put("/carLoans", collection(car));
        m.putAll(Schedule1ATy2026PdfSmokeTest.vehicle(car, "4000.00"));
        return syntheticFiler(m);
    }

    static Map<String, String> paTaxForgiveness() {
        Map<String, String> m = new HashMap<>(PaPit40ScheduleSpTy2026PdfSmokeTest.goldenScenario());
        String kid1 = "/familyAndHousehold/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.KID1 + "/";
        String kid2 = "/familyAndHousehold/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.KID2 + "/";
        m.put(kid1 + "lastName", string(LAST_NAME));
        m.put(kid2 + "lastName", string(LAST_NAME));
        m.put(kid1 + "tin", tin("900", "00", "0011"));
        m.put(kid2 + "tin", tin("900", "00", "0022"));
        return syntheticFiler(m);
    }

    // ---------------------------------------------------------------- tests

    @Test
    void scenariosTogetherPrintEveryConfiguredTy2026FormOrListItAsExcluded() throws Exception {
        Set<String> printed = new TreeSet<>();
        for (Map<String, String> s : List.of(investor(), itemizer(), paTaxForgiveness())) {
            printed.addAll(render(s, null).forms.keySet());
        }
        assertEquals(PAGES.keySet(), printed, "forms printed across the scenarios");
        Set<String> notPrinted = new TreeSet<>(templates.keySet());
        notPrinted.removeAll(printed);
        assertEquals(
                new TreeSet<>(EXCLUDED.keySet()), notPrinted, "every other English template is listed as excluded");
    }

    @Test
    void investorPackage() throws Exception {
        Pkg pkg = render(investor(), "e2e-ty2026-investor.pdf");
        pkg.assertForms(Map.of(
                "IRS1040",
                1,
                "IRS1040S1",
                1,
                "IRS1040S2",
                1,
                "IRS1040SB",
                1,
                "IRS1040SD",
                1,
                "IRS8949",
                2,
                "IRS6251",
                1,
                "IRS8959",
                1,
                "IRS8960",
                1,
                "IRSW2",
                1));

        Map<String, String> f1040 = pkg.fields("IRS1040", 0);
        Map<String, String> s1 = pkg.fields("IRS1040S1", 0);
        Map<String, String> s2 = pkg.fields("IRS1040S2", 0);
        Map<String, String> sb = pkg.fields("IRS1040SB", 0);
        Map<String, String> sd = pkg.fields("IRS1040SD", 0);
        Map<String, String> f6251 = pkg.fields("IRS6251", 0);
        Map<String, String> f8959 = pkg.fields("IRS8959", 0);
        Map<String, String> f8960 = pkg.fields("IRS8960", 0);

        // Form 8949: one form per sale; columns (d) proceeds, (e) basis, (h) = (d) - (e); line 2 totals.
        Map<String, String> partI = pkg.fields("IRS8949", 0);
        assertEquals("100 sh FAKECO", text(partI, "Page1[0].Table_Line1_Part1[0].Row1[0].f1_03[0]"));
        assertEquals(10000, amt(partI, "Row1[0].f1_06[0]"), "Part I (d)");
        assertEquals(6000, amt(partI, "Row1[0].f1_07[0]"), "Part I (e)");
        assertEquals(10000 - 6000, amt(partI, "Row1[0].f1_10[0]"), "Part I (h) = (d) - (e)");
        assertEquals(4000, amt(partI, "Page1[0].f1_95[0]"), "Part I line 2 (h)");
        assertTrue(checked(partI, "Page1[0].c1_1[0]"), "Part I box A");
        Map<String, String> partII = pkg.fields("IRS8949", 1);
        assertEquals("50 sh EXAMPLE INC", text(partII, "Page2[0].Table_Line1_Part2[0].Row1[0].f2_03[0]"));
        assertEquals(1001000 - 1000, amt(partII, "Row1[0].f2_10[0]"), "Part II (h) = (d) - (e)");
        assertEquals(1000000, amt(partII, "Page2[0].f2_95[0]"), "Part II line 2 (h)");
        assertTrue(checked(partII, "Page2[0].c2_1[0]"), "Part II box D");

        // Schedule D
        assertEquals(amt(partI, "Page1[0].f1_95[0]"), amt(sd, "Row1b[0].f1_10[0]"), "1b = 8949 box A total (h)");
        assertEquals(amt(sd, "Row1b[0].f1_10[0]"), amt(sd, "f1_22[0]"), "7 = 1a..6 (only 1b)");
        assertEquals(amt(partII, "Page2[0].f2_95[0]"), amt(sd, "Row8b[0].f1_30[0]"), "8b = 8949 box D total (h)");
        assertEquals(amt(sd, "Row8b[0].f1_30[0]"), amt(sd, "f1_43[0]"), "15 = 8a..14 (only 8b)");
        assertEquals(amt(sd, "f1_22[0]") + amt(sd, "f1_43[0]"), amt(sd, "f2_1[0]"), "16 = 7 + 15");

        // Schedule B
        assertEquals("Synthetic Savings Bank", text(sb, "Line1_ReadOrder[0].f1_03[0]"));
        assertEquals(10000, amt(sb, "Page1[0].f1_04[0]"), "1 = 1099-INT box 1");
        assertEquals(10000, amt(sb, "Page1[0].f1_31[0]"), "2 = sum of line 1");
        assertEquals(amt(sb, "Page1[0].f1_31[0]"), amt(sb, "Page1[0].f1_33[0]"), "4 = 2 - 3 (no excludable bonds)");

        // Schedule 1
        assertEquals(150, amt(s1, "Page2[0].f2_08[0]"), "18 = 1099-INT box 2");
        assertEquals(150, amt(s1, "Page2[0].f2_30[0]"), "26 = 18 (only adjustment)");

        // Form 1040
        long agi = 250000 + 10000 + amt(sd, "f2_1[0]") - 150;
        assertEquals(250000, amt(f1040, "Page1[0].f1_47[0]"), "1a = W-2 box 1");
        assertEquals(amt(sb, "Page1[0].f1_33[0]"), amt(f1040, "Page1[0].f1_59[0]"), "2b = Schedule B line 4");
        assertEquals(amt(sd, "f2_1[0]"), amt(f1040, "Page1[0].f1_70[0]"), "7a = Schedule D line 16");
        assertEquals(agi + 150, amt(f1040, "Page1[0].f1_73[0]"), "9 = 1z + 2b + 7a");
        assertEquals(amt(s1, "Page2[0].f2_30[0]"), amt(f1040, "Page1[0].f1_74[0]"), "10 = Schedule 1 line 26");
        assertEquals(agi, amt(f1040, "Page1[0].f1_75[0]"), "11a = 9 - 10");
        assertEquals(agi, amt(f1040, "Page2[0].f2_01[0]"), "11b = 11a");
        // Rev. Proc. 2025-32 §4.14(1) p. 18: "Unmarried Individuals (other than Surviving Spouses and Heads of
        // Households) (§ 1(j)(2)(C)) $16,100".
        assertEquals(16100, amt(f1040, "Page2[0].f2_02[0]"), "12e standard deduction");
        assertEquals(16100, amt(f1040, "Page2[0].f2_06[0]"), "14 = 12e (no 13a/13b)");
        assertEquals(agi - 16100, amt(f1040, "Page2[0].f2_07[0]"), "15 = 11b - 14");
        assertEquals(amt(s2, "Page1[0].f1_13[0]"), amt(f1040, "Page2[0].f2_10[0]"), "17 = Schedule 2 line 3");
        assertEquals(
                amt(f1040, "Page2[0].f2_09[0]") + amt(f1040, "Page2[0].f2_10[0]"),
                amt(f1040, "Page2[0].f2_11[0]"),
                "18 = 16 + 17");
        assertEquals(amt(f1040, "Page2[0].f2_11[0]"), amt(f1040, "Page2[0].f2_15[0]"), "22 = 18 - 21 (no credits)");
        assertEquals(amt(s2, "Page2[0].f2_20[0]"), amt(f1040, "Page2[0].f2_16[0]"), "23 = Schedule 2 line 21");
        assertEquals(
                amt(f1040, "Page2[0].f2_15[0]") + amt(f1040, "Page2[0].f2_16[0]"),
                amt(f1040, "Page2[0].f2_17[0]"),
                "24 = 22 + 23");
        assertEquals(amt(f8959, "f1_26[0]"), amt(f1040, "Page2[0].f2_22[0]"), "25c = Form 8959 line 24");
        assertEquals(
                amt(f1040, "Page2[0].f2_17[0]") - amt(f1040, "Page2[0].f2_34[0]"),
                amt(f1040, "Page2[0].f2_40[0]"),
                "37 = 24 - 33");

        // Form 6251 Part I
        assertEquals(16100, amt(f6251, "Page1[0].f1_3[0]"), "1a = Form 1040 line 14 (no Schedule 1-A)");
        assertEquals(agi - 16100, amt(f6251, "Page1[0].f1_4[0]"), "1b = 11b - 1a");
        assertEquals(16100, amt(f6251, "Page1[0].f1_5[0]"), "2a = Form 1040 line 12e");
        long amti = agi;
        assertEquals(amti, amt(f6251, "Page1[0].f1_26[0]"), "4 = 1b + 2a");
        // Rev. Proc. 2025-32 §4.10 p. 17, unmarried: "Threshold Phaseout Amount $500,000", "Complete Phaseout Amount
        // $680,200". Line 4 is above $680,200, so the exemption is $0 and prints blank (no ExportZero on line 5).
        assertTrue(amti > 680200, "AMTI above the complete phaseout amount");
        assertEquals("", text(f6251, "Page1[0].f1_27[0]"), "5 exemption $0");
        assertEquals(amti, amt(f6251, "Page1[0].f1_28[0]"), "6 = 4 - 5");
        assertEquals(amt(f6251, "Page1[0].f1_29[0]"), amt(f6251, "Page1[0].f1_31[0]"), "9 = 7 - 8 (no AMT FTC)");
        assertEquals(amt(f1040, "Page2[0].f2_09[0]"), amt(f6251, "Page1[0].f1_32[0]"), "10 = Form 1040 line 16");
        long line11 = amt(f6251, "Page1[0].f1_31[0]") - amt(f6251, "Page1[0].f1_32[0]");
        assertTrue(line11 > 0, "AMT is due, so Form 6251 is required");
        assertEquals(line11, amt(f6251, "Page1[0].f1_33[0]"), "11 = 9 - 10");
        assertEquals(amt(f6251, "Page1[0].f1_28[0]"), amt(f6251, "Page2[0].f2_1[0]"), "Part III 12 = line 6");

        // Form 8959. 26 U.S.C. 3101(b)(2): 0.9% on wages over $200,000 (any return other than joint or separate);
        // 3101(b)(1): 1.45% regular Medicare tax.
        assertEquals(250000, amt(f8959, "f1_3[0]"), "1 = W-2 box 5");
        assertEquals(250000, amt(f8959, "f1_6[0]"), "4 = 1 + 2 + 3");
        assertEquals(200000, amt(f8959, "f1_7[0]"), "5 threshold, single (3101(b)(2)(C))");
        assertEquals(50000, amt(f8959, "f1_8[0]"), "6 = 4 - 5");
        assertEquals(pct(50000, "0.009"), amt(f8959, "f1_9[0]"), "7 = 6 x 0.9%");
        assertEquals(amt(f8959, "f1_9[0]"), amt(f8959, "f1_14[0]"), "12 = 7 + 11");
        assertEquals(4075, amt(f8959, "f1_21[0]"), "19 = W-2 box 6");
        assertEquals(pct(250000, "0.0145"), amt(f8959, "f1_23[0]"), "21 = 20 x 1.45%");
        assertEquals(4075 - pct(250000, "0.0145"), amt(f8959, "f1_24[0]"), "22 = 19 - 21");
        assertEquals(amt(f8959, "f1_24[0]"), amt(f8959, "f1_26[0]"), "24 = 22 + 23");

        // Form 8960. 26 U.S.C. 1411(a)(1): 3.8% of the lesser of NII or MAGI over the 1411(b) threshold ($200,000
        // "in any other case", 1411(b)(3)).
        long gain = amt(sd, "f2_1[0]");
        assertEquals(10000, amt(f8960, "f1_3[0]"), "1 = taxable interest");
        assertEquals(gain, amt(f8960, "f1_9[0]"), "5a = Schedule D line 16");
        assertEquals(10000 + gain, amt(f8960, "f1_15[0]"), "8 = 1 + 5d");
        assertEquals(150, amt(f8960, "f1_21[0]"), "11 = early withdrawal penalty (line 10)");
        long nii = 10000 + gain - 150;
        assertEquals(nii, amt(f8960, "f1_22[0]"), "12 = 8 - 11");
        assertEquals(agi, amt(f8960, "f1_23[0]"), "13 = AGI");
        assertEquals(200000, amt(f8960, "f1_24[0]"), "14 threshold, single (1411(b)(3))");
        assertEquals(agi - 200000, amt(f8960, "f1_25[0]"), "15 = 13 - 14");
        long line16 = Math.min(nii, agi - 200000);
        assertEquals(line16, amt(f8960, "f1_26[0]"), "16 = smaller of 12 or 15");
        assertEquals(pct(line16, "0.038"), amt(f8960, "f1_27[0]"), "17 = 16 x 3.8%");

        // Schedule 2 ties to the forms behind it.
        assertEquals(line11, amt(s2, "Page1[0].f1_12[0]"), "2 = Form 6251 line 11");
        assertEquals(line11, amt(s2, "Page1[0].f1_13[0]"), "3 = 1z + 2");
        assertEquals(amt(f8960, "f1_27[0]"), amt(s2, "Page1[0].f1_17[0]"), "6 = Form 8960 line 17");
        assertEquals(amt(s2, "Page1[0].f1_17[0]"), amt(s2, "Page2[0].f2_07[0]"), "15 = 4..11 + 14 (only 6)");
        assertEquals(amt(f8959, "f1_14[0]"), amt(s2, "Page2[0].f2_12[0]"), "17b = Form 8959 line 12");
        assertEquals(amt(s2, "Page2[0].f2_12[0]"), amt(s2, "Page2[0].f2_19[0]"), "20 = 17d");
        assertEquals(
                amt(s2, "Page2[0].f2_07[0]") + amt(s2, "Page2[0].f2_19[0]"),
                amt(s2, "Page2[0].f2_20[0]"),
                "21 = 15 + 20");

        // W-2 copy
        Map<String, String> w2 = pkg.fields("IRSW2", 0);
        assertEquals(250000, amt(w2, "Box1_ReadOrder[0].f2_09[0]"), "W-2 box 1");
        assertEquals(250000, amt(w2, "Box5_ReadOrder[0].f2_13[0]"), "W-2 box 5");
        assertEquals(4075, amt(w2, "Col_Right[0].f2_14[0]"), "W-2 box 6");
    }

    @Test
    void itemizerPackage() throws Exception {
        Pkg pkg = render(itemizer(), "e2e-ty2026-itemizer.pdf");
        pkg.assertForms(Map.of("IRS1040", 1, "IRS1040S1A", 1, "IRS1040S3", 1, "IRS1040SA", 1, "IRSW2", 1, "PA40", 1));

        Map<String, String> f1040 = pkg.fields("IRS1040", 0);
        Map<String, String> s1a = pkg.fields("IRS1040S1A", 0);
        Map<String, String> s3 = pkg.fields("IRS1040S3", 0);
        Map<String, String> sa = pkg.fields("IRS1040SA", 0);
        long agi = 60000 + 1000;

        // Form 1040 page 1
        assertEquals(60000, amt(f1040, "Page1[0].f1_47[0]"), "1a = W-2 box 1");
        assertEquals(1000, amt(f1040, "Page1[0].f1_61[0]"), "3b = 1099-DIV box 1a");
        assertEquals(agi, amt(f1040, "Page1[0].f1_73[0]"), "9 = 1z + 3b");
        assertEquals(agi, amt(f1040, "Page1[0].f1_75[0]"), "11a = 9 (no adjustments)");

        // Schedule A
        assertEquals(9000, amt(sa, "Page1[0].f1_03[0]"), "1 medical");
        assertEquals(agi, amt(sa, "Page1[0].f1_04[0]"), "2 = Form 1040 line 11b");
        long l3 = pct(agi, "0.075"); // 26 U.S.C. 213(a): expenses exceeding 7.5% of AGI
        assertEquals(l3, amt(sa, "Page1[0].f1_05[0]"), "3 = 2 x 7.5%");
        long l4 = 9000 - l3;
        assertEquals(l4, amt(sa, "Page1[0].f1_06[0]"), "4 = 1 - 3");
        assertEquals(9000, amt(sa, "Page1[0].f1_07[0]"), "5a state income tax");
        assertEquals(6000, amt(sa, "Page1[0].f1_08[0]"), "5b real estate tax");
        assertEquals(15000, amt(sa, "Page1[0].f1_10[0]"), "5d = 5a + 5b + 5c");
        // 5d is under the 26 U.S.C. 164(b)(7) limit, so 5e = 5d.
        assertEquals(15000, amt(sa, "Page1[0].f1_11[0]"), "5e = smaller of 5d or the limit");
        assertEquals(15000, amt(sa, "Page1[0].f1_14[0]"), "7 = 5e + 6");
        assertEquals(12000, amt(sa, "Page1[0].f1_15[0]"), "8a Form 1098 interest");
        assertEquals(12000, amt(sa, "Page1[0].f1_22[0]"), "10 = 8e + 9");
        assertEquals(800, amt(sa, "Line11_ReadOrder[0].f2_01[0]"), "11 cash gifts");
        // 26 U.S.C. 170(b)(1)(I): allowed "only to the extent that the aggregate of such contributions exceeds 0.5
        // percent of the taxpayer's contribution base" (AGI here).
        long l13 = 800 - pct(agi, "0.005");
        assertEquals(l13, amt(sa, "Page2[0].f2_03[0]"), "13 = 11 - 0.5% of AGI");
        assertEquals(l13, amt(sa, "Page2[0].f2_05[0]"), "15 = 13 + 14");
        long l18 = l4 + 15000 + 12000 + l13;
        assertEquals(l18, amt(sa, "Page2[0].f2_19[0]"), "18 = 4 + 7 + 10 + 15");

        // Schedule 1-A, vehicle loan interest (26 U.S.C. 163(h)(4))
        assertEquals("1HGCM82633A004352", text(s1a, "VIN-1_Comb[0].f3_01[0]"), "28a VIN (163(h)(4)(B)(iii))");
        assertEquals(4000, amt(s1a, "Line28a[0].f3_03[0]"), "28a interest");
        assertEquals(4000, amt(s1a, "Page3[0].f3_07[0]"), "29 = 28a + 28b");
        // 163(h)(4)(C)(i): $10,000 limit.
        assertEquals(Math.min(4000, 10000), amt(s1a, "Page3[0].f3_08[0]"), "30 = smaller of 29 or $10,000");
        assertEquals(agi, amt(s1a, "Page3[0].f3_09[0]"), "31 = line 3 (MAGI = AGI here)");
        // 163(h)(4)(C)(ii): phase-down above $100,000 MAGI ($200,000 joint).
        assertEquals(100000, amt(s1a, "Page3[0].f3_10[0]"), "32 threshold, single");
        assertEquals(4000, amt(s1a, "Page3[0].f3_14[0]"), "36 = 30 (MAGI under 32: no reduction)");
        assertEquals(4000, amt(s1a, "Page3[0].f3_23[0]"), "44 = 15 + 27 + 36 + 43 (only 36)");

        // Schedule 3: foreign tax credit without Form 1116 (26 U.S.C. 904(j)).
        assertEquals(50, amt(s3, "Page1[0].f1_03[0]"), "1 = 1099-DIV box 7");
        assertEquals(50, amt(s3, "Page1[0].f1_25[0]"), "8 = 1 + ... (only 1)");

        // Form 1040 page 2 ties
        assertEquals(l18, amt(f1040, "Page2[0].f2_02[0]"), "12e = Schedule A line 18");
        assertEquals(amt(s1a, "Page3[0].f3_23[0]"), amt(f1040, "Page2[0].f2_04[0]"), "13a = Schedule 1-A line 44");
        long l14 = l18 + 4000;
        assertEquals(l14, amt(f1040, "Page2[0].f2_06[0]"), "14 = 12e + 13a");
        assertEquals(agi - l14, amt(f1040, "Page2[0].f2_07[0]"), "15 = 11b - 14");
        assertEquals(amt(s3, "Page1[0].f1_25[0]"), amt(f1040, "Page2[0].f2_13[0]"), "20 = Schedule 3 line 8");
        assertEquals(
                amt(f1040, "Page2[0].f2_11[0]") - amt(f1040, "Page2[0].f2_14[0]"),
                amt(f1040, "Page2[0].f2_15[0]"),
                "22 = 18 - 21");

        // PA-40. 72 P.S. 7302(a) and PA-40 IN (2025) p. 21, LINE 12: "Multiply Line 11 by 3.07 percent (0.0307)."
        Map<String, String> pa = pkg.fields("PA40", 0, 0);
        assertEquals(60000, paAmt(pa, "1a. Gross Compensation"), "1a = W-2 box 16");
        assertEquals(1000, paAmt(pa, "3. Dividend  and Capital Gains Distributions Income"), "3 dividends");
        assertEquals(61000, paAmt(pa, "9. Total PA Taxable Income"), "9 = 1c + 3");
        assertEquals(61000, paAmt(pa, "11. Adjusted PA Taxable Income"), "11 = 9 - 10");
        assertEquals(SSN_DIGITS, paText(pa, "Enter SSN shown first without dashes or spaces"), "SSN");
        Map<String, String> pa2 = pkg.fields("PA40", 0, 1);
        long paTax = pct(61000, "0.0307");
        assertEquals(paTax, paAmt(pa2, "12. PA Tax Liability. Multiply Line 11 by 3.07%"), "12 = 11 x 3.07%");
        assertEquals(1842, paAmt(pa2, "13. Total PA Tax Withheld"), "13 = W-2 box 17");
        assertEquals(1842, paAmt(pa2, "24. Total Payments and Credits"), "24 = 13 + ... (only 13)");
        assertEquals(paTax - 1842, paAmt(pa2, "26. TAX DUE"), "26 = 12 - 24");
    }

    @Test
    void paTaxForgivenessPackage() throws Exception {
        Pkg pkg = render(paTaxForgiveness(), "e2e-ty2026-pa-forgiveness.pdf");
        pkg.assertForms(Map.of("IRS1040", 1, "IRSW2", 1, "PA40", 1, "PA40SP", 1));

        Map<String, String> f1040 = pkg.fields("IRS1040", 0);
        assertEquals(15000, amt(f1040, "Page1[0].f1_75[0]"), "11a = W-2 box 1");
        assertEquals("Kiddo", text(f1040, "Row1[0].f1_31[0]"), "dependent 1");
        assertEquals("900000011", text(f1040, "Row3[0].f1_39[0]"), "dependent 1 SSN");

        Map<String, String> pa2 = pkg.fields("PA40", 0, 1);
        Map<String, String> sp1 = pkg.fields("PA40SP", 0, 0);
        Map<String, String> sp2 = pkg.fields("PA40SP", 0, 1);
        long paTax = pct(15000, "0.0307"); // 72 P.S. 7302(a); PA-40 IN (2025) p. 21, LINE 12
        assertEquals(paTax, paAmt(pa2, "12. PA Tax Liability. Multiply Line 11 by 3.07%"), "12 = 11 x 3.07%");
        assertEquals(15000, paAmt(pa2, "20. Total Eligibility Income"), "20 = SP line 11");
        assertEquals("2", paText(pa2, "Dependents"), "19b dependents");
        assertEquals("2", paText(sp1, "Enter the total number of dependents listed on Line 1"), "SP Section II line 2");
        assertEquals("900000011", paText(sp1, "1i. – Enter the dependent’s Social Security number"), "SP dependent 1");
        assertEquals(15000, paAmt(sp2, PaPit40ScheduleSpTy2026PdfSmokeTest.SP_LINE1), "SP 1 = PA-40 line 9");
        // PA-40 IN (2025) p. 39 eligibility income table: unmarried, two dependents, 100% forgiveness up to
        // $6,500 + 2 x $9,500 = $25,500; line 11 is $15,000.
        assertEquals("1.0", paText(sp2, PaPit40ScheduleSpTy2026PdfSmokeTest.SP_LINE15), "SP 15");
        long sp16 = paAmt(sp2, PaPit40ScheduleSpTy2026PdfSmokeTest.SP_LINE16);
        assertEquals(paTax, sp16, "SP 16 = 14 x 15 (14 = PA-40 line 12 - 13, no other credits)");
        assertEquals(sp16, paAmt(pa2, "21. Tax Forgiveness Credit"), "PA-40 21 = SP 16");
        assertEquals(500 + sp16, paAmt(pa2, "24. Total Payments and Credits"), "24 = 13 + 21");
        assertEquals(500 + sp16 - paTax, paAmt(pa2, "29. OVERPAYMENT"), "29 = 24 - 12");
    }

    // ---------------------------------------------------------------- rendering

    /** One rendered package: form name -> instances, each the list of 0-based output page indexes. */
    static final class Pkg {
        final PDDocument doc;
        final Map<String, List<List<Integer>>> forms = new LinkedHashMap<>();

        Pkg(PDDocument doc) {
            this.doc = doc;
        }

        void assertForms(Map<String, Integer> expectedInstances) throws Exception {
            Map<String, Integer> actual = new TreeMap<>();
            forms.forEach((name, instances) -> actual.put(name, instances.size()));
            assertEquals(new TreeMap<>(expectedInstances), actual, "forms (and copies) in the package");
            for (var e : forms.entrySet()) {
                String name = e.getKey();
                ConfiguredPdfProperties t = templates.get(name);
                assertTrue(PAGES.containsKey(name), "page count known for " + name);
                for (List<Integer> pages : e.getValue()) {
                    assertEquals(PAGES.get(name), pages.size(), name + " page count");
                    Map<String, String> all = widgetValues(doc, new HashSet<>(pages));
                    assertFalse(all.isEmpty(), name + " has filled fields");
                    assertTrue(
                            all.values().stream()
                                    .anyMatch(v -> v.contains(SSN_DASHED)
                                            || v.replace(" ", "").contains(SSN_DIGITS)),
                            name + " shows the filer's SSN");
                    assertTrue(
                            all.values().stream().anyMatch(v -> v.toUpperCase().contains(LAST_NAME.toUpperCase())),
                            name + " shows the filer's name");
                }
                assertTemplatePinned(name, t);
            }
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "no draft cover sheet");
            assertFalse(text.contains("DRAFT—NOT FOR FILING"), "no draft cover sheet");
            for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                String v = f.getValueAsString();
                assertFalse(v != null && (v.contains("555-55") || v.contains("55555")), "no fixture SSN left: " + v);
            }
        }

        /** Field values (fully qualified name -> value) on one page of one instance of a form. */
        Map<String, String> fields(String form, int instance, int page) throws Exception {
            return widgetValues(doc, Set.of(forms.get(form).get(instance).get(page)));
        }

        /** Field values on all pages of one instance of a form. */
        Map<String, String> fields(String form, int instance) throws Exception {
            return widgetValues(doc, new HashSet<>(forms.get(form).get(instance)));
        }
    }

    /**
     * Every draft or state template under pdf/2026 that printed is pinned in its SHA-256 manifest, still matches it,
     * and its field map is still marked draft-based or year-based.
     */
    static void assertTemplatePinned(String name, ConfiguredPdfProperties t) throws Exception {
        if (!t.getLocation().startsWith("pdf/2026/")) {
            return; // 2024 templates (Schedule B, W-2) have no 2026 manifest
        }
        String pinned = pinnedSha256.get(t.getLocation());
        assertTrue(pinned != null, name + " template is pinned in a pdf/2026 SHA-256 manifest");
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        sha.update(new ClassPathResource(t.getLocation()).getContentAsByteArray());
        assertEquals(pinned, HexFormat.of().formatHex(sha.digest()), name + " template SHA-256");
        String config = new String(
                new ClassPathResource(t.getConfigurationLocation()).getContentAsByteArray(), StandardCharsets.UTF_8);
        if (t.getLocation().endsWith("--dft.pdf")) {
            assertTrue(config.toLowerCase().contains("draft"), name + " field map is still flagged as draft-based");
        } else {
            assertTrue(config.contains("YEAR-BASED MAPPING"), name + " field map is still flagged as year-based");
        }
    }

    static Pkg render(Map<String, String> scenario, String outName) throws Exception {
        JsonNode root =
                MAPPER.readTree(new ClassPathResource("pdf-smoke/schedule-d-8949-synthetic.json").getInputStream());
        Map<String, FactTypeWithItem> facts =
                MAPPER.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
        for (var e : scenario.entrySet()) {
            facts.put(e.getKey(), MAPPER.readValue(e.getValue(), FactTypeWithItem.class));
        }

        // A golden return must be one the product files: no knockout or other submission-blocking fact is true.
        Graph graph = factGraphService.getGraph(facts);
        List<String> blocking = new ArrayList<>();
        for (TaxFact f : factGraphService.getDigest().getSubmissionBlockingFacts()) {
            var r = graph.get(f.path());
            if (r.hasValue() && Boolean.TRUE.equals(r.get())) {
                blocking.add(f.path());
            }
        }
        assertEquals(List.of(), blocking, "submission-blocking facts");

        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(TAX_YEAR);
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        byte[] bytes;
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
            bytes = in.readAllBytes();
        }
        String out = System.getProperty("pdf.smoke.out");
        if (out != null && outName != null) {
            Files.write(Path.of(out, outName), bytes);
        }

        Pkg pkg = new Pkg(Loader.loadPDF(bytes));
        String current = null;
        int lastIndex = -1;
        for (int i = 0; i < pkg.doc.getNumberOfPages(); i++) {
            String text = pageText(pkg.doc, i);
            assertFalse(
                    text.contains("The draft you are looking for begins on the next page"),
                    "page " + (i + 1) + " is not a draft cover sheet");
            String form = null;
            int index = -1;
            for (var e : blankPageText.entrySet()) {
                int at = e.getValue().indexOf(text);
                if (at >= 0) {
                    assertTrue(form == null, "page " + (i + 1) + " matches one template only");
                    form = e.getKey();
                    index = at;
                }
            }
            assertTrue(form != null, "page " + (i + 1) + " is a page of a configured TY2026 template");
            int skip = leadingPagesSkipped(form);
            assertTrue(index >= skip, form + " page " + (i + 1) + " is not a draft cover sheet");
            if (!form.equals(current) || index <= lastIndex) {
                pkg.forms.computeIfAbsent(form, k -> new ArrayList<>()).add(new ArrayList<>());
            }
            List<List<Integer>> instances = pkg.forms.get(form);
            List<Integer> instance = instances.get(instances.size() - 1);
            assertEquals(skip + instance.size(), index, form + " pages print in order");
            instance.add(i);
            current = form;
            lastIndex = index;
        }
        return pkg;
    }

    static int leadingPagesSkipped(String form) throws Exception {
        String config = new String(
                new ClassPathResource(templates.get(form).getConfigurationLocation()).getContentAsByteArray(),
                StandardCharsets.UTF_8);
        var m = Pattern.compile("skipLeadingPages: \"(\\d+)\"").matcher(config);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    static String pageText(PDDocument doc, int pageIndex) throws Exception {
        PDFTextStripper s = new PDFTextStripper();
        s.setStartPage(pageIndex + 1);
        s.setEndPage(pageIndex + 1);
        return s.getText(doc).replaceAll("\\s+", " ").trim();
    }

    static Map<String, String> widgetValues(PDDocument doc, Set<Integer> pages) {
        Set<COSBase> widgets = new HashSet<>();
        for (int p : pages) {
            try {
                for (PDAnnotation a : doc.getPage(p).getAnnotations()) {
                    if (a instanceof PDAnnotationWidget) {
                        widgets.add(a.getCOSObject());
                    }
                }
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            if (f instanceof PDTerminalField t) {
                for (PDAnnotationWidget w : t.getWidgets()) {
                    if (widgets.contains(w.getCOSObject())) {
                        byName.put(f.getFullyQualifiedName(), f.getValueAsString() == null ? "" : f.getValueAsString());
                    }
                }
            }
        }
        return byName;
    }

    // ---------------------------------------------------------------- field helpers

    /** Value of the one field whose fully qualified name ends with {@code suffix}. */
    static String text(Map<String, String> fields, String suffix) {
        String found = null;
        for (var e : fields.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field suffix is unique on the form: " + suffix);
                found = e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present: " + suffix);
        return found;
    }

    /** Whole-dollar amount of a printed field; fails if the field is blank or has cents. */
    static long amt(Map<String, String> fields, String suffix) {
        String v = text(fields, suffix).replace(",", "");
        assertFalse(v.isEmpty(), suffix + " printed");
        BigDecimal d = new BigDecimal(v);
        assertEquals(0, d.remainder(BigDecimal.ONE).signum(), suffix + " is whole dollars: " + v);
        return d.longValueExact();
    }

    /** PA field by full name (PaPit40ScheduleSpTy2026PdfSmokeTest.field handles merge-renamed parents). */
    static String paText(Map<String, String> fields, String name) {
        return PaPit40ScheduleSpTy2026PdfSmokeTest.field(fields, name);
    }

    static long paAmt(Map<String, String> fields, String name) {
        String v = paText(fields, name).replace(",", "");
        assertFalse(v.isEmpty(), name + " printed");
        BigDecimal d = new BigDecimal(v);
        assertEquals(0, d.remainder(BigDecimal.ONE).signum(), name + " is whole dollars: " + v);
        return d.longValueExact();
    }

    static boolean checked(Map<String, String> fields, String suffix) {
        String v = text(fields, suffix);
        return !v.isEmpty() && !"Off".equals(v);
    }

    /** {@code amount x rate}, rounded half-up to whole dollars. */
    static long pct(long amount, String rate) {
        return BigDecimal.valueOf(amount)
                .multiply(new BigDecimal(rate))
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }
}
