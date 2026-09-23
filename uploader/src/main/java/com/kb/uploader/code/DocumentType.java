package com.kb.uploader.code;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 문서종류 — 사내 인포타입 {@code 구분코드2} 로 저장하는 코드값 (2026-09-23 신설).
 *
 * <p>자바가 쓰는 값은 {@code "BID_PROPOSAL"}·{@code "RFP"} 이고, DB 에는
 * {@code '01'}·{@code '02'} 로 들어간다. 변환은 {@code DocumentTypeTypeHandler} 한 곳뿐이다
 * — {@link ClassificationStatus} 와 같은 방식이다.
 *
 * <p>⚠️ <b>Mapper XML 의 SQL 리터럴은 이 변환을 타지 않는다.</b>
 * {@code WHERE 문서종류구분 = '01'} 처럼 <b>코드</b>로 적어야 한다.
 * 그 자리에 {@code 'BID_PROPOSAL'} 을 적으면 오류 없이 0건이 나온다.
 *
 * <p>확장자 판정과 화면 표시명도 여기 둔다. 문서 종류를 늘릴 때 고칠 곳이 한 군데가 되게 하려는 것이다.
 */
public final class DocumentType {

    public static final String BID_PROPOSAL = "BID_PROPOSAL";
    public static final String RFP          = "RFP";

    private static final Map<String, String> NAME_TO_CODE = new LinkedHashMap<String, String>();
    private static final Map<String, String> CODE_TO_NAME = new LinkedHashMap<String, String>();
    private static final Map<String, String> LABEL = new LinkedHashMap<String, String>();
    private static final Map<String, Set<String>> EXTENSIONS = new LinkedHashMap<String, Set<String>>();

    static {
        put("01", BID_PROPOSAL, "입찰제안서", "ppt", "pptx");
        put("02", RFP, "입찰공고문(RFP)", "pdf", "hwp", "hwpx");
    }

    private static void put(String code, String name, String label, String... extensions) {
        NAME_TO_CODE.put(name, code);
        CODE_TO_NAME.put(code, name);
        LABEL.put(name, label);
        EXTENSIONS.put(name, Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(extensions))));
    }

    public static Map<String, String> nameToCode() {
        return Collections.unmodifiableMap(NAME_TO_CODE);
    }

    public static Map<String, String> codeToName() {
        return Collections.unmodifiableMap(CODE_TO_NAME);
    }

    /** 화면 표시명. 모르는 값이면 그대로 돌려준다(옛 행은 문서종류가 null 이다). */
    public static String label(String name) {
        String label = LABEL.get(name);
        return label != null ? label : name;
    }

    public static Set<String> extensions(String name) {
        Set<String> exts = EXTENSIONS.get(name);
        return exts != null ? exts : Collections.<String>emptySet();
    }

    /** 이 종류가 받아들이는 확장자인가. */
    public static boolean accepts(String name, String filename) {
        return extensions(name).contains(extensionOf(filename));
    }

    public static String extensionOf(String filename) {
        if (filename == null) return "";
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase();
    }

    private DocumentType() {}
}
