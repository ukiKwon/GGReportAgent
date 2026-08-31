package com.kb.uploader.dto;

public class FileDownloadResponse {

    private final Long id;
    private final String fileName;
    private final String mimeType;
    private final long fileSize;
    private final String fileData;

    public FileDownloadResponse(Long id, String fileName, String mimeType,
                                long fileSize, String fileData) {
        this.id = id;
        this.fileName = fileName;
        this.mimeType = mimeType;
        this.fileSize = fileSize;
        this.fileData = fileData;
    }

    public Long getId() { return id; }
    public String getFileName() { return fileName; }
    public String getMimeType() { return mimeType; }
    public long getFileSize() { return fileSize; }
    public String getFileData() { return fileData; }
}
