package com.kb.uploader.code;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기관영업분류 — 사내 인포타입 {@code 구분코드2} 로 저장하는 코드값.
 *
 * <p><b>왜 코드인가.</b> 사내 DB 표준의 {@code 구분코드} 는 <b>5자리 이하</b>여야 한다
 * (DBA 정책). 그런데 우리가 쓰던 값 {@code 지방자치단체} 는 6자라 들어가지 않는다.
 * 그래서 DB 에는 {@code '01'} 을 넣고, <b>자바와 화면은 한글 이름을 그대로 쓴다.</b>
 * 변환은 {@code InstitutionCategoryTypeHandler} 한 곳에서만 일어난다 —
 * 도메인·서비스·컨트롤러·Thymeleaf 는 이 코드의 존재를 모른다.
 *
 * <p>⚠️ <b>여기가 카테고리 목록의 유일한 출처다.</b> 종전에는 같은 목록이
 * {@code KGI12000}·{@code KGI12400} 두 컨트롤러와 {@code institution.html} 에
 * <b>세 벌</b>로 복제돼 있었고, 그래서 옛 4종(지자체·대학교·대학병원·공공기관)이
 * 그대로 남아 있었다. 늘리거나 바꿀 때는 이 파일만 고친다.
 *
 * <p>⚠️ 코드값을 바꾸면 <b>이미 저장된 행을 함께 옮겨야 한다.</b> 지금은 테이블이
 * 비어 있어 자유롭지만, 운영 뒤에는 UPDATE 가 따른다.
 */
public final class InstitutionCategory {

    private static final Map<String, String> NAME_TO_CODE = new LinkedHashMap<String, String>();
    private static final Map<String, String> CODE_TO_NAME = new LinkedHashMap<String, String>();

    static {
        put("01", "지방자치단체");
        put("02", "공공기관");
        put("03", "대학교");
        put("04", "병원");
        put("05", "법원");
    }

    private static void put(String code, String name) {
        NAME_TO_CODE.put(name, code);
        CODE_TO_NAME.put(code, name);
    }

    /** 화면 드롭다운에 그대로 쓰는 순서다(코드 오름차순). */
    public static List<String> names() {
        return Collections.unmodifiableList(new java.util.ArrayList<String>(NAME_TO_CODE.keySet()));
    }

    public static Map<String, String> nameToCode() {
        return Collections.unmodifiableMap(NAME_TO_CODE);
    }

    public static Map<String, String> codeToName() {
        return Collections.unmodifiableMap(CODE_TO_NAME);
    }

    private InstitutionCategory() {}
}
