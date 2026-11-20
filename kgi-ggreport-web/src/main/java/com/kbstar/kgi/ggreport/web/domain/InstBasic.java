package com.kbstar.kgi.ggreport.web.domain;

/** INSTITUTIONS 에서 양식 미리 채움이 읽는 두 칸 — 기관명(NAME_KO)과 기관 유형(TYPE, 비어 있을 수 있다). */
public class InstBasic {
    private String nameKo; private String type;

    public String getNameKo() { return nameKo; } public void setNameKo(String v) { nameKo = v; }
    public String getType() { return type; } public void setType(String v) { type = v; }
}
