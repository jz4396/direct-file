package gov.irs.directfile.api.errors;

import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpStatusCode;

import gov.irs.directfile.api.taxreturn.ApiErrorKeys;
import gov.irs.directfile.api.taxreturn.TaxReturnApi.SubmissionBlockingFacts;

public class SubmissionBlockingFactsResponseStatusException extends ApiResponseStatusException {
    public static final String docsExampleObject =
            """
        {
            "status":"BAD_REQUEST",
            "message":"400 BAD_REQUEST \\"Submission blocking facts are true for tax return.\\"",
            "apiErrorKey":"generic.submissionError",
            "body":{"blockingFacts":["/flowIsKnockedOut"]}
        }
            """;

    public SubmissionBlockingFactsResponseStatusException(
            HttpStatusCode status, String reason, ApiErrorKeys apiErrorKey, Throwable cause) {
        super(status, reason, apiErrorKey, cause);
    }

    public SubmissionBlockingFactsResponseStatusException(String message, Throwable cause) {
        this(
                SubmissionBlockingFacts.code,
                String.format(
                        "%s%s%s",
                        SubmissionBlockingFacts.description, StringUtils.isBlank(message) ? "" : " ", message),
                ApiErrorKeys.SUBMISSION_BLOCKING_FACTS,
                cause);
    }

    public SubmissionBlockingFactsResponseStatusException(String message) {
        this(message, null);
    }

    public SubmissionBlockingFactsResponseStatusException(Throwable cause) {
        this("", cause);
    }

    public SubmissionBlockingFactsResponseStatusException() {
        this("");
    }

    /** Lists the blocking fact paths (never their values) in the message and as {@code blockingFacts} in the body. */
    public SubmissionBlockingFactsResponseStatusException(List<String> blockingFactPaths) {
        super(
                SubmissionBlockingFacts.code,
                SubmissionBlockingFacts.description + " " + String.join(", ", blockingFactPaths),
                ApiErrorKeys.SUBMISSION_BLOCKING_FACTS,
                Map.of("blockingFacts", List.copyOf(blockingFactPaths)),
                null);
    }
}
