package gov.irs.directfile.api.taxreturn;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.TextNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.dataimport.DataImportService;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.errors.ValidationExceptionHandlers;
import gov.irs.directfile.api.pdf.PdfRefusedByKnockoutException;
import gov.irs.directfile.api.pdf.PdfService;
import gov.irs.directfile.api.taxreturn.TaxReturnApi.GenericResponseBadData;
import gov.irs.directfile.api.taxreturn.dto.SignRequestBody;
import gov.irs.directfile.api.taxreturn.dto.SubmitRequestBody;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.domain.UserInfo;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Both the sign and submit endpoints answer a submission-blocking refusal with its 400 and fact paths (#181), and
 * submit wraps any other failure in the generic bad-data status. Neither response body echoes the underlying
 * exception text or any fact value.
 */
class TaxReturnControllerSubmissionBlockingTest {
    static final String FACT_VALUE = "fact-value-sentinel-4417";
    static final String CAUSE_TEXT = "internal-cause-sentinel-9023";

    TaxReturnService taxReturnService;
    PdfService pdfService;
    TaxReturnController controller;
    ValidationExceptionHandlers handlers = new ValidationExceptionHandlers(mock(AuditService.class));
    ObjectMapper objectMapper = new ObjectMapper();
    UserInfo userInfo = new UserInfo(UUID.randomUUID(), UUID.randomUUID(), "filer@example.com", "900123456");
    UUID id = UUID.randomUUID();
    Map<String, FactTypeWithItem> facts = Map.of(
            "/filers/#00000000-0000-0000-0000-000000000001/firstName",
            new FactTypeWithItem("gov.irs.factgraph.persisters.StringWrapper", TextNode.valueOf(FACT_VALUE)));

    @BeforeEach
    void setUp() {
        taxReturnService = mock(TaxReturnService.class);
        pdfService = mock(PdfService.class);
        UserService userService = mock(UserService.class);
        when(userService.getCurrentUserInfo()).thenReturn(userInfo);
        controller = new TaxReturnController(
                taxReturnService,
                userService,
                pdfService,
                mock(EncryptionCacheWarmingService.class),
                mock(DataImportService.class));
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
    void pdfRefusedByKnockoutAnswersWithTheKnockoutPath() throws Exception {
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        when(taxReturnService.findByIdAndUserId(id, userInfo.id())).thenReturn(Optional.of(taxReturn));
        when(pdfService.getTaxReturn(eq("en"), same(taxReturn), eq(false)))
                .thenThrow(new PdfRefusedByKnockoutException(List.of("/flowKnockoutScheduleEicWithoutTy2026Template")));
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> controller.pdf(id, "en"));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(
                List.of("/flowKnockoutScheduleEicWithoutTy2026Template"),
                e.getBody().getProperties().get("blockingFacts"));
        responseBody(e, HttpStatus.BAD_REQUEST);
    }

    @Test
    void pdfRefusedByKnockoutListsEveryRefusingPath() throws Exception {
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        when(taxReturnService.findByIdAndUserId(id, userInfo.id())).thenReturn(Optional.of(taxReturn));
        List<String> paths = List.of("/flowKnockoutScheduleEicWithoutTy2026Template", "/flowKnockoutOther");
        when(pdfService.getTaxReturn(eq("es"), same(taxReturn), eq(false)))
                .thenThrow(new PdfRefusedByKnockoutException(paths));
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> controller.pdf(id, "es"));
        assertEquals(paths, e.getBody().getProperties().get("blockingFacts"));
        responseBody(e, HttpStatus.BAD_REQUEST);
    }
}
