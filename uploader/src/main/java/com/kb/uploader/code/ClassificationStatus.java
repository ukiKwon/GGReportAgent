package com.kb.uploader.code;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 분류상태 — 사내 인포타입 {@code 구분코드2} 로 저장하는 코드값.
 *
 * <p>자바가 쓰는 값은 {@code "UNCLASSIFIED"} 처럼 <b>종전 그대로</b>다
 * ({@code UploadedFile.classify()}·{@code softDelete()} 등). 12자라 5자리 상한을
 * 넘으므로 DB 에만 코드로 바꿔 넣는다 — 변환은
 * {@code ClassificationStatusTypeHandler} 한 곳뿐이다.
 *
 * <p>⚠️ <b>Mapper XML 의 SQL 리터럴은 이 변환을 타지 않는다.</b>
 * TypeHandler 는 <b>파라미터와 결과</b>에만 걸리므로,
 * {@code SET 분류상태구분 = '04'} 처럼 문장에 직접 박힌 값은 <b>코드로 적어야 한다.</b>
 * 그 자리에 {@code 'DELETED'} 를 적으면 조용히 아무 행도 안 바뀐다.
 */
public final class ClassificationStatus {

    public static final String UNCLASSIFIED = "UNCLASSIFIED";
    public static final String CLASSIFIED   = "CLASSIFIED";
    public static final String REJECTED     = "REJECTED";
    public static final String DELETED      = "DELETED";

    private static final Map<String, String> NAME_TO_CODE = new LinkedHashMap<String, String>();
    private static final Map<String, String> CODE_TO_NAME = new LinkedHashMap<String, String>();

    static {
        put("01", UNCLASSIFIED);
        put("02", CLASSIFIED);
        put("03", REJECTED);
        put("04", DELETED);
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

    private ClassificationStatus() {}
}
