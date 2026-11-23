package com.kbstar.kgi.ggreport.web.docout;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 사전준비 과제 T1 '기관 정보 요약' 양식의 칸 지도(NEXT 100 S2, DB 049) — 순수 상수다(web 계층을 모른다).
 * 칸의 종류: FACT 는 서버가 원본(기관 기본 정보·기관장·금고 약정)에서만 채우고 사람이 이 양식에서 고치지 못한다(원 화면에서 고친다).
 * TEXT·LIST·TABLE 은 사람이 쓰는 칸이다. 필수·한도·고치는 화면(fixScreen)이 여기 한 곳에 있다.
 * 칸 지도를 바꾸면 {@link #TPL_VER} 을 올린다(옛 판은 그 판의 TPL_VER 로 읽는다).
 */
public final class InstSummaryTpl {

    public static final String FORM_CD = "INST_SUMMARY";
    public static final String TASK_CD = "T1";
    public static final int TPL_VER = 2;   // 2: 'effect'(우리 회사 기대효과) 추가. 1 판은 effect 가 없고 빈 목록으로 읽는다.
    /** 정규 JSON(UTF-8) 상한 — 넘으면 저장하지 않는다(400 CONTENT_TOO_LARGE). */
    public static final int MAX_CONTENT_BYTES = 120 * 1024;
    /** 양식당 판 상한 — 넘으면 409 TOO_MANY_VERSIONS(security 11-20 중-3: 같은 내용 재저장은 판을 만들지 않지만 건당 총량도 막는다). */
    public static final int MAX_VERSIONS = 500;

    public static final int MAX_BIZ_ROWS = 40;
    public static final int MAX_FUND_ROWS = 10;
    public static final int MAX_LIST_ITEMS = 10;
    public static final int MAX_NOTE = 100;

    public enum Kind { FACT, TEXT, LIST, TABLE }

    public static final class Key {
        private final String key;
        private final Kind kind;
        private final String label;
        private final boolean required;
        private final int maxLen;
        private final int maxItems;
        private final String fixScreen;

        Key(String key, Kind kind, String label, boolean required, int maxLen, int maxItems, String fixScreen) {
            this.key = key;
            this.kind = kind;
            this.label = label;
            this.required = required;
            this.maxLen = maxLen;
            this.maxItems = maxItems;
            this.fixScreen = fixScreen;
        }

        public String getKey() { return key; }
        public Kind getKind() { return kind; }
        public String getLabel() { return label; }
        public boolean isRequired() { return required; }
        public int getMaxLen() { return maxLen; }
        public int getMaxItems() { return maxItems; }
        public String getFixScreen() { return fixScreen; }
    }

    public static final List<Key> KEYS;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> k = new ArrayList<Key>();
        k.add(new Key("inst_name", Kind.FACT, "기관명", true, 0, 0, "inst_edit"));
        k.add(new Key("inst_type", Kind.FACT, "기관 형태", false, 0, 0, "inst_edit"));
        k.add(new Key("head_name", Kind.FACT, "기관장", true, 0, 0, "head_card"));   // 기관장 기능이 꺼져 있으면 서비스가 필수에서 뺀다
        k.add(new Key("current_bank", Kind.FACT, "현 거래 은행", false, 0, 0, "bank_contract"));
        k.add(new Key("bid_kind", Kind.TEXT, "공고명(입찰 종류)", true, 40, 0, null));
        k.add(new Key("budget", Kind.TEXT, "예산", false, 60, 0, null));
        k.add(new Key("staff", Kind.TEXT, "임직원 수", false, 40, 0, null));
        k.add(new Key("supervisor", Kind.TEXT, "주무기관", false, 60, 0, null));
        k.add(new Key("address", Kind.TEXT, "소재지", false, 100, 0, null));
        k.add(new Key("org_note", Kind.TEXT, "조직현황", false, 300, 0, null));
        k.add(new Key("overview", Kind.LIST, "추진 배경(현황)", true, 300, MAX_LIST_ITEMS, null));
        k.add(new Key("mmda_basis", Kind.LIST, "MMDA 예상 평잔 산정 기준", false, 300, MAX_LIST_ITEMS, null));
        k.add(new Key("competition", Kind.LIST, "경쟁은행 동향 및 중점 제안 사항", false, 300, MAX_LIST_ITEMS, null));
        k.add(new Key("effect", Kind.LIST, "우리 회사 기대효과", false, 300, MAX_LIST_ITEMS, null));
        k.add(new Key("biz", Kind.TABLE, "기관 주요 사업", false, 0, MAX_BIZ_ROWS, null));
        k.add(new Key("fund", Kind.TABLE, "예산 운영 방식", false, 0, MAX_FUND_ROWS, null));
        k.add(new Key("years", Kind.TABLE, "연도별 예상 평잔·자금수익", false, 0, 0, null));
        KEYS = Collections.unmodifiableList(k);
        Map<String, Key> m = new LinkedHashMap<String, Key>();
        for (Key x : KEYS) {
            m.put(x.key, x);
        }
        BY_KEY = Collections.unmodifiableMap(m);
    }

    private InstSummaryTpl() {
    }

    /** 칸 키 → 칸. 모르는 키면 null. */
    public static Key of(String key) {
        return key == null ? null : BY_KEY.get(key);
    }

    public static List<Key> keysOf(Kind kind) {
        List<Key> out = new ArrayList<Key>();
        for (Key x : KEYS) {
            if (x.kind == kind) {
                out.add(x);
            }
        }
        return out;
    }

    /** 서버가 원본에서만 채우는 칸의 키(순서 고정). */
    public static Set<String> factKeys() {
        Set<String> out = new LinkedHashSet<String>();
        for (Key x : keysOf(Kind.FACT)) {
            out.add(x.key);
        }
        return Collections.unmodifiableSet(out);
    }
}
