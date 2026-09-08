package com.kb.uploader.domain;

import java.time.LocalDateTime;

public class UploadedFile {

    /** 감사 컬럼 시스템사용자번호. 화면번호(앞 K 제외 7자) 또는 'BATCH01'. code/SystemUser 참조. */
    private String systemUserNo;

    /**
     * 감사 컬럼 시스템사용일시. <b>업로드일시(업무 시각)와 다르다</b> — 이 행을 마지막으로
     * 건드린 시각이다. 규칙(사용자 확정 2026-09-08):
     * 업로드 때는 업로드일시, 분류 때는 분류일시와 <b>같은 값</b>을 쓰고,
     * 그 둘이 없는 경우(삭제·반려·분류일시 없는 수정)는 <b>그 시점의 시각</b>을 쓴다.
     * ⚠️ DB 함수로 채우지 않는 이유는 방언이 갈리고(TO_CHAR/DATE_FORMAT) 테스트로
     *    확인하기 어렵기 때문이다 — 자바에서 정해 넘기면 값이 정확히 일치한다.
     */
    private LocalDateTime systemUsedAt;

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

    public String getSystemUserNo() { return systemUserNo; }
    public void setSystemUserNo(String systemUserNo) { this.systemUserNo = systemUserNo; }
    public LocalDateTime getSystemUsedAt() { return systemUsedAt; }
    public void setSystemUsedAt(LocalDateTime systemUsedAt) { this.systemUsedAt = systemUsedAt; }
}
