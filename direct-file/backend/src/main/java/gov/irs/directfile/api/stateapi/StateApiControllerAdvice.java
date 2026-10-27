package gov.irs.directfile.api.stateapi;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import gov.irs.directfile.api.errors.InvalidDataException;
import gov.irs.directfile.api.errors.NonexistentDataException;
import gov.irs.directfile.api.stateapi.domain.CreateAuthorizationCodeResponse;
import gov.irs.directfile.dto.AuthCodeResponse;
import gov.irs.directfile.error.StateApiErrorCode;

@RestControllerAdvice(assignableTypes = {StateApiController.class})
@Slf4j
public class StateApiControllerAdvice {

    static final String INVALID_DATA_ERROR = "The tax return data is invalid.";

    @ExceptionHandler(NonexistentDataException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public CreateAuthorizationCodeResponse handleNonExistentData(NonexistentDataException ex) {
        return error(fixedMessage(
                ex.getMessage(),
                StateApiController.NO_SUCH_TAX_RETURN_ERROR,
                StateApiController.NO_SUCH_TAX_RETURN_ERROR));
    }

    @ExceptionHandler(InvalidDataException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public CreateAuthorizationCodeResponse handleInvalidData(InvalidDataException ex) {
        return error(fixedMessage(
                ex.getMessage(),
                INVALID_DATA_ERROR,
                StateApiController.NO_FILING_STATE_ERROR,
                StateApiController.NO_SUBMISSIONS_ERROR));
    }

    /**
     * Returns {@code fallback} unless {@code actual} is exactly one of {@code allowed}. The exception text itself is
     * never copied into the response.
     */
    private static String fixedMessage(String actual, String fallback, String... allowed) {
        if (actual != null) {
            for (String candidate : allowed) {
                if (candidate.equals(actual)) {
                    return candidate;
                }
            }
        }
        return fallback;
    }

    private static CreateAuthorizationCodeResponse error(String message) {
        return CreateAuthorizationCodeResponse.builder().error(message).build();
    }

    @ExceptionHandler(WebClientResponseException.class)
    // status code depends on service response
    // TO DO: Update createAuthorizationCode() (maybe other methods also) in StateApi (the one out of backend) to
    // customize exceptions
    public ResponseEntity<CreateAuthorizationCodeResponse> handleFailedServiceRequest(WebClientResponseException ex) {
        try {
            // See if the response is an AuthCodeResponse
            AuthCodeResponse response = ex.getResponseBodyAs(AuthCodeResponse.class);
            if (response != null && response.getErrorCode() != null) {
                StateApiErrorCode errorCode = response.getErrorCode();
                HttpStatus status = errorCode.getHttpStatus();
                return new ResponseEntity<>(
                        CreateAuthorizationCodeResponse.builder()
                                .error(response.getErrorCode().name())
                                .build(),
                        status);
            }
        } catch (IllegalStateException ignored) {
        }

        return new ResponseEntity<>(
                CreateAuthorizationCodeResponse.builder()
                        .error("Unsuccessful request")
                        .build(),
                ex.getStatusCode());
    }
}
