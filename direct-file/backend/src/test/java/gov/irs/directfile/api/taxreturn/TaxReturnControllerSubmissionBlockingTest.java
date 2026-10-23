package gov.irs.directfile.api.taxreturn;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.TextNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.dataimport.DataImportService;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.errors.TaxReturnNotFoundResponseStatusException;
import gov.irs.directfile.api.errors.ValidationExceptionHandlers;
import gov.irs.directfile.api.pdf.PdfService;
import gov.irs.directfile.api.taxreturn.TaxReturnApi.GenericResponseBadData;
import gov.irs.directfile.api.taxreturn.TaxReturnApi.SignResponseFailed;
import gov.irs.directfile.api.taxreturn.dto.SignRequestBody;
import gov.irs.directfile.api.taxreturn.dto.SubmitRequestBody;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.domain.UserInfo;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Both the sign and submit endpoints answer a submission-blocking refusal with its 400 and fact paths (#181), and
 * submit wraps any other failure in the generic bad-data status while sign answers it with a fixed 500. No response
 * body or log line echoes the underlying exception text or any fact value.
 */
class TaxReturnControllerSubmissionBlockingTest {
    static final String FACT_VALUE = "fact-value-sentinel-4417";
    static final String CAUSE_TEXT = "internal-cause-sentinel-9023";

    TaxReturnService taxReturnService;
    TaxReturnController controller;
    ValidationExceptionHandlers handlers = new ValidationExceptionHandlers(mock(AuditService.class));
    ObjectMapper objectMapper = new ObjectMapper();
    UserInfo userInfo = new UserInfo(UUID.randomUUID(), UUID.randomUUID(), "filer@example.com", "900123456");
    UUID id = UUID.randomUUID();
    Map<String, FactTypeWithItem> facts = Map.of(
            "/filers/#00000000-0000-0000-0000-000000000001/firstName",
            new FactTypeWithItem("gov.irs.factgraph.persisters.StringWrapper", TextNode.valueOf(FACT_VALUE)));

    final List<Logger> capturedLoggers = List.of((Logger) LoggerFactory.getLogger(TaxReturnController.class), (Logger)
            LoggerFactory.getLogger(ValidationExceptionHandlers.class));
    final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();

    @BeforeEach
    void setUp() {
        logAppender.start();
        capturedLoggers.forEach(logger -> logger.addAppender(logAppender));
        taxReturnService = mock(TaxReturnService.class);
        UserService userService = mock(UserService.class);
        when(userService.getCurrentUserInfo()).thenReturn(userInfo);
        controller = new TaxReturnController(
                taxReturnService,
                userService,
                mock(PdfService.class),
                mock(EncryptionCacheWarmingService.class),
                mock(DataImportService.class));
    }

    @AfterEach
    void tearDown() {
        capturedLoggers.forEach(logger -> logger.detachAppender(logAppender));
        logAppender.stop();
    }

    /** Asserts that no captured log line, argument or attached stack trace carries a sentinel string. */
    void assertLogsCarryNoSentinel() {
        for (ILoggingEvent event : logAppender.list) {
            StringBuilder text = new StringBuilder(event.getFormattedMessage());
            for (IThrowableProxy proxy = event.getThrowableProxy(); proxy != null; proxy = proxy.getCause()) {
                text.append(' ').append(proxy.getMessage());
            }
            assertFalse(text.toString().contains(FACT_VALUE), text.toString());
            assertFalse(text.toString().contains(CAUSE_TEXT), text.toString());
        }
    }

    void serviceThrows(Exception e) throws Exception {
        when(taxReturnService.submit(eq(id), same(facts), eq(userInfo.id()), eq(userInfo), any(), anyInt(), any()))
                .thenThrow(e);
    }

    void serviceRefuses() throws Exception {
        serviceThrows(new SubmissionBlockingFactsResponseStatusException(List.of("/flowIsKnockedOut")));
    }

    SubmitRequestBody submitBody() {
        SubmitRequestBody body = new SubmitRequestBody();
        body.setFacts(facts);
        return body;
    }

    /** Renders the exception the way the controller advice does and returns the JSON response body. */
    String responseBody(ResponseStatusException e, HttpStatus expectedStatus) throws Exception {
        ResponseEntity<ProblemDetail> response = handlers.handleResponseStatusException(e, null);
        assertEquals(expectedStatus, response.getStatusCode());
        String json = objectMapper.writeValueAsString(response.getBody());
        assertFalse(json.contains(FACT_VALUE), json);
        assertFalse(json.contains(CAUSE_TEXT), json);
        return json;
    }

    void assertRefused(SubmissionBlockingFactsResponseStatusException e) throws Exception {
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(List.of("/flowIsKnockedOut"), e.getBody().getProperties().get("blockingFacts"));
        String json = responseBody(e, HttpStatus.BAD_REQUEST);
        assertTrue(json.contains("\"blockingFacts\":[\"/flowIsKnockedOut\"]"), json);
    }

    @Test
    void submitRefuses() throws Exception {
        serviceRefuses();
        assertRefused(assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> controller.submit(id, submitBody(), new MockHttpServletRequest())));
    }

    @Test
    void signRefuses() throws Exception {
        serviceRefuses();
        assertRefused(assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> controller.sign(id, new SignRequestBody(facts, "I agree"), new MockHttpServletRequest())));
    }

    @Test
    void submitWrapsAnyOtherFailureInGenericBadData() throws Exception {
        serviceThrows(new IllegalStateException(CAUSE_TEXT + " " + FACT_VALUE));
        ResponseStatusException e = assertThrows(
                ResponseStatusException.class, () -> controller.submit(id, submitBody(), new MockHttpServletRequest()));
        assertFalse(e instanceof SubmissionBlockingFactsResponseStatusException);
        assertEquals(GenericResponseBadData.code, e.getStatusCode());
        assertEquals(GenericResponseBadData.description, e.getReason());
        assertInstanceOf(IllegalStateException.class, e.getCause());
        String json = responseBody(e, HttpStatus.valueOf(GenericResponseBadData.code.value()));
        assertFalse(json.contains("blockingFacts"), json);
    }

    @Test
    void signAnswersAnyOtherFailureWithFixed500() throws Exception {
        serviceThrows(new IllegalStateException(CAUSE_TEXT + " " + FACT_VALUE));
        ResponseStatusException e = assertThrows(
                ResponseStatusException.class,
                () -> controller.sign(id, new SignRequestBody(facts, "I agree"), new MockHttpServletRequest()));
        assertFalse(e instanceof SubmissionBlockingFactsResponseStatusException);
        assertEquals(SignResponseFailed.code, e.getStatusCode());
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(), e.getStatusCode().value());
        assertEquals(SignResponseFailed.description, e.getReason());
        String json = responseBody(e, HttpStatus.INTERNAL_SERVER_ERROR);
        assertFalse(json.contains("blockingFacts"), json);
        assertTrue(json.contains(SignResponseFailed.description), json);
        assertFalse(logAppender.list.isEmpty());
        assertTrue(logAppender.list.stream()
                .anyMatch(event -> event.getFormattedMessage().contains(IllegalStateException.class.getName())));
        assertLogsCarryNoSentinel();
    }

    @Test
    void signPassesOtherResponseStatusFailuresThrough() throws Exception {
        TaxReturnNotFoundResponseStatusException notFound = new TaxReturnNotFoundResponseStatusException();
        serviceThrows(notFound);
        assertSame(
                notFound,
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.sign(
                                id, new SignRequestBody(facts, "I agree"), new MockHttpServletRequest())));
    }

    @Test
    void unhandledExceptionAnswersWithFixedBody() throws Exception {
        ValidationExceptionHandlers.ErrorResponse response =
                handlers.handleUnhandledException(new IllegalStateException(CAUSE_TEXT + " " + FACT_VALUE), null);
        String json = objectMapper.writeValueAsString(response);
        assertEquals(ValidationExceptionHandlers.UNHANDLED_ERROR_MESSAGE, response.message());
        assertTrue(response.errors().isEmpty());
        assertFalse(json.contains(FACT_VALUE), json);
        assertFalse(json.contains(CAUSE_TEXT), json);
        assertFalse(json.contains(IllegalStateException.class.getSimpleName()), json);
        assertLogsCarryNoSentinel();
    }
}
