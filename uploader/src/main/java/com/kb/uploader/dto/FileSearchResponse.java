package com.kb.uploader.dto;

import java.util.List;

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
        private final String content;

        public FileItem(Long id, String originalName, String institution,
                        String year, String category, String status,
                        String uploadedAt, String content) {
            this.id = id;
            this.originalName = originalName;
            this.institution = institution;
            this.year = year;
            this.category = category;
            this.status = status;
            this.uploadedAt = uploadedAt;
            this.content = content;
        }

        public Long getId() { return id; }
        public String getOriginalName() { return originalName; }
        public String getInstitution() { return institution; }
        public String getYear() { return year; }
        public String getCategory() { return category; }
        public String getStatus() { return status; }
        public String getUploadedAt() { return uploadedAt; }
        public String getContent() { return content; }
    }
}
