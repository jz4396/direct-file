package gov.irs.directfile.api.taxreturn;

import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.config.StatusEndpointProperties;
import gov.irs.directfile.api.dataimport.gating.DataImportBehavior;
import gov.irs.directfile.api.dataimport.gating.DataImportGatingService;
import gov.irs.directfile.api.dispatch.DispatchService;
import gov.irs.directfile.api.errors.InvalidDataException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.api.taxreturn.submissions.SendEmailQueueService;
import gov.irs.directfile.api.taxreturn.submissions.lock.AdvisoryLockRepository;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.models.User;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Only tax years listed in taxYears/registry.json can be started. TY2025 has no parameter file and
 * no PDF templates, so creating a TY2025 return is refused before any fact or PDF work; TY2026 is
 * unaffected.
 */
class TaxReturnServiceTaxYearTest {
    private TaxReturnRepository taxReturnRepo;
    private UserService userService;
    private FactGraphService factGraphService;
    private DataImportGatingService dataImportGatingService;
    private TaxReturnService service;

    @BeforeEach
    void setUp() {
        taxReturnRepo = mock(TaxReturnRepository.class);
        userService = mock(UserService.class);
        factGraphService = mock(FactGraphService.class);
        dataImportGatingService = mock(DataImportGatingService.class);
        RestClient.Builder restClientBuilder = mock(RestClient.Builder.class, RETURNS_SELF);
        service = new TaxReturnService(
                mock(AuditService.class),
                taxReturnRepo,
                mock(TaxReturnSubmissionRepository.class),
                userService,
                mock(DispatchService.class),
                factGraphService,
                restClientBuilder,
                mock(StatusEndpointProperties.class),
                mock(SendEmailQueueService.class),
                mock(SubmissionEventRepository.class),
                Clock.systemUTC(),
                mock(AdvisoryLockRepository.class),
                mock(StatusResponseBodyCacheService.class),
                dataImportGatingService);
    }

    private TaxReturn create(int taxYear) throws Exception {
        Map<String, FactTypeWithItem> facts = new HashMap<>();
        return service.create(
                taxYear, facts, UUID.randomUUID(), "filer@example.com", "123456789", "127.0.0.1", 443, "test");
    }

    @Test
    void registryListsOnlyTy2026() {
        assertEquals(Set.of(2026), SupportedTaxYears.years());
        assertTrue(SupportedTaxYears.isSupported(2026));
        assertFalse(SupportedTaxYears.isSupported(2025));
    }

    @ParameterizedTest
    @ValueSource(ints = {2025, 2024, 2027})
    void unsupportedTaxYearCannotBeStarted(int taxYear) {
        InvalidDataException e = assertThrows(InvalidDataException.class, () -> create(taxYear));
        assertTrue(e.getMessage().contains("Tax year " + taxYear + " is not supported"), e.getMessage());
        verifyNoInteractions(taxReturnRepo, userService, factGraphService, dataImportGatingService);
    }

    @Test
    void ty2026IsUnaffected() throws Exception {
        when(taxReturnRepo.findByUserIdAndTaxYear(any(), eq(2026))).thenReturn(Optional.empty());
        when(userService.getOrCreateUserDev()).thenReturn(Optional.of(new User(UUID.randomUUID())));
        when(factGraphService.factsParseCorrectly(anyMap())).thenReturn(true);
        when(dataImportGatingService.getBehavior(anyString()))
                .thenReturn(List.of(DataImportBehavior.values()).get(0));
        when(taxReturnRepo.save(any(TaxReturn.class))).thenAnswer(invocation -> {
            TaxReturn saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());
            return saved;
        });

        TaxReturn created = create(2026);

        assertEquals(2026, created.getTaxYear());
        verify(taxReturnRepo).save(any(TaxReturn.class));
    }
}
