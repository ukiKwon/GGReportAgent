package com.kb.uploader.dto;

public class UploadResultItem {
    private final String filename;
    private final boolean classified;
    private final String category;
    private final String message;

    public UploadResultItem(String filename, boolean classified,
                            String category, String message) {
        this.filename = filename;
        this.classified = classified;
        this.category = category;
        this.message = message;
    }

    public String getFilename() { return filename; }
    public boolean isClassified() { return classified; }
    public String getCategory() { return category; }
    public String getMessage() { return message; }
}
