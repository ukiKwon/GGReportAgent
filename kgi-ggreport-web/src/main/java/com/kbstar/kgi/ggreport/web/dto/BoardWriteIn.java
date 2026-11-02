package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;
import java.util.Map;

/** POST /board-forms/{id}/draft-docx 본문: {version, tables:[{ref, cells:{key:value}}]} — 매핑 칸만. */
public class BoardWriteIn {
    private Integer version;
    private List<TableIn> tables;

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public List<TableIn> getTables() { return tables; }
    public void setTables(List<TableIn> tables) { this.tables = tables; }

    public static class TableIn {
        private String ref;
        private Map<String, String> cells;

        public String getRef() { return ref; }
        public void setRef(String ref) { this.ref = ref; }
        public Map<String, String> getCells() { return cells; }
        public void setCells(Map<String, String> cells) { this.cells = cells; }
    }
}
