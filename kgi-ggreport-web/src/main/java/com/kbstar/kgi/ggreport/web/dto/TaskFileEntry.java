package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 작업 첨부 1건. Python {@code server/task_files._entry()} 가 만들던 dict 와 같은 모양이다.
 *
 * <p>⚠️ {@code replaced} 는 <b>업로드 응답에만</b> 실린다(목록에는 의미가 없다).
 * 목록에까지 {@code false} 로 나가면 화면이 "덮어쓴 적 없음"을 매번 표시할 자리로
 * 오해할 수 있어 {@code NON_DEFAULT} 로 감춘다 — 원본도 목록에는 이 키가 없다.
 */
public class TaskFileEntry {

    private String name;
    private long size;
    private String uploadedAt;

    @JsonInclude(JsonInclude.Include.NON_DEFAULT)
    private boolean replaced;

    public TaskFileEntry() {
    }

    public TaskFileEntry(String name, long size, String uploadedAt, boolean replaced) {
        this.name = name;
        this.size = size;
        this.uploadedAt = uploadedAt;
        this.replaced = replaced;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }

    public String getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(String uploadedAt) { this.uploadedAt = uploadedAt; }

    public boolean isReplaced() { return replaced; }
    public void setReplaced(boolean replaced) { this.replaced = replaced; }
}
