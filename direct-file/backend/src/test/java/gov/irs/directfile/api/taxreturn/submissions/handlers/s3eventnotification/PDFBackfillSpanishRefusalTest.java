package gov.irs.directfile.api.taxreturn.submissions.handlers.s3eventnotification;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.io.documentstore.S3StorageService;
import gov.irs.directfile.api.io.storagelocations.StorageLocationBuilder;
import gov.irs.directfile.api.pdf.PdfService;
import gov.irs.directfile.api.taxreturn.TaxReturnRepository;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.api.taxreturn.submissions.handlers.s3eventnotification.pdfBackfill.PDFBackfillToS3Handler;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 26 U.S.C. 6011(a): a refused Spanish document does not stop the English document already stored for the same return.
 */
@ExtendWith(MockitoExtension.class)
class PDFBackfillSpanishRefusalTest {
    @Mock
    TaxReturnRepository taxReturnRepository;

    @Mock
    PdfService pdfService;

    @Mock
    S3StorageService s3StorageService;

    @Test
    void spanishRefusalDoesNotStopTheEnglishDocument() throws Exception {
        TaxReturn taxReturn = TaxReturn.testObjectFactory();
        taxReturn.setTaxYear(2026);
        when(taxReturnRepository.findAllByTaxReturnIds(any())).thenReturn(List.of(taxReturn));
        when(pdfService.getTaxReturn(eq("en"), eq(taxReturn), eq(false)))
                .thenReturn(new ByteArrayInputStream("english-pdf".getBytes(StandardCharsets.US_ASCII)));
        when(pdfService.getTaxReturn(eq("es"), eq(taxReturn), eq(false)))
                .thenThrow(
                        new SubmissionBlockingFactsResponseStatusException(List.of("pdf/2024/IRS1040/es/f1040sp.pdf")));

        PDFBackfillToS3Handler handler = new PDFBackfillToS3Handler(taxReturnRepository, pdfService, s3StorageService);
        Logger logger = (Logger) LoggerFactory.getLogger(PDFBackfillToS3Handler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            handler.generatePDFsFromTaxReturnIdList(List.of(taxReturn.getId()));
        } finally {
            logger.detachAppender(appender);
            handler.teardown();
        }

        String englishLocation =
                StorageLocationBuilder.getTaxReturnDocumentLocation(2026, taxReturn.getId(), "taxreturn", "en");
        String spanishLocation =
                StorageLocationBuilder.getTaxReturnDocumentLocation(2026, taxReturn.getId(), "taxreturn", "es");
        verify(s3StorageService).write(eq(englishLocation), any(InputStream.class), isNull());
        verify(s3StorageService, never()).write(eq(spanishLocation), any(InputStream.class), isNull());
        assertTrue(appender.list.stream().allMatch(event -> event.getThrowableProxy() == null));
        assertTrue(appender.list.stream()
                .noneMatch(event -> event.getFormattedMessage().contains("f1040sp")));
    }
}
