package gov.irs.directfile.api.stateapi;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.audit.AuditEventContextHolder;
import gov.irs.directfile.api.config.StateApiEndpointProperties;
import gov.irs.directfile.api.config.StateApiFeatureFlagProperties;
import gov.irs.directfile.api.loaders.errors.FactGraphSaveException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.stateapi.domain.CreateAuthorizationCodeRequest;
import gov.irs.directfile.api.taxreturn.InternalTaxReturnStatusService;
import gov.irs.directfile.api.taxreturn.TaxReturnService;
import gov.irs.directfile.api.taxreturn.TaxReturnSubmissionRepository;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.api.taxreturn.models.TaxReturnSubmission;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.domain.UserInfo;
import gov.irs.directfile.models.StateOrProvince;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * State API failures log the exception class only and answer with a fixed reason. Each test plants a sentinel in the
 * exception message, asserts it is absent from a non-empty log capture and from the reason, message and body detail of
 * the thrown exception, and asserts the class is logged.
 */
class StateApiControllerExceptionTextTest {
    static final String SENTINEL = "exception-text-sentinel-7353";

    final Logger controllerLogger = (Logger) LoggerFactory.getLogger(StateApiController.class);
    final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();

    UserService userService;
    TaxReturnService taxReturnService;
    StateApiService stateApiService;
    StateApiEndpointProperties endpointProperties;
    TaxReturnSubmissionRepository submissionRepository;
    FactGraphService factGraphService;
    StateApiController controller;

    @BeforeEach
    void setUp() {
        logAppender.start();
        controllerLogger.addAppender(logAppender);
        userService = mock(UserService.class);
        taxReturnService = mock(TaxReturnService.class);
        stateApiService = mock(StateApiService.class);
        endpointProperties = mock(StateApiEndpointProperties.class);
        submissionRepository = mock(TaxReturnSubmissionRepository.class);
        factGraphService = mock(FactGraphService.class);
        controller = new StateApiController(
                userService,
                taxReturnService,
                stateApiService,
                mock(InternalTaxReturnStatusService.class),
                endpointProperties,
                mock(StateApiFeatureFlagProperties.class),
                submissionRepository,
                factGraphService,
                mock(AuditEventContextHolder.class));
    }

    @AfterEach
    void tearDown() {
        controllerLogger.detachAppender(logAppender);
        logAppender.stop();
    }

    void assertLogsCarryNoSentinel(String expectedClassName) {
        assertFalse(logAppender.list.isEmpty(), "expected at least one captured log line");
        boolean classLogged = false;
        for (ILoggingEvent event : logAppender.list) {
            StringBuilder text = new StringBuilder(event.getFormattedMessage());
            for (IThrowableProxy proxy = event.getThrowableProxy(); proxy != null; proxy = proxy.getCause()) {
                text.append(' ').append(proxy.getMessage());
            }
            assertFalse(text.toString().contains(SENTINEL), text.toString());
            classLogged |= text.toString().contains(expectedClassName);
        }
        assertTrue(classLogged, "expected the exception class in a captured log line");
    }

    @Test
    void authorizationCodeFailureLogsClassOnly() {
        UUID taxReturnId = UUID.randomUUID();
        TaxReturn taxReturn = mock(TaxReturn.class);
        when(taxReturn.getId()).thenReturn(taxReturnId);
        when(userService.getCurrentUserInfo())
                .thenReturn(new UserInfo(UUID.randomUUID(), UUID.randomUUID(), "filer@example.com", "444001234"));
        when(taxReturnService.findByIdAndUserId(eq(taxReturnId), any())).thenReturn(Optional.of(taxReturn));
        when(taxReturnService.getFilingStateOrProvince(taxReturn)).thenReturn(Optional.of(StateOrProvince.AZ));
        when(submissionRepository.findLatestTaxReturnSubmissionByTaxReturnId(taxReturnId))
                .thenReturn(Optional.of(mock(TaxReturnSubmission.class)));
        when(endpointProperties.getVersion()).thenReturn("1");
        WebClientResponseException failure = WebClientResponseException.create(
                500, SENTINEL, HttpHeaders.EMPTY, SENTINEL.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
        assertTrue(failure.getMessage().contains(SENTINEL), "control: the exception message carries the sentinel");
        when(stateApiService.getAuthorizationCode(any())).thenThrow(failure);

        assertThrows(
                WebClientResponseException.class,
                () -> controller.createAuthorizationCode(new CreateAuthorizationCodeRequest(taxReturnId, 2026)));

        assertLogsCarryNoSentinel(WebClientResponseException.class.getName());
    }

    void stubExportedFactsFailure(Exception failure) throws Exception {
        when(submissionRepository.findSubmissionBySubmissionId("sub-1"))
                .thenReturn(Optional.of(mock(TaxReturnSubmission.class)));
        when(factGraphService.getGraph(any())).thenReturn(mock(Graph.class));
        when(stateApiService.getExportToStateFacts(any())).thenThrow(failure);
    }

    void assertFixedReason(ResponseStatusException e) {
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, e.getStatusCode());
        assertEquals(StateApiController.EXPORTED_FACTS_FAILED_REASON, e.getReason());
        assertFalse(e.getMessage().contains(SENTINEL), e.getMessage());
        assertFalse(String.valueOf(e.getBody().getDetail()).contains(SENTINEL));
    }

    @Test
    void exportedFactsEvaluationFailureLogsClassAndUsesFixedReason() throws Exception {
        stubExportedFactsFailure(new FactGraphSaveException(SENTINEL));

        ResponseStatusException e = assertThrows(
                ResponseStatusException.class,
                () -> controller.getStateExportedFacts("sub-1", StateOrProvince.AZ, "acct-1"));

        assertFixedReason(e);
        assertLogsCarryNoSentinel(FactGraphSaveException.class.getName());
    }

    @Test
    void exportedFactsUnexpectedFailureLogsClassAndUsesFixedReason() throws Exception {
        stubExportedFactsFailure(new IllegalStateException(SENTINEL));

        ResponseStatusException e = assertThrows(
                ResponseStatusException.class,
                () -> controller.getStateExportedFacts("sub-1", StateOrProvince.AZ, "acct-1"));

        assertFixedReason(e);
        assertLogsCarryNoSentinel(IllegalStateException.class.getName());
    }
}
