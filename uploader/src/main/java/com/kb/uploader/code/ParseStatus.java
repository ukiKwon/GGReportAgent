package com.kb.uploader.code;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 파싱상태 — 사내 인포타입 {@code 구분코드2} 로 저장하는 코드값 (2026-09-23 신설).
 *
 * <p>⚠️ {@link ClassificationStatus}(분류상태)와 <b>다른 축</b>이다.
 * 분류상태는 "기관분류를 확정했는가", 파싱상태는 "문서를 읽어 산출물을 만들었는가" 다.
 * 파싱은 성공했는데 기관 테이블에 없는 기관이라 미분류로 남는 건이 정상적으로 존재한다.
 *
 * <p>⚠️ SQL 리터럴은 변환을 타지 않는다 — {@code WHERE 파싱상태구분 = '03'} 처럼 코드로 적을 것.
 */
public final class ParseStatus {

    public static final String PENDING = "PENDING";
    public static final String SUCCESS = "SUCCESS";
    public static final String FAILED  = "FAILED";

    private static final Map<String, String> NAME_TO_CODE = new LinkedHashMap<String, String>();
    private static final Map<String, String> CODE_TO_NAME = new LinkedHashMap<String, String>();

    static {
        put("01", PENDING);
        put("02", SUCCESS);
        put("03", FAILED);
    }

    private static void put(String code, String name) {
        NAME_TO_CODE.put(name, code);
        CODE_TO_NAME.put(code, name);
    }

    public static Map<String, String> nameToCode() {
        return Collections.unmodifiableMap(NAME_TO_CODE);
    }

    public static Map<String, String> codeToName() {
        return Collections.unmodifiableMap(CODE_TO_NAME);
    }

    private ParseStatus() {}
}
