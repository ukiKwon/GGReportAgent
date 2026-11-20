package com.kbstar.kgi.ggreport.web.dto;

import java.util.List;

/** 의도적 언급 표시 입력(NEXT 106). 전역 SNAKE_CASE(inst_id·loc_kind·loc_no). 사번·시각은 받지 않는다(서버가 Actor·USERS 로 정한다). */
public class DocCheckAckIn {
    private Boolean acked;
    private String sha256;
    private List<Item> items;

    public Boolean getAcked() { return acked; }
    public void setAcked(Boolean v) { acked = v; }
    public String getSha256() { return sha256; }
    public void setSha256(String v) { sha256 = v; }
    public List<Item> getItems() { return items; }
    public void setItems(List<Item> v) { items = v; }

    public static class Item {
        private String instId;
        private String locKind;
        private Integer locNo;

        public String getInstId() { return instId; }
        public void setInstId(String v) { instId = v; }
        public String getLocKind() { return locKind; }
        public void setLocKind(String v) { locKind = v; }
        public Integer getLocNo() { return locNo; }
        public void setLocNo(Integer v) { locNo = v; }
    }
}
