package com.kb.uploader.dto;

import java.util.List;

/**
 * 파일 검색 응답 — 목록 메타데이터만 싣는다(NEXT 86). 본문(content)은 매 요청 추출 부하·노출 때문에 뺐다.
 * 본문 제공이 필요해지면 저장형(업로드 분석 때 저장한 본문)으로 필드를 다시 더한다 — 키 추가는 기존 호출자와 호환된다.
 */
public class FileSearchResponse {

    private final List<FileItem> files;

    public FileSearchResponse(List<FileItem> files) {
        this.files = files;
    }

    public List<FileItem> getFiles() { return files; }

    public static class FileItem {
        private final Long id;
        private final String originalName;
        private final String institution;
        private final String year;
        private final String category;
        private final String status;
        private final String uploadedAt;

        public FileItem(Long id, String originalName, String institution,
                        String year, String category, String status,
                        String uploadedAt) {
            this.id = id;
            this.originalName = originalName;
            this.institution = institution;
            this.year = year;
            this.category = category;
            this.status = status;
            this.uploadedAt = uploadedAt;
        }

        public Long getId() { return id; }
        public String getOriginalName() { return originalName; }
        public String getInstitution() { return institution; }
        public String getYear() { return year; }
        public String getCategory() { return category; }
        public String getStatus() { return status; }
        public String getUploadedAt() { return uploadedAt; }
    }
}
