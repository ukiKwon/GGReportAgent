package com.kbstar.kgi.ggreport.web.minutes;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 발화자 역할 라벨 — 사용자 11-20 결정(직책·역할만, 실명 금지)으로 security R14 의 좁은 예외. 자유 글은 받지 않는다.
 * 형식: [소속 ' '] 역할 [' ' 번호 1~9]. '측' 은 소속이 있어야 한다. 어휘 목록은 기획 확정 대상(이관).
 * 오류에는 화자 번호·종류만 싣고 받은 값은 싣지 않는다.
 *
 * <p>유지 조건(security B2): 라벨은 회의록 상세·원문·미리보기 응답에만 싣는다. 목록 API, 020 탭 건수, ACT·ACCESS_LOG detail,
 * 오류 응답에는 싣지 않는다(접근 이력은 건수만). <b>여러 회의록에 걸친 라벨 검색·모아 보기는 만들지 않는다 — 추가하려면 security 재검토.</b>
 */
public final class SpeakerLabels {
    public static final int MAX_CHARS = 20;
    public static final int MAX_ENTRIES = 100;
    public static final int MAX_ORDINAL = 9;
    public static final String SIDE = "측";
    public static final List<String> AFFILIATIONS = Collections.unmodifiableList(Arrays.asList("기관", "은행", "외부"));
    public static final List<String> ROLES = Collections.unmodifiableList(Arrays.asList(
            SIDE, "기관장", "구청장", "시장", "군수", "도지사", "교육감", "총장", "병원장", "이사장", "이사", "감사",
            "위원장", "위원", "의원", "실장", "국장", "과장", "팀장", "주무관", "본부장", "영업부장", "영업팀장", "부장",
            "차장", "대리", "행장", "지점장", "담당자", "직원", "사회자", "발표자", "관계자"));   // 은행 직책 허용(사용자 답, main 11-20)
    private static final Pattern WS = Pattern.compile("\\s+");
    private static final Pattern ORD = Pattern.compile("[1-9]");

    private SpeakerLabels() {
    }

    static MinutesException invalid(int speakerNo, String kind) {
        Map<String, Integer> k = new LinkedHashMap<String, Integer>();
        k.put(kind, Integer.valueOf(1));
        return new MinutesException(422, "LABEL_INVALID", "speaker_label", 0, speakerNo, k);
    }

    /** 정규화한 라벨. 비었으면 null(라벨 없음 = '참석자 N'). 형식이 아니면 422 LABEL_INVALID{form}. */
    public static String normalize(String raw, int speakerNo) {
        if (raw == null) {
            return null;
        }
        if (raw.length() > MAX_CHARS * 4) {
            throw invalid(speakerNo, "form");
        }
        String t = WS.matcher(MinutesText.fold(raw)).replaceAll(" ").trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.length() > MAX_CHARS) {
            throw invalid(speakerNo, "form");
        }
        String[] p = t.split(" ");
        int i = 0;
        boolean affil = false;
        if (p.length > 1 && AFFILIATIONS.contains(p[0])) {
            affil = true;
            i = 1;
        }
        if (i >= p.length || !ROLES.contains(p[i]) || (SIDE.equals(p[i]) && !affil)) {
            throw invalid(speakerNo, "form");
        }
        i++;
        if (i < p.length && ORD.matcher(p[i]).matches()) {
            i++;
        }
        if (i != p.length) {
            throw invalid(speakerNo, "form");
        }
        return t;
    }

    /** 직원 명단 이름·PII·성+직함에 걸리면 422 LABEL_INVALID{kinds}. 어휘 안에서는 걸리지 않아야 한다(단위 시험이 전 조합을 확인). */
    public static void requireClean(MinutesMasker masker, String label, int speakerNo, MinutesBudget budget) {
        Map<String, Integer> kinds = masker.check(label, budget);
        if (!kinds.isEmpty()) {
            throw new MinutesException(422, "LABEL_INVALID", "speaker_label", 0, speakerNo, kinds);
        }
    }
}
