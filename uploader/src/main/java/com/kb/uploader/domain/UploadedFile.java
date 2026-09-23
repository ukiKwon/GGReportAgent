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

    /** 기관 테이블에 없을 때의 기관분류 값. ⚠️ InstitutionCategory 코드에는 없는 값이다. */
    public static final String UNKNOWN_CATEGORY = "미분류";

    public UploadedFile() {}

    /**
     * 파싱 전환 후의 업로드 (2026-09-23).
     *
     * <p>⚠️ 문서종류·파싱상태를 <b>컬럼으로 두지 않는다</b>(스키마 무변경안). 문서종류는
     * 원본 확장자로, 파싱 성공 여부는 저장경로의 확장자로 판별한다 — getDocType()·isParsed() 참조.
     */
    public UploadedFile(String originalName, String storedPath) {
        this.originalName = originalName;
        this.storedPath = storedPath;
        this.status = "UNCLASSIFIED";
        this.uploadedAt = LocalDateTime.now();
    }

    /**
     * 파싱 성공 기록 (스키마 무변경안).
     *
     * <p>산출물 경로를 {@code 저장경로내용} 에 넣는다. 원본 경로는
     * {@code userdata + 원본파일명} 으로 언제든 재구성되므로 따로 보관하지 않는다.
     * 파싱 시각은 {@code 분류일시} 에 넣는다 — 이 흐름에서 둘은 같은 시각이다.
     *
     * <p>⚠️ 기관을 못 찾으면 분류상태는 UNCLASSIFIED 로 남는다. 그래도 산출물은 만들어졌으므로
     * 화면에서는 "파싱 성공 + 기관 미분류" 로 보인다(판별은 저장경로 확장자로 한다).
     */
    public void markParsed(String institutionName, String category, String docDate,
                           String outputPath, LocalDateTime parsedAt) {
        this.institutionName = institutionName;
        this.category = category;
        this.storedPath = outputPath;
        this.classifiedAt = parsedAt;
        if (docDate != null && docDate.length() == 4) {
            this.year = docDate;          // 제안서 연도는 기존 문서년(4) 에 그대로 들어간다
        }
        this.status = (category != null && !UNKNOWN_CATEGORY.equals(category))
                ? "CLASSIFIED" : "UNCLASSIFIED";
    }

    /**
     * 파싱 실패 기록.
     *
     * <p>⚠️ <b>실패 사유는 저장하지 않는다</b>(넣을 컬럼이 없다 — 스키마 무변경안의 유일한 손실).
     * 사유는 서버 로그에만 남는다. 저장경로는 원본 그대로 두며, 그 사실이 곧 "파싱 실패" 표시다.
     */
    public void markParseFailed(String originalPath) {
        this.storedPath = originalPath;
        this.classifiedAt = null;
        this.status = "UNCLASSIFIED";
    }

    /**
     * 화면에 보여 줄 기관분류. DB 에는 "미분류" 코드가 없어 NULL 로 저장하므로
     * 읽을 때 되돌린다(Mapper XML 의 {@code 기관분류값} 조각 참조).
     */
    public String getCategoryLabel() {
        return category == null ? UNKNOWN_CATEGORY : category;
    }

    // ── 파생값 (스키마 무변경안) ─────────────────────────────────────
    // 컬럼을 늘리지 않으려고 아래 값들은 **저장하지 않고 그때그때 계산**한다.
    // 규칙이 한곳(DocumentType)에 모여 있어 SQL 과 화면이 같은 기준을 쓴다.

    /** 문서종류. 원본 확장자로 판별한다. 규칙 밖이면 null(옛 방식 업로드). */
    public String getDocType() {
        return com.kb.uploader.code.DocumentType.ofFileName(originalName);
    }

    public String getDocTypeLabel() {
        String type = getDocType();
        return type == null ? "이전 방식" : com.kb.uploader.code.DocumentType.label(type);
    }

    /**
     * 파싱 성공 여부. <b>저장경로가 산출물(.json·.md)이면 성공</b>이다.
     * 원본 확장자 그대로면 아직 산출물이 없다는 뜻이라 실패로 본다.
     */
    public boolean isParsed() {
        return com.kb.uploader.code.DocumentType.isOutputPath(storedPath);
    }

    /** 화면·API 가 쓰는 파싱상태 문자열. 컬럼이 아니라 계산값이다. */
    public String getParseStatus() {
        if (getDocType() == null) return null;      // 옛 방식 행
        return isParsed() ? "SUCCESS" : "FAILED";
    }

    /** 산출물 경로. 파싱 전/실패면 null. */
    public String getOutputPath() {
        return isParsed() ? storedPath : null;
    }

    /** 파싱 시각. 분류일시를 그대로 쓴다. */
    public LocalDateTime getParsedAt() {
        return isParsed() ? classifiedAt : null;
    }

    /**
     * 제안서 연도(4) 또는 RFP 공고일(8). 산출물 파일명의 앞 토큰이 그 값이다
     * ({@code 20240315_지자체_서울특별시_20260923.md}). 없으면 기존 문서년으로 떨어진다.
     */
    public String getDocDate() {
        String head = com.kb.uploader.code.DocumentType.leadingDate(getOutputFileName());
        return head != null ? head : year;
    }

    /** 산출물 파일명만. 화면 표시용. */
    public String getOutputFileName() {
        String path = getOutputPath();
        if (path == null) return null;
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return slash < 0 ? path : path.substring(slash + 1);
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

}
