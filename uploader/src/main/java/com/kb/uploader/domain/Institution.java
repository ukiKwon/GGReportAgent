package com.kb.uploader.domain;

import java.time.LocalDateTime;

public class Institution {

    /** 감사 컬럼 시스템사용자번호. 화면번호(앞 K 제외 7자) 또는 'BATCH01'. code/SystemUser 참조. */
    private String systemUserNo;

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

    public String getSystemUserNo() { return systemUserNo; }
    public void setSystemUserNo(String systemUserNo) { this.systemUserNo = systemUserNo; }
}
