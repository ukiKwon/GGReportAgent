package com.kb.uploader.dto;

public class ParsedFileName {
    private final String year;
    private final String institutionName;
    private final String description;
    private final String extension;

    public ParsedFileName(String year, String institutionName,
                          String description, String extension) {
        this.year = year;
        this.institutionName = institutionName;
        this.description = description;
        this.extension = extension;
    }

    public String getYear() { return year; }
    public String getInstitutionName() { return institutionName; }
    public String getDescription() { return description; }
    public String getExtension() { return extension; }
}
