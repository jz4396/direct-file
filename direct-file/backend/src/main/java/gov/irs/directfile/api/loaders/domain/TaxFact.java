package gov.irs.directfile.api.loaders.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;

public record TaxFact(
        String path,
        @JsonIgnore String name,
        @JsonIgnore String description,
        boolean exportZero,
        @JsonIgnore boolean blockSubmissionOnTrue,
        TaxWritable writable,
        TaxCompNode derived,
        TaxCompNode placeholder,
        ExportNode export) {}
