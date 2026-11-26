package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.web.ApiException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 대본 Word 요청의 ai_fields(AI 초안에서 온 칸 키 목록, 사용자 11-26 A-5) — 감사 기록 전용, Word 에는 표시하지 않는다.
 * 허용 키 intro·effect 만. null·빈 목록 → 빈 목록. 모르는 키·접기 전 원소 8개 초과 → 400 BAD_VALUE(key=ai_fields). 중복은 하나로.
 * ⚠️ 화면의 자기신고 — 사람이 고쳐 쓴 정도는 알 수 없다("AI 초안을 넣은 적이 있는 칸"까지만).
 * 아직 어느 컨트롤러도 부르지 않는다(6e 가 PrepController 에 연결할 때 쓴다).
 */
public final class ScriptAiFields {

    public static final List<String> KEYS = Collections.unmodifiableList(Arrays.asList("intro", "effect"));

    /** 접기 전 원소 수 상한 — 중복은 접어 받되 비정상적으로 긴 목록은 거절한다. */
    static final int MAX_RAW = 8;

    private ScriptAiFields() {
    }

    public static List<String> parse(List<String> raw) {
        if (raw == null || raw.isEmpty()) return Collections.emptyList();
        if (raw.size() > MAX_RAW) throw bad();
        Set<String> seen = new LinkedHashSet<String>();
        for (String s : raw) {
            String k = s == null ? "" : s.trim();
            if (!KEYS.contains(k)) throw bad();
            seen.add(k);
        }
        List<String> out = new ArrayList<String>();
        for (String k : KEYS) if (seen.contains(k)) out.add(k);   // 고정 순서
        return out;
    }

    /** BID_PREP_ACT.ACTION_CD — SCRIPT_DOCX_AI_INTRO(20자) · SCRIPT_DOCX_AI_EFFECT(21자) ≤ 30. */
    public static String actionOf(String key) {
        return "SCRIPT_DOCX_AI_" + key.toUpperCase(Locale.ROOT);
    }

    private static ApiException bad() {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", "BAD_VALUE");
        d.put("message", "AI 초안 표시 값이 올바르지 않습니다. 창을 닫았다가 다시 여세요.");
        d.put("key", "ai_fields");
        return ApiException.withDetail(400, d);
    }
}
