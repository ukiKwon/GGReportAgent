package com.kb.uploader.domain;

import java.time.LocalDateTime;

public class Institution {

    private Long id;
    private String name;
    private String category;
    private LocalDateTime modifiedAt;

    public Institution() {}

    public Institution(String name, String category) {
        this.name = name;
        this.category = category;
        this.modifiedAt = LocalDateTime.now();
    }

    public void updateCategory(String category) {
        this.category = category;
        this.modifiedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public LocalDateTime getModifiedAt() { return modifiedAt; }
    public void setModifiedAt(LocalDateTime modifiedAt) { this.modifiedAt = modifiedAt; }
}
