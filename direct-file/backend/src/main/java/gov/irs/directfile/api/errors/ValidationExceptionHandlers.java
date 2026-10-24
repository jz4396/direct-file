package gov.irs.directfile.api.errors;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;

import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.audit.Auditable;
import gov.irs.directfile.api.events.Event;
import gov.irs.directfile.api.events.EventStatus;
import gov.irs.directfile.api.events.TaxpayerEventPrincipal;
import gov.irs.directfile.api.taxreturn.TaxReturnController;

@RestControllerAdvice(assignableTypes = {TaxReturnController.class})
@Slf4j
@SuppressFBWarnings(value = "RV_RETURN_VALUE_IGNORED", justification = "Initial Spotbugs Setup")
public class ValidationExceptionHandlers {
    public record ErrorResponse(String message, Map<String, String> errors) {}

    public static final String UNHANDLED_ERROR_MESSAGE = "An unexpected error occurred.";
    public static final String INVALID_DATA_MESSAGE = "The request data is invalid.";

    private final AuditService auditService;

    public ValidationExceptionHandlers(AuditService auditService) {
        this.auditService = auditService;
    }

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ErrorResponse handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HandlerMethod handlerMethod) {
        Map<String, String> errors = ex.getBindingResult().getAllErrors().stream()
                .collect(Collectors.toUnmodifiableMap(
                        (e) -> ((FieldError) e).getField(),
                        (e) -> Objects.requireNonNullElse(e.getDefaultMessage(), "No detail available")));

        Auditable auditableAnnotation = handlerMethod.getMethodAnnotation(Auditable.class);
        logError(auditableAnnotation, ex);

        return new ErrorResponse("Request validation failed", errors);
    }

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(value = {UnrecognizedPropertyException.class, HttpMessageNotReadableException.class})
    public ErrorResponse handleUnrecognizedProperty(UnrecognizedPropertyException ex, HandlerMethod handlerMethod) {
        Map<String, String> errors = ex.getPath().stream()
                .collect(Collectors.toUnmodifiableMap(
                        JsonMappingException.Reference::getFieldName, (e) -> "Unrecognized property"));

        Auditable auditableAnnotation = handlerMethod.getMethodAnnotation(Auditable.class);
        logError(auditableAnnotation, ex);

        return new ErrorResponse("Request contains unrecognized properties", errors);
    }

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(JsonMappingException.class)
    public ErrorResponse handleInvalidJsonMapping(JsonMappingException ex) {
        // Could not deserialize (bad json format or could not map to types)
        return new ErrorResponse("Invalid request body", new HashMap<>());
    }

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(value = {InvalidDataException.class})
    public ErrorResponse handleBadRequestException(Exception ex, HandlerMethod handlerMethod) {
        // Exception text can carry internal detail or return data, so the body is fixed and only the class is logged.
        log.error("Bad request {}", ex.getClass().getName());
        return logExceptionAndGenerateErrorResponse(
                handlerMethod == null ? null : handlerMethod.getMethodAnnotation(Auditable.class),
                ex,
                INVALID_DATA_MESSAGE,
                Map.of());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> handleResponseStatusException(
            ResponseStatusException ex, HandlerMethod handlerMethod) {
        return new ResponseEntity<>(ex.getBody(), ex.getStatusCode());
    }

    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    @ExceptionHandler(Exception.class)
    public ErrorResponse handleUnhandledException(Exception ex, HandlerMethod handlerMethod) {
        // Exception text can carry internal detail or return data, so the body is fixed and only the class is logged.
        log.error("Unhandled {}", ex.getClass().getName());
        return logExceptionAndGenerateErrorResponse(
                handlerMethod == null ? null : handlerMethod.getMethodAnnotation(Auditable.class),
                ex,
                UNHANDLED_ERROR_MESSAGE,
                Map.of());
    }

    private ErrorResponse logExceptionAndGenerateErrorResponse(
            Auditable auditableAnnotation,
            Exception ex,
            String errorResponseMessage,
            Map<String, String> errorResponseErrors) {
        logError(auditableAnnotation, ex);
        return new ErrorResponse(errorResponseMessage, errorResponseErrors);
    }

    private void logError(Auditable auditableAnnotation, Throwable ex) {

        if (auditableAnnotation == null) {
            log.error("auditableAnnotation is null, audit logging is skipped.");
        } else {
            auditService.addAuditPropertiesToMDC(Event.builder()
                    .eventId(auditableAnnotation.event())
                    .eventStatus(EventStatus.FAILURE)
                    .eventPrincipal(TaxpayerEventPrincipal.createFromContext())
                    .eventErrorMessage(ex.getClass().getName())
                    .build());
        }
    }
}
