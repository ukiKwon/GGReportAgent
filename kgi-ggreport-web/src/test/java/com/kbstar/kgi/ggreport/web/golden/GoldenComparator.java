package com.kbstar.kgi.ggreport.web.golden;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 기대(골든)와 실제 응답을 비교하고 <b>사람이 읽을 수 있는 차이</b>를 돌려준다.
 *
 * <p>실패 메시지가 "두 JSON 이 다르다"뿐이면 25KB 짜리 응답에서 어디가 틀렸는지 찾는 데
 * 시간이 다 간다. 그래서 JSON 포인터 경로와 양쪽 값을 함께 낸다.
 *
 * <h3>무엇을 같다고 보는가</h3>
 * <ul>
 *   <li><b>배열 순서는 비교한다.</b> 목록 API 의 정렬은 화면에 그대로 보이는 계약이다.</li>
 *   <li><b>객체 키 순서는 비교하지 않는다.</b> JSON 객체는 순서 없는 자료이고 브라우저도
 *       순서에 의존하지 않는다. Python(pydantic 필드 순서)과 Java(POJO 필드 순서)가
 *       다르다는 이유로 실패시키면, 잡아야 할 진짜 차이가 소음에 묻힌다.</li>
 *   <li><b>숫자는 값으로 비교한다</b>(1 과 1.0 은 같다). 정수/실수 표기가 언어마다
 *       달라지는 것은 계약의 차이가 아니다.</li>
 * </ul>
 */
public final class GoldenComparator {

    /** 한 번에 보고할 최대 차이 개수. 넘치면 뒤는 생략한다. */
    private static final int MAX_DIFFS = 20;

    private GoldenComparator() {
    }

    /** 차이가 없으면 빈 목록. */
    public static List<String> diff(JsonNode expected, JsonNode actual) {
        List<String> out = new ArrayList<>();
        walk("", expected, actual, out);
        return out;
    }

    public static boolean matches(JsonNode expected, JsonNode actual) {
        return diff(expected, actual).isEmpty();
    }

    private static void walk(String path, JsonNode exp, JsonNode act, List<String> out) {
        if (out.size() >= MAX_DIFFS) {
            return;
        }
        String at = path.isEmpty() ? "(root)" : path;

        if (exp == null || exp.isMissingNode()) {
            if (act != null && !act.isMissingNode()) {
                out.add(at + " — 골든에 없는 값이 응답에 있다: " + brief(act));
            }
            return;
        }
        if (act == null || act.isMissingNode()) {
            out.add(at + " — 응답에 빠졌다. 기대: " + brief(exp));
            return;
        }

        if (exp.isObject() && act.isObject()) {
            Set<String> keys = new LinkedHashSet<>();
            for (Iterator<String> it = exp.fieldNames(); it.hasNext(); ) {
                keys.add(it.next());
            }
            for (Iterator<String> it = act.fieldNames(); it.hasNext(); ) {
                keys.add(it.next());
            }
            for (String k : keys) {
                walk(path + "/" + k, exp.get(k), act.get(k), out);
            }
            return;
        }

        if (exp.isArray() && act.isArray()) {
            if (exp.size() != act.size()) {
                out.add(at + " — 배열 길이가 다르다. 기대 " + exp.size()
                        + "건, 실제 " + act.size() + "건");
                // 길이가 다르면 인덱스 대조가 어긋나 소음만 늘어난다. 겹치는 만큼만 본다.
            }
            int n = Math.min(exp.size(), act.size());
            for (int i = 0; i < n; i++) {
                walk(path + "/" + i, exp.get(i), act.get(i), out);
            }
            return;
        }

        if (exp.isNumber() && act.isNumber()) {
            if (exp.decimalValue().compareTo(act.decimalValue()) != 0) {
                out.add(at + " — 기대 " + exp.asText() + " / 실제 " + act.asText());
            }
            return;
        }

        if (!exp.equals(act)) {
            out.add(at + " — 기대 " + brief(exp) + " / 실제 " + brief(act));
        }
    }

    private static String brief(JsonNode n) {
        String s = n.toString();
        return s.length() <= 200 ? s : s.substring(0, 200) + "…(" + s.length() + "자)";
    }

    /** 실패 메시지 한 덩어리로 조립한다. 차이가 없으면 null. */
    public static String describe(String snapshotName, JsonNode expected, JsonNode actual) {
        List<String> diffs = diff(expected, actual);
        if (diffs.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        sb.append("골든 불일치: ").append(snapshotName)
          .append(" (차이 ").append(diffs.size());
        if (diffs.size() >= MAX_DIFFS) {
            sb.append("건 이상 — ").append(MAX_DIFFS).append("건까지만 표시");
        } else {
            sb.append("건");
        }
        sb.append(")\n");
        for (String d : diffs) {
            sb.append("  · ").append(d).append('\n');
        }
        return sb.toString();
    }
}
