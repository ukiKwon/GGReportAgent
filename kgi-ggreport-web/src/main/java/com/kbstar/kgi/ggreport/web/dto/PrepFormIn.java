package com.kbstar.kgi.ggreport.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * 사전준비 양식(049) API 입력. 최상위는 모르는 키를 무시하되, fields·lists·tables 안쪽은 서비스가 엄격하게 검사한다
 * (모르는 키·형이 다른 값은 400). 사번·역할·판 내용의 FACT 칸은 받지 않는다 — 서버가 원본에서 채운다.
 */
public class PrepFormIn {

    private PrepFormIn() {
    }

    /** 모든 쓰기의 공통 — 화면이 본 판 번호(처음이면 0). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Base {
        private Integer baseVer;

        public Integer getBaseVer() { return baseVer; }
        public void setBaseVer(Integer v) { this.baseVer = v; }
    }

    /** {@code POST …/prefill} — keys 가 없으면 FACT 칸 전부 + 씨앗, 있으면 그 칸만(FACT 키·"biz"·"years"). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Prefill extends Base {
        private List<String> keys;

        public List<String> getKeys() { return keys; }
        public void setKeys(List<String> v) { this.keys = v; }
    }

    /** {@code PUT …/draft} — 편집 칸 전체 교체(patch 아님). 안쪽 모양은 서비스가 검사한다. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Draft extends Base {
        private JsonNode fields;
        private JsonNode lists;
        private JsonNode tables;

        public JsonNode getFields() { return fields; }
        public void setFields(JsonNode v) { this.fields = v; }
        public JsonNode getLists() { return lists; }
        public void setLists(JsonNode v) { this.lists = v; }
        public JsonNode getTables() { return tables; }
        public void setTables(JsonNode v) { this.tables = v; }
    }

    /** {@code POST …/unconfirm} — 사유 1~200자 필수. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Unconfirm {
        private String reason;

        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }
}
