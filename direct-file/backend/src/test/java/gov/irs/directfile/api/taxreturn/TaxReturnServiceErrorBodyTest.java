package gov.irs.directfile.api.taxreturn;

import java.time.Clock;
import java.util.HashMap;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.config.StatusEndpointProperties;
import gov.irs.directfile.api.dataimport.gating.DataImportGatingService;
import gov.irs.directfile.api.dispatch.DispatchService;
import gov.irs.directfile.api.errors.ApiResponseStatusException;
import gov.irs.directfile.api.errors.FactGraphParseResponseStatusException;
import gov.irs.directfile.api.errors.TaxReturnNotFoundResponseStatusException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.TaxReturnApi.FactsFailedToParseCorrectly;
import gov.irs.directfile.api.taxreturn.TaxReturnApi.GenericResponseBadId;
import gov.irs.directfile.api.taxreturn.submissions.SendEmailQueueService;
import gov.irs.directfile.api.taxreturn.submissions.lock.AdvisoryLockRepository;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.models.User;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * The fact-graph parse error on create and the not-found error on update answer with a fixed message. The user id and
 * the tax return id may go to the server log, but never into the response body.
 */
class TaxReturnServiceErrorBodyTest {
    static final UUID SENTINEL_ID = UUID.fromString("7351aaaa-0000-4000-8000-00000000a230");

    final ObjectMapper objectMapper = new ObjectMapper();
    TaxReturnRepository taxReturnRepo;
    UserService userService;
    FactGraphService factGraphService;
    TaxReturnService service;

    @BeforeEach
    void setUp() {
        taxReturnRepo = mock(TaxReturnRepository.class);
        userService = mock(UserService.class);
        factGraphService = mock(FactGraphService.class);
        service = new TaxReturnService(
                mock(AuditService.class),
                taxReturnRepo,
                mock(TaxReturnSubmissionRepository.class),
                userService,
                mock(DispatchService.class),
                factGraphService,
                mock(RestClient.Builder.class, RETURNS_SELF),
                mock(StatusEndpointProperties.class),
                mock(SendEmailQueueService.class),
                mock(SubmissionEventRepository.class),
                Clock.systemUTC(),
                mock(AdvisoryLockRepository.class),
                mock(StatusResponseBodyCacheService.class),
                mock(DataImportGatingService.class));
    }

    void assertBodyCarriesNoId(ApiResponseStatusException e, String expectedDetail) throws Exception {
        assertEquals(expectedDetail, e.getBody().getDetail());
        assertEquals(expectedDetail, e.getReason());
        String json = objectMapper.writeValueAsString(e.getBody());
        assertFalse(json.isEmpty());
        for (String text : new String[] {json, e.getMessage(), e.getReason()}) {
            assertFalse(text.contains(SENTINEL_ID.toString()), text);
        }
    }

    @Test
    void factParseErrorOnCreateHasNoUserId() throws Exception {
        when(taxReturnRepo.findByUserIdAndTaxYear(any(), eq(2026))).thenReturn(Optional.empty());
        when(userService.getOrCreateUserDev()).thenReturn(Optional.of(new User(SENTINEL_ID)));
        when(factGraphService.factsParseCorrectly(anyMap())).thenReturn(false);

        FactGraphParseResponseStatusException e = assertThrows(
                FactGraphParseResponseStatusException.class,
                () -> service.create(
                        2026,
                        new HashMap<>(),
                        SENTINEL_ID,
                        "filer@example.com",
                        "444001234",
                        "127.0.0.1",
                        443,
                        "test"));

        assertBodyCarriesNoId(e, FactsFailedToParseCorrectly.description);
    }

    @Test
    void notFoundOnUpdateHasNoTaxReturnId() throws Exception {
        when(taxReturnRepo.findByIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(userService.getOrCreateUserDev()).thenReturn(Optional.of(new User(SENTINEL_ID)));

        TaxReturnNotFoundResponseStatusException e = assertThrows(
                TaxReturnNotFoundResponseStatusException.class,
                () -> service.update(SENTINEL_ID, new HashMap<>(), "store", false, SENTINEL_ID));

        assertBodyCarriesNoId(e, GenericResponseBadId.description);
    }
}
