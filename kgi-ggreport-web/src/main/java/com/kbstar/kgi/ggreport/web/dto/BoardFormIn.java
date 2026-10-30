package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;
import java.util.Map;

/**
 * /board-forms 요청 본문. 키는 snake_case(JacksonConfig). 알 수 없는 키(rows·columns·mapping 등 구조)는
 * 읽지 않고 버린다 — 구조는 서버 카탈로그에서만 나온다.
 */
public final class BoardFormIn {

    private BoardFormIn() {
    }

    /** POST /board-forms/copy — source 는 생략하거나 "default_doc", 또는 source_form_id(같은 팀 양식). */
    public static class Copy {
        private String source;
        private Long sourceFormId;
        private String name;

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
        public Long getSourceFormId() { return sourceFormId; }
        public void setSourceFormId(Long sourceFormId) { this.sourceFormId = sourceFormId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
    }

    /** PUT /board-forms/{id} — 전체 교체. 보내지 않은 칸은 카탈로그 기본 문구로 돌아간다. */
    public static class Save {
        private Integer baseVersion;
        private String name;
        private List<TableIn> tables;

        public Integer getBaseVersion() { return baseVersion; }
        public void setBaseVersion(Integer baseVersion) { this.baseVersion = baseVersion; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public List<TableIn> getTables() { return tables; }
        public void setTables(List<TableIn> tables) { this.tables = tables; }
    }

    public static class TableIn {
        private String ref;
        private String title;
        private List<String> notes;
        private Map<String, String> cells;

        public String getRef() { return ref; }
        public void setRef(String ref) { this.ref = ref; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public List<String> getNotes() { return notes; }
        public void setNotes(List<String> notes) { this.notes = notes; }
        public Map<String, String> getCells() { return cells; }
        public void setCells(Map<String, String> cells) { this.cells = cells; }
    }
}
