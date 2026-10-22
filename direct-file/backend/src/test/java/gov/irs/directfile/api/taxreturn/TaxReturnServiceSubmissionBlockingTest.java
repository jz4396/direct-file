package gov.irs.directfile.api.taxreturn;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;

import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.config.StatusEndpointProperties;
import gov.irs.directfile.api.dataimport.gating.DataImportGatingService;
import gov.irs.directfile.api.dispatch.DispatchService;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.api.taxreturn.submissions.SendEmailQueueService;
import gov.irs.directfile.api.taxreturn.submissions.lock.AdvisoryLockRepository;
import gov.irs.directfile.api.user.UserService;
import gov.irs.directfile.api.user.domain.UserInfo;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest.fact;
import static gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest.golden;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Sign and submit (both call {@link TaxReturnService#submit}) and the resubmission path
 * ({@link TaxReturnService#updateTaxReturnForSubmission}) refuse a return with a submission-blocking fact before
 * anything is saved or enqueued, using the real fact dictionary (#181).
 */
class TaxReturnServiceSubmissionBlockingTest {
    static FactGraphService factGraphService;

    TaxReturnRepository taxReturnRepo;
    TaxReturnSubmissionRepository taxReturnSubmissionRepo;
    DispatchService dispatchService;
    SendEmailQueueService sendEmailQueueService;
    TaxReturnService service;
    TaxReturn taxReturn;
    UserInfo userInfo;

    @BeforeAll
    static void load() throws Exception {
        factGraphService = SubmissionBlockingFactsTest.newService("classpath:/tax/*.xml");
    }

    @BeforeEach
    void setUp() {
        taxReturnRepo = mock(TaxReturnRepository.class);
        taxReturnSubmissionRepo = mock(TaxReturnSubmissionRepository.class);
        dispatchService = mock(DispatchService.class);
        sendEmailQueueService = mock(SendEmailQueueService.class);
        AdvisoryLockRepository lockRepo = mock(AdvisoryLockRepository.class);
        when(lockRepo.acquireLock(anyInt())).thenReturn(true);
        service = new TaxReturnService(
                mock(AuditService.class),
                taxReturnRepo,
                taxReturnSubmissionRepo,
                mock(UserService.class),
                dispatchService,
                factGraphService,
                mock(RestClient.Builder.class, RETURNS_SELF),
                mock(StatusEndpointProperties.class),
                sendEmailQueueService,
                mock(SubmissionEventRepository.class),
                Clock.systemUTC(),
                lockRepo,
                mock(StatusResponseBodyCacheService.class),
                mock(DataImportGatingService.class));

        taxReturn = TaxReturn.testObjectFactory();
        userInfo = new UserInfo(UUID.randomUUID(), UUID.randomUUID(), "filer@example.com", "900123456");
        when(taxReturnRepo.findByIdAndUserId(taxReturn.getId(), userInfo.id())).thenReturn(Optional.of(taxReturn));
        when(taxReturnSubmissionRepo.isTaxReturnEditable(taxReturn.getId())).thenReturn(Optional.empty());
        when(taxReturnRepo.save(any(TaxReturn.class))).thenAnswer(i -> i.getArgument(0));
    }

    TaxReturn submit(Map<String, FactTypeWithItem> facts) throws Exception {
        return service.submit(taxReturn.getId(), facts, userInfo.id(), userInfo, "127.0.0.1", 443, "test");
    }

    @Test
    void goldenReturnIsSavedAndEnqueued() throws Exception {
        assertSame(taxReturn, submit(golden()));
        verify(taxReturnRepo).save(taxReturn);
        verify(dispatchService).enqueue(eq(userInfo.id()), eq(taxReturn), any());
        verify(sendEmailQueueService).enqueue(anyMap());
    }

    @Test
    void unfinishedReturnIsRefusedBeforeSaveOrEnqueue() throws Exception {
        Map<String, FactTypeWithItem> facts = golden();
        facts.put("/formW2sIsDone", fact("{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}"));
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> submit(facts));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(List.of("/flowIncomplete"), e.getBody().getProperties().get("blockingFacts"));
        assertNothingSavedOrEnqueued();
    }

    @Test
    void knockedOutReturnIsRefusedBeforeSaveOrEnqueue() throws Exception {
        Map<String, FactTypeWithItem> facts = golden();
        facts.put(
                "/formW2s/#13500000-0000-4000-8000-000000000501/writableStateWithholding",
                fact("{\"$type\":\"gov.irs.factgraph.persisters.DollarWrapper\",\"item\":\"100.00\"}"));
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> submit(facts));
        @SuppressWarnings("unchecked")
        List<String> blocking = (List<String>) e.getBody().getProperties().get("blockingFacts");
        assertTrue(blocking.containsAll(List.of("/flowIsKnockedOut", "/flowKnockoutFloridaStateWithholding")));
        // Paths only: no fact values in the response.
        assertFalse(e.getMessage().contains("100"), e.getMessage());
        assertNothingSavedOrEnqueued();
    }

    @Test
    void returnWithoutAnyAnswersIsRefused() {
        assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> submit(new java.util.HashMap<>()));
        assertNothingSavedOrEnqueued();
    }

    @Test
    void resubmissionPathRefusesBeforeSave() throws Exception {
        Map<String, FactTypeWithItem> facts = golden();
        facts.put("/formW2sIsDone", fact("{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":false}"));
        assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> service.updateTaxReturnForSubmission(
                        taxReturn, facts, factGraphService.getGraph(facts), userInfo.id(), "127.0.0.1", 443, "test"));
        assertNothingSavedOrEnqueued();

        Map<String, FactTypeWithItem> ok = golden();
        assertNotNull(service.updateTaxReturnForSubmission(
                taxReturn, ok, factGraphService.getGraph(ok), userInfo.id(), "127.0.0.1", 443, "test"));
        verify(taxReturnRepo).save(taxReturn);
    }

    void assertNothingSavedOrEnqueued() {
        verify(taxReturnRepo, never()).save(any());
        verify(taxReturnSubmissionRepo, never()).save(any());
        verifyNoInteractions(dispatchService, sendEmailQueueService);
    }
}
