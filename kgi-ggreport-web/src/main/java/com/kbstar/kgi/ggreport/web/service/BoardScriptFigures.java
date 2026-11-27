package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 이사회 자료(양식 구조 + 저장 값)에서 발표 대본에 쓸 억원 값을 찾는다 — 표 A '재산상 이익제공 및 기부금(안)'의 출연금·예비비·합계,
 * 표 B '수익성 분석'의 명목가치 행 '순이익'. 사용자가 양식 구조를 바꿀 수 있어 칸 key 를 고정하지 않고 라벨 글자로 찾는다.
 * 못 찾거나 값이 숫자가 아니면 null(0 으로 치지 않는다). 순수 클래스 — DB 없음.
 */
final class BoardScriptFigures {

    /** 쉼표는 천 단위(3자리)일 때만, 소수는 2자리 이내. 정수부 13자리 이내. */
    private static final Pattern NUM = Pattern.compile("-?(?:[0-9]{1,3}(?:,[0-9]{3}){0,4}|[0-9]{1,13})(?:\\.[0-9]{1,2})?");

    final BigDecimal exclIt;   // 출연금 + 예비비 (둘 다 있을 때만)
    final BigDecimal total;    // 합계 칸(승인 총 금액 기준). 합계 칸이 비면 출연금+예비비+전산시스템 구축/운영비용(셋 다 있을 때만)
    final BigDecimal profit;   // 표 B 명목가치 순이익

    private BoardScriptFigures(BigDecimal exclIt, BigDecimal total, BigDecimal profit) {
        this.exclIt = exclIt;
        this.total = total;
        this.profit = profit;
    }

    static BoardScriptFigures of(BoardDocSpec.Doc doc, Map<String, Map<String, String>> values) {
        BigDecimal contrib = null;
        BigDecimal reserve = null;
        BigDecimal total = null;
        BigDecimal profit = null;
        BoardDocSpec.Table a = table(doc, "A");
        if (a != null) {
            Map<String, String> cells = cells(values, "A");
            contrib = labeled(a, cells, "출연금");
            reserve = labeled(a, cells, "예비비");
            String totalRaw = labeledRaw(a, cells, "합계");
            total = num(totalRaw);
            // 합계 칸이 '비어 있을 때만' 세 항목을 더한다. 값이 있는데 숫자 모양이 아니면(예 '9.000') 더하지 않고 null — 〔확인 필요〕
            if (total == null && (totalRaw == null || totalRaw.trim().isEmpty())) {
                BigDecimal it = labeled(a, cells, "전산시스템 구축/운영비용");
                if (contrib != null && reserve != null && it != null) {
                    total = contrib.add(reserve).add(it);
                }
            }
        }
        BoardDocSpec.Table b = table(doc, "B");
        if (b != null) {
            profit = profitOf(b, cells(values, "B"));
        }
        BigDecimal excl = contrib != null && reserve != null ? contrib.add(reserve) : null;
        return new BoardScriptFigures(excl, total, profit);
    }

    private static BoardDocSpec.Table table(BoardDocSpec.Doc doc, String id) {
        if (doc == null) {
            return null;
        }
        for (BoardDocSpec.Table t : doc.getTables()) {
            if (id.equals(t.getId())) {
                return t;
            }
        }
        return null;
    }

    private static Map<String, String> cells(Map<String, Map<String, String>> values, String ref) {
        Map<String, String> c = values == null ? null : values.get(ref);
        return c == null ? new HashMap<String, String>() : c;
    }

    /** 라벨 칸(머리·값 칸이 아닌 글자 칸)을 찾고, 같은 행에서 그 뒤 첫 값 칸의 저장 값을 숫자로 읽는다. */
    private static BigDecimal labeled(BoardDocSpec.Table t, Map<String, String> cells, String label) {
        return num(labeledRaw(t, cells, label));
    }

    /** labeled 의 글자 그대로 — 라벨·값 칸이 없거나 저장 값이 없으면 null. 비어 있음과 숫자 아님을 구분할 때 쓴다. */
    private static String labeledRaw(BoardDocSpec.Table t, Map<String, String> cells, String label) {
        for (List<BoardDocSpec.Cell> row : t.getRows()) {
            for (int i = 0; i < row.size(); i++) {
                BoardDocSpec.Cell c = row.get(i);
                if (!c.isHeader() && !c.isMapped() && !c.isInput() && label.equals(trim(c.getText()))) {
                    for (int j = i + 1; j < row.size(); j++) {
                        BoardDocSpec.Cell v = row.get(j);
                        if ((v.isMapped() || v.isInput()) && v.getKey() != null) {
                            return cells.get(v.getKey());
                        }
                    }
                    return null;
                }
            }
        }
        return null;
    }

    /** 머리 '순이익'의 열 id × 행 '명목가치'의 행 id 로 칸 key 를 만든다. */
    private static BigDecimal profitOf(BoardDocSpec.Table t, Map<String, String> cells) {
        String colId = null;
        String rowId = null;
        for (List<BoardDocSpec.Cell> row : t.getRows()) {
            for (BoardDocSpec.Cell c : row) {
                if (colId == null && c.isHeader() && "순이익".equals(trim(c.getText()))) {
                    colId = c.getColId();
                }
                if (rowId == null && !c.isHeader() && "명목가치".equals(trim(c.getText()))) {
                    rowId = c.getRowId();
                }
            }
        }
        if (colId == null || rowId == null) {
            return null;
        }
        return num(cells.get(BoardDocSpec.cellKey(rowId, colId)));
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    /** 숫자 모양(천 단위 쉼표 허용, 소수 2자리 이내)만 읽는다. 아니면 null(옛 '5.00 (1.00)' 같은 값 포함). */
    static BigDecimal num(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        return NUM.matcher(s).matches() ? new BigDecimal(s.replace(",", "")) : null;
    }
}
