package com.kbstar.kgi.ggreport.web.boarddoc;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 옛 칸 주소표 r{행}c{그 행에서 보이는 셀의 순번}(CATALOG_VER 1)을 새 주소표 r{행id}_c{열id}로 번역하는 <b>얼린 표</b>.
 *
 * <p>⚠️ 이 상수는 <b>살아 있는 카탈로그에서 계산하지 않는다.</b> 카탈로그가 나중에 바뀌어도(예: C-3 에 열 추가)
 * 이미 저장된 옛 JSON·옛 엑셀 지도는 항상 같은 칸으로 번역돼야 하기 때문이다(같은 옛 버전 = 같은 Doc).
 * 값은 CATALOG_VER 1 카탈로그의 표별·행별 "보이는 셀 순번 → 격자 시작 열"이다. 새 버전의 번역표는 새 상수로 더하고
 * 이 상수는 고치지 않는다. 모르는 버전은 {@code null} 을 돌려줘 호출자가 닫힌 실패(저장·표시 거부)를 하게 한다.
 */
final class BoardLegacyKeys {

    private static final Pattern OLD = Pattern.compile("^r(0|[1-9][0-9]{0,3})c(0|[1-9][0-9]{0,3})$");

    /** CATALOG_VER 1: ref → [행][순번] = 격자 시작 열. */
    private static final Map<String, int[][]> V1;

    static {
        Map<String, int[][]> m = new HashMap<>();
        m.put("A", new int[][]{{0, 1, 2, 3}, {0, 1, 2, 3}, {1, 2}, {1, 2}, {1, 2, 3}});
        m.put("B", new int[][]{{0, 2, 3, 4, 5, 6, 7, 8}, {0, 1, 2, 3, 4, 5, 6, 7, 8}, {1, 2, 3, 4, 5, 6, 7, 8}});
        m.put("C-2", fullRows(9, 7));
        m.put("C-3", fullRows(6, 6));
        m.put("C-4", fullRows(4, 3));
        V1 = Collections.unmodifiableMap(m);
    }

    private BoardLegacyKeys() {
    }

    private static int[][] fullRows(int rows, int cols) {
        int[][] out = new int[rows][cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                out[r][c] = c;
            }
        }
        return out;
    }

    /** 번역표가 있는 catalog_ver 인가. 없으면 호출자는 닫힌 실패를 해야 한다. */
    static boolean supports(int catalogVer) {
        return catalogVer == 1;
    }

    /** 옛 모양(r{행}c{순번})이면 true. */
    static boolean isLegacyShape(String key) {
        return key != null && OLD.matcher(key).matches();
    }

    /** 얼린 v1 표(읽기 전용 확인용 — 테스트가 살아 있는 카탈로그와 대조한다). 모르는 표·버전은 null. */
    static int[][] frozenStarts(int catalogVer, String ref) {
        return catalogVer == 1 && ref != null ? V1.get(ref) : null;
    }

    /** 옛 key → 새 key. 모르는 버전·표·위치·모양이면 null. 입력값은 어디에도 되돌려 싣지 않는다. */
    static String toKey(int catalogVer, String ref, String oldKey) {
        int[][] starts = frozenStarts(catalogVer, ref);
        if (starts == null || oldKey == null) {
            return null;
        }
        Matcher m = OLD.matcher(oldKey);
        if (!m.matches()) {
            return null;
        }
        int row = Integer.parseInt(m.group(1));
        int seq = Integer.parseInt(m.group(2));
        if (row >= starts.length || seq >= starts[row].length) {
            return null;
        }
        return "r" + row + "_c" + starts[row][seq];
    }

    /** 옛 모양 key 를 만든다(롤백 안전용으로 옛 cells 맵을 병기할 때 쓴다). */
    static String legacyKey(int row, int seq) {
        return "r" + row + "c" + seq;
    }
}
