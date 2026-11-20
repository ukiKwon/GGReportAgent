package com.kbstar.kgi.ggreport.web.domain;

/** 양식의 '기관 주요 사업' 씨앗으로 읽는 INST_PLAN_ITEM 네 칸. */
public class PlanSeedItem {
    private String fieldName; private String itemName; private String content; private String parentNo;

    public String getFieldName() { return fieldName; } public void setFieldName(String v) { fieldName = v; }
    public String getItemName() { return itemName; } public void setItemName(String v) { itemName = v; }
    public String getContent() { return content; } public void setContent(String v) { content = v; }
    public String getParentNo() { return parentNo; } public void setParentNo(String v) { parentNo = v; }
}
