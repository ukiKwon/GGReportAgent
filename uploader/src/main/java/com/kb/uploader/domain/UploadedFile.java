package com.kb.uploader.domain;

import java.time.LocalDateTime;

public class UploadedFile {

    private Long id;
    private String originalName;
    private String storedPath;
    private String year;
    private String institutionName;
    private String category;
    private String status;
    private LocalDateTime uploadedAt;
    private LocalDateTime classifiedAt;

    public UploadedFile() {}

    public UploadedFile(String originalName, String storedPath,
                        String year, String institutionName) {
        this.originalName = originalName;
        this.storedPath = storedPath;
        this.year = year;
        this.institutionName = institutionName;
        this.status = "UNCLASSIFIED";
        this.uploadedAt = LocalDateTime.now();
    }

    public void classify(String category, String storedPath) {
        this.category = category;
        this.storedPath = storedPath;
        this.status = "CLASSIFIED";
        this.classifiedAt = LocalDateTime.now();
    }

    public void softDelete() {
        this.status = "DELETED";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getOriginalName() { return originalName; }
    public void setOriginalName(String originalName) { this.originalName = originalName; }
    public String getStoredPath() { return storedPath; }
    public void setStoredPath(String storedPath) { this.storedPath = storedPath; }
    public String getYear() { return year; }
    public void setYear(String year) { this.year = year; }
    public String getInstitutionName() { return institutionName; }
    public void setInstitutionName(String institutionName) { this.institutionName = institutionName; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
    public LocalDateTime getClassifiedAt() { return classifiedAt; }
    public void setClassifiedAt(LocalDateTime classifiedAt) { this.classifiedAt = classifiedAt; }
}
