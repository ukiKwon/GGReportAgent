package com.kbstar.kgi.ggreport.web.support;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 배점표의 합계가 총점과 맞는지 <b>레벨 그룹별로</b> 본다. 어긋나면 사유, 맞으면 null.
 * Python {@code agent/nodes/rfp_extract.scoring_consistency} 의 이관본이다.
 *
 * <p><b>LLM 성능에 기대지 않는 방어다.</b> 2026-08-04 실측에서 {@code llama3.1:8b} 는
 * 합계 96, {@code qwen3:14b} 는 <b>108</b>(총점 100 초과)을 냈다. 둘 다 분류는 맞췄고
 * 숫자만 지어냈는데, <b>모델을 키워도 같은 양상이 반복됐다</b> — 그래서 모델이 아니라
 * 규칙으로 잡는다.
 *
 * <p><b>레벨별 합산인 이유</b> — 2026-08-10 실측에서 {@code qwen3.5:9b} 가 표를
 * <b>정확히</b> 읽어 계(100)+대분류(합 100)+세부(합 100)를 평면 목록에 담았더니 전체
 * 합 300 으로 이 규칙에 걸렸다(정확한 추출이 오탐당한 첫 사례). 그래서 레벨 그룹 중
 * <b>어느 하나라도</b> 총점과 일치하면 통과한다. 기존 평면 파일은 그룹이 하나뿐이라
 * 예전과 완전히 같게 동작한다.
 *
 * <p><b>오탐을 내지 않는다</b> — 배점표가 없는 공고문(criteria 빈 목록)은 정당한
 * 결과이고, 총점을 못 뽑은 경우(0 이하)도 이 규칙이 할 말이 없다.
 * <b>경고가 한 번이라도 틀리면 그 다음부터 아무도 읽지 않는다.</b>
 */
public final class ScoringConsistency {

    private ScoringConsistency() {
    }

    /** {@code null} 은 "이상 없음"이다. */
    public static String check(JsonNode scoring) {
        if (scoring == null || scoring.isNull()) {
            return null;
        }
        List<JsonNode> criteria = new ArrayList<>();
        for (JsonNode c : scoring.path("criteria")) {
            criteria.add(c);
        }
        int total = scoring.path("total_score").asInt(0);
        if (criteria.isEmpty() || total <= 0) {
            return null;
        }

        // 레벨이 없는 행은 '단층' 한 그룹으로 묶인다(키가 null).
        Map<Integer, Integer> byLevel = new LinkedHashMap<>();
        for (JsonNode c : criteria) {
            Integer level = c.hasNonNull("level") ? Integer.valueOf(c.get("level").asInt()) : null;
            Integer got = byLevel.get(level);
            byLevel.put(level, (got == null ? 0 : got) + c.path("score").asInt(0));
        }
        for (Integer got : byLevel.values()) {
            if (got != null && got == total) {
                return null;
            }
        }

        if (byLevel.size() == 1) {
            // 평면 표(그룹 하나) — 부호로 어긋난 방향을 보여준다.
            int got = byLevel.values().iterator().next();
            return "배점 합계가 총점과 다릅니다: 항목 " + criteria.size() + "건 합 " + got
                    + "점 ≠ 총점 " + total + "점 (" + signed(got - total)
                    + ") — 공고문 표를 직접 대조해야 합니다";
        }

        List<Integer> levels = new ArrayList<>(byLevel.keySet());
        // null(레벨 없음)은 언제나 뒤로. 원본 정렬 키 `(lv is None, lv or 0)` 그대로다.
        levels.sort(Comparator
                .comparing((Integer lv) -> lv == null)
                .thenComparingInt(lv -> lv == null ? 0 : lv));
        StringBuilder sums = new StringBuilder();
        for (Integer lv : levels) {
            if (sums.length() > 0) {
                sums.append(" · ");
            }
            sums.append(label(lv)).append(" 합 ").append(byLevel.get(lv)).append("점");
        }
        return "배점 합계가 총점과 다릅니다: 항목 " + criteria.size()
                + "건, 어느 레벨도 총점과 맞지 않음 (" + sums + " ≠ 총점 " + total
                + "점) — 공고문 표를 직접 대조해야 합니다";
    }

    private static String label(Integer level) {
        if (level == null) {
            return "단층";
        }
        switch (level) {
            case 1:  return "계";
            case 2:  return "대분류";
            case 3:  return "세부";
            default: return "단층";
        }
    }

    /** 파이썬 {@code {:+d}} — 0 도 {@code +0} 이다. */
    static String signed(int value) {
        return (value >= 0 ? "+" : "") + value;
    }
}
