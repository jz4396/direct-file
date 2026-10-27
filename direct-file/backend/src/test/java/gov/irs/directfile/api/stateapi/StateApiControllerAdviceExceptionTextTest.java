package gov.irs.directfile.api.stateapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.api.errors.InvalidDataException;
import gov.irs.directfile.api.errors.NonexistentDataException;
import gov.irs.directfile.api.stateapi.domain.CreateAuthorizationCodeResponse;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Authorization-code errors answer with a fixed message. A throw whose message carries an id or taxpayer data must not
 * reach the response body. Each sentinel case asserts the body is non-empty and does not contain the sentinel.
 */
class StateApiControllerAdviceExceptionTextTest {
    static final String SENTINEL = "exception-text-sentinel-8243";

    final ObjectMapper objectMapper = new ObjectMapper();
    final StateApiControllerAdvice advice = new StateApiControllerAdvice();

    void assertFixedError(CreateAuthorizationCodeResponse response, String expected) throws Exception {
        assertEquals(expected, response.getError());
        String json = objectMapper.writeValueAsString(response);
        assertFalse(json.isEmpty(), "expected a response body");
        assertFalse(json.contains(SENTINEL), json);
        assertFalse(response.getError().contains(SENTINEL), response.getError());
    }

    @Test
    void nonexistentDataUsesFixedMessage() throws Exception {
        NonexistentDataException failure = new NonexistentDataException(SENTINEL);
        assertTrue(failure.getMessage().contains(SENTINEL), "control: the exception message carries the sentinel");

        assertFixedError(advice.handleNonExistentData(failure), StateApiController.NO_SUCH_TAX_RETURN_ERROR);
    }

    @Test
    void nonexistentDataWithKnownMessagePlusSentinelStaysFixed() throws Exception {
        NonexistentDataException failure =
                new NonexistentDataException(StateApiController.NO_SUCH_TAX_RETURN_ERROR + " " + SENTINEL);

        assertFixedError(advice.handleNonExistentData(failure), StateApiController.NO_SUCH_TAX_RETURN_ERROR);
    }

    @Test
    void knownNonexistentDataMessageIsPreserved() throws Exception {
        assertFixedError(
                advice.handleNonExistentData(new NonexistentDataException(StateApiController.NO_SUCH_TAX_RETURN_ERROR)),
                StateApiController.NO_SUCH_TAX_RETURN_ERROR);
    }

    @Test
    void invalidDataUsesFixedMessage() throws Exception {
        InvalidDataException failure = new InvalidDataException(SENTINEL);
        assertTrue(failure.getMessage().contains(SENTINEL), "control: the exception message carries the sentinel");

        assertFixedError(advice.handleInvalidData(failure), StateApiControllerAdvice.INVALID_DATA_ERROR);
    }

    @Test
    void invalidDataWithKnownMessagePlusSentinelStaysFixed() throws Exception {
        InvalidDataException failure =
                new InvalidDataException(StateApiController.NO_FILING_STATE_ERROR + " " + SENTINEL);

        assertFixedError(advice.handleInvalidData(failure), StateApiControllerAdvice.INVALID_DATA_ERROR);
    }

    @Test
    void knownFilingStateMessageIsPreserved() throws Exception {
        assertFixedError(
                advice.handleInvalidData(new InvalidDataException(StateApiController.NO_FILING_STATE_ERROR)),
                StateApiController.NO_FILING_STATE_ERROR);
    }

    @Test
    void knownNoSubmissionsMessageIsPreserved() throws Exception {
        assertFixedError(
                advice.handleInvalidData(new InvalidDataException(StateApiController.NO_SUBMISSIONS_ERROR)),
                StateApiController.NO_SUBMISSIONS_ERROR);
    }
}
