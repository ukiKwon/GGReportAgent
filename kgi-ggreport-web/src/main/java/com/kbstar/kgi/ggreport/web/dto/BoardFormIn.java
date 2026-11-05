package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;
import java.util.Map;

/**
 * /board-forms 요청 본문. 키는 snake_case(JacksonConfig). 알 수 없는 키(columns·mapping 등)는 읽지 않고 버린다.
 * 구조(cols·rows)는 타입이 정해진 DTO 로만 받고, 서버가 base 버전·카탈로그와 대조해 검증한다.
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
        private Object fmt;
        private String name;
        private List<TableIn> tables;
        private Object confirmUnmapped;

        /**
         * 불리언 true 일 때만 엑셀 연결 칸이 사라지는 저장을 허용한다(생략·false·"true" 같은 문자열·1 은 400 UNMAP_CONFIRM_REQUIRED).
         * Object 로 받는 이유: Boolean 으로 받으면 "true" 문자열이 조용히 true 로 바뀐다. 서비스는 Boolean.TRUE.equals 로만 본다.
         */
        public Object getConfirmUnmapped() { return confirmUnmapped; }
        public void setConfirmUnmapped(Object confirmUnmapped) { this.confirmUnmapped = confirmUnmapped; }

        /**
         * 요청 형식 번호. 생략하거나 정수 1·2 만 허용하고 그 밖(3, 1.5, "2", true 등)은 서비스가 400 으로 거른다
         * (Object 로 받는 이유: Integer 로 받으면 1.5 가 조용히 1 로 깎인다). PR-1 은 1·2 모두 같은 cells 맵 본문이다.
         */
        public Object getFmt() { return fmt; }
        public void setFmt(Object fmt) { this.fmt = fmt; }
        public Integer getBaseVersion() { return baseVersion; }
        public void setBaseVersion(Integer baseVersion) { this.baseVersion = baseVersion; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public List<TableIn> getTables() { return tables; }
        public void setTables(List<TableIn> tables) { this.tables = tables; }
    }

    /**
     * 표 하나. cols·rows 는 구조를 보내는 표에서 둘 다 보내고(한쪽만이면 400), 구조를 보내지 않는 표만 cells(칸 key → 문구)를 쓴다.
     * 새 열 id 는 임시값 "n1","n2"…, 새 행 id 는 null — 서버가 c{N}/r{N}(100 이상)으로 발급한다.
     */
    public static class TableIn {
        private String ref;
        private String title;
        private List<String> notes;
        private Map<String, String> cells;
        private List<ColIn> cols;
        private List<RowIn> rows;

        public List<ColIn> getCols() { return cols; }
        public void setCols(List<ColIn> cols) { this.cols = cols; }
        public List<RowIn> getRows() { return rows; }
        public void setRows(List<RowIn> rows) { this.rows = rows; }

        public String getRef() { return ref; }
        public void setRef(String ref) { this.ref = ref; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public List<String> getNotes() { return notes; }
        public void setNotes(List<String> notes) { this.notes = notes; }
        public Map<String, String> getCells() { return cells; }
        public void setCells(Map<String, String> cells) { this.cells = cells; }
    }

    public static class ColIn {
        private String id;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
    }

    public static class RowIn {
        private String id;
        private List<CellIn> cells;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public List<CellIn> getCells() { return cells; }
        public void setCells(List<CellIn> cells) { this.cells = cells; }
    }

    /** 앵커 칸 하나. 빠진 속성은 서버가 기본값(1, 1, false, false, "left", "")으로 본다. */
    public static class CellIn {
        private String col;
        private String text;
        private Integer colspan;
        private Integer rowspan;
        private Boolean header;
        private Boolean input;
        private String align;

        public String getCol() { return col; }
        public void setCol(String col) { this.col = col; }
        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
        public Integer getColspan() { return colspan; }
        public void setColspan(Integer colspan) { this.colspan = colspan; }
        public Integer getRowspan() { return rowspan; }
        public void setRowspan(Integer rowspan) { this.rowspan = rowspan; }
        public Boolean getHeader() { return header; }
        public void setHeader(Boolean header) { this.header = header; }
        public Boolean getInput() { return input; }
        public void setInput(Boolean input) { this.input = input; }
        public String getAlign() { return align; }
        public void setAlign(String align) { this.align = align; }
    }
}
