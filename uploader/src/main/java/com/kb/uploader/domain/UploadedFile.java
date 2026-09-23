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

    // ── 2026-09-23 파싱 전환으로 추가한 7개 ────────────────────────────
    /** 문서종류구분. code/DocumentType 의 이름값(BID_PROPOSAL·RFP). DB 에는 코드(01·02)로 들어간다. */
    private String docType;
    /** 파싱상태구분. code/ParseStatus 의 이름값(PENDING·SUCCESS·FAILED). DB 에는 코드(01·02·03). */
    private String parseStatus;
    /** 파싱 실패 사유. 화면의 실패 배지 옆에 그대로 보여 준다. */
    private String parseMessage;
    /** 산출물(제안서 JSON·RFP 요약 MD) 경로. ⚠️ 원본 경로인 storedPath 와 다르다. */
    private String outputPath;
    /** 제안서 슬라이드 수 / RFP 페이지 수. */
    private Integer pageCount;
    private LocalDateTime parsedAt;
    /**
     * 제안서는 연도(yyyy), RFP 는 공고일(yyyyMMdd).
     * ⚠️ 기존 {@code year}(문서년 VARCHAR2(4))는 8자리를 담지 못해 새 컬럼을 쓴다.
     *    옛 행이 문서년을 쓰고 있으므로 그 필드는 남겨 두고 <b>새 코드는 이 값만</b> 쓴다.
     */
    private String docDate;

    /** 기관 테이블에 없을 때의 기관분류 값. ⚠️ InstitutionCategory 코드에는 없는 값이다. */
    public static final String UNKNOWN_CATEGORY = "미분류";

    public UploadedFile() {}

    /** 파싱 전환 후의 업로드. 기관·연도는 파싱해서 채우므로 이 시점에는 모른다. */
    public UploadedFile(String docType, String originalName, String storedPath) {
        this.docType = docType;
        this.originalName = originalName;
        this.storedPath = storedPath;
        this.status = "UNCLASSIFIED";
        this.parseStatus = "PENDING";
        this.uploadedAt = LocalDateTime.now();
    }

    /**
     * 파싱 성공 기록.
     *
     * <p>⚠️ 파싱상태와 분류상태는 <b>다른 축</b>이다. 파싱은 됐는데 기관 테이블에 없어
     * 분류가 안 되는 건이 정상적으로 존재한다 — 그 경우 분류상태는 UNCLASSIFIED 로 남는다.
     */
    public void markParsed(String institutionName, String category, String docDate,
                           String outputPath, Integer pageCount, String message) {
        this.institutionName = institutionName;
        this.category = category;
        this.docDate = docDate;
        this.outputPath = outputPath;
        this.pageCount = pageCount;
        this.parseMessage = truncate(message);
        this.parseStatus = "SUCCESS";
        this.parsedAt = LocalDateTime.now();
        if (category != null && !UNKNOWN_CATEGORY.equals(category)) {
            this.status = "CLASSIFIED";
            this.classifiedAt = this.parsedAt;
        } else {
            this.status = "UNCLASSIFIED";
            this.classifiedAt = null;
        }
    }

    public void markParseFailed(String message) {
        this.parseStatus = "FAILED";
        this.parseMessage = truncate(message);
        this.parsedAt = LocalDateTime.now();
        this.status = "UNCLASSIFIED";
    }

    /** 파싱메시지내용 은 1000자다. 넘치면 잘라 넣는다(길이 초과로 INSERT 가 죽는 쪽이 더 나쁘다). */
    private static String truncate(String message) {
        if (message == null) return null;
        return message.length() <= 1000 ? message : message.substring(0, 997) + "...";
    }

    /**
     * 화면에 보여 줄 기관분류. DB 에는 "미분류" 코드가 없어 NULL 로 저장하므로
     * 읽을 때 되돌린다(Mapper XML 의 {@code 기관분류값} 조각 참조).
     */
    public String getCategoryLabel() {
        return category == null ? UNKNOWN_CATEGORY : category;
    }

    /** 문서종류 표시명. 옛 행은 null 이라 "이전 방식" 으로 보여 준다. */
    public String getDocTypeLabel() {
        return docType == null ? "이전 방식" : com.kb.uploader.code.DocumentType.label(docType);
    }

    /** 산출물 파일명만. 화면 표시용. */
    public String getOutputFileName() {
        if (outputPath == null) return null;
        int slash = Math.max(outputPath.lastIndexOf('/'), outputPath.lastIndexOf('\\'));
        return slash < 0 ? outputPath : outputPath.substring(slash + 1);
    }

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

    public String getDocType() { return docType; }
    public void setDocType(String docType) { this.docType = docType; }
    public String getParseStatus() { return parseStatus; }
    public void setParseStatus(String parseStatus) { this.parseStatus = parseStatus; }
    public String getParseMessage() { return parseMessage; }
    public void setParseMessage(String parseMessage) { this.parseMessage = parseMessage; }
    public String getOutputPath() { return outputPath; }
    public void setOutputPath(String outputPath) { this.outputPath = outputPath; }
    public Integer getPageCount() { return pageCount; }
    public void setPageCount(Integer pageCount) { this.pageCount = pageCount; }
    public LocalDateTime getParsedAt() { return parsedAt; }
    public void setParsedAt(LocalDateTime parsedAt) { this.parsedAt = parsedAt; }
    public String getDocDate() { return docDate; }
    public void setDocDate(String docDate) { this.docDate = docDate; }
}
