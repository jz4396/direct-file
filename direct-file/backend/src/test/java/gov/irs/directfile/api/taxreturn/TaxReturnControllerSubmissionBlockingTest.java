package gov.irs.directfile.api.taxreturn;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import gov.irs.directfile.api.dataimport.DataImportService;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.pdf.PdfService;
import gov.irs.directfile.api.taxreturn.dto.SignRequestBody;
import gov.irs.directfile.api.taxreturn.dto.SubmitRequestBody;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.domain.UserInfo;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Both the sign and submit endpoints answer a submission-blocking refusal with its 400 and fact paths (#181). */
class TaxReturnControllerSubmissionBlockingTest {
    TaxReturnService taxReturnService;
    TaxReturnController controller;
    UserInfo userInfo = new UserInfo(UUID.randomUUID(), UUID.randomUUID(), "filer@example.com", "900123456");
    UUID id = UUID.randomUUID();
    Map<String, FactTypeWithItem> facts = Map.of();

    @BeforeEach
    void setUp() throws Exception {
        taxReturnService = mock(TaxReturnService.class);
        UserService userService = mock(UserService.class);
        when(userService.getCurrentUserInfo()).thenReturn(userInfo);
        controller = new TaxReturnController(
                taxReturnService,
                userService,
                mock(PdfService.class),
                mock(EncryptionCacheWarmingService.class),
                mock(DataImportService.class));
        when(taxReturnService.submit(eq(id), same(facts), eq(userInfo.id()), eq(userInfo), any(), anyInt(), any()))
                .thenThrow(new SubmissionBlockingFactsResponseStatusException(List.of("/flowIsKnockedOut")));
    }

    void assertRefused(SubmissionBlockingFactsResponseStatusException e) {
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(List.of("/flowIsKnockedOut"), e.getBody().getProperties().get("blockingFacts"));
    }

    @Test
    void submitRefuses() {
        SubmitRequestBody body = new SubmitRequestBody();
        body.setFacts(facts);
        assertRefused(assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> controller.submit(id, body, new MockHttpServletRequest())));
    }

    @Test
    void signRefuses() {
        assertRefused(assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> controller.sign(id, new SignRequestBody(facts, "I agree"), new MockHttpServletRequest())));
    }
}
