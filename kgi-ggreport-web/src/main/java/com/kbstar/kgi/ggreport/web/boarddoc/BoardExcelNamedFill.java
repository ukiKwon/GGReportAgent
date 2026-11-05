package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelMap.AreaDef;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelMap.CellSpec;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelMap.Part;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelMap.TableMap;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.Located;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelResolve.RowHit;
import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellReference;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 이름·구역 형식 표 채우기. 구역은 요청당 한 번만 찾는다(Ctx 메모, 구역 ≤ 8). 부품이 비었거나 오류면 칸은 failed —
 * 0 으로 치지 않는다. 합산 후 ÷100 한 번(억원, 둘째 자리 HALF_UP).
 * 단위: 구역의 unit 은 지도에 선언한다(백만원 확정 — 사용자 2026-11-05). unit_assumed:true 로 두면 응답 assumptions 로 알린다.
 * 응답에는 업로드 글자(라벨·시트 이름)를 싣지 않는다 — 칸 값(display)과 지도 쪽 id·경로만.
 */
final class BoardExcelNamedFill {

    static final int MAX_LOOKUP_ERRORS = 20;
    static final int MAX_GRID_TABLE = 1000;
    static final int MAX_GRID_CELLS = 5000;
    static final String UNIT_TARGET = "억원";

    private BoardExcelNamedFill() { }

    static final class Ctx {
        final XlsxBook b;
        final BoardExcelMap m;
        private final Map<String, Located> located = new HashMap<>();
        private final Map<String, String> sheets = new HashMap<>();
        private final Map<String, String> units = new HashMap<>();
        private final Set<String> used = new LinkedHashSet<>();
        /** 요청 전체에서 이미 격자에 쓴 칸 수(옛 형식 표 포함). */
        int gridCells;

        Ctx(XlsxBook b, BoardExcelMap m) { this.b = b; this.m = m; }

        Located locate(String areaId) {
            Located l = located.get(areaId);
            if (l == null) {
                AreaDef d = m.area(areaId);
                String sh = d.resolveSheet(b);
                l = BoardExcelResolve.locate(b, sh == null ? d.area() : d.area().onSheet(sh));
                sheets.put(areaId, sh == null ? d.getSheets().get(0) : sh);
                located.put(areaId, l);
                used.add(areaId);
                if (l.ok() && d.isUnitInTitle()) { units.put(areaId, unitState(d, l, sheets.get(areaId))); }
            }
            return l;
        }

        String sheetName(String areaId) { return sheets.get(areaId); }

        String unitState(String areaId) { String u = units.get(areaId); return u == null ? "" : u; }

        /** 제목 행의 "(단위:XXX)" — 같으면 "", 다르면 UNIT_MISMATCH, 없으면 UNIT_UNKNOWN. */
        private String unitState(AreaDef d, Located l, String sheetName) {
            Sheet s = b.sheet(sheetName);
            Row r = s.getRow(l.titleRow);
            if (r != null) {
                for (Cell c : r) {
                    String k = BoardLabel.key(b.value(s, r.getRowNum(), c.getColumnIndex()).display);
                    if (k.startsWith("(단위:") && k.endsWith(")")) {
                        return BoardLabel.key(d.getUnit()).equals(k.substring(4, k.length() - 1)) ? "" : "UNIT_MISMATCH";
                    }
                }
            }
            return "UNIT_UNKNOWN";
        }

        List<Map<String, Object>> assumptions() {
            List<Map<String, Object>> out = new ArrayList<>();
            for (String id : used) {
                AreaDef d = m.area(id);
                if (d.isUnitAssumed()) {
                    Map<String, Object> a = new LinkedHashMap<>();
                    a.put("code", "UNIT_ASSUMED"); a.put("area", id); a.put("unit", d.getUnit()); a.put("confirmed", false);
                    out.add(a);
                }
            }
            return out;
        }
    }

    static final class Result {
        Map<String, Object> table;
        Map<String, Object> source;
    }

    private static final class Acc {
        final List<Map<String, Object>> lookup = new ArrayList<>();
        final Set<String> seen = new HashSet<>();
        final Set<Integer> usedCols = new HashSet<>();
        final Set<Integer> usedRows = new HashSet<>();
        String sheet;
        int minRow = Integer.MAX_VALUE, maxRow = -1, maxCol = -1;
        /** 구분(라벨) 열 범위의 끝 — 사용한 구역들의 첫 값 열 중 가장 큰 것. 이 열보다 왼쪽은 행 이름을 보이려고 격자에 싣는다. */
        int labelLimit;

        void lookup(String area, String rowId, String code, String expected, int found, int row) {
            if (seen.add(area + "." + rowId + ":" + code) && lookup.size() < MAX_LOOKUP_ERRORS) {
                Map<String, Object> m = new LinkedHashMap<>();   // 업로드 글자 없음: 지도 쪽 id·기대 경로·후보 수·1-기준 행
                m.put("area", area); m.put("row_id", rowId); m.put("code", code);
                m.put("expected", expected); m.put("found", rowId == null ? null : (Object) found); m.put("row", row);
                lookup.add(m);
            }
        }

        void touch(String sh, int row, int col, int areaLabelLimit) {
            if (sheet == null) { sheet = sh; }
            if (sh.equals(sheet)) {
                minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row); maxCol = Math.max(maxCol, col);
                usedCols.add(col); usedRows.add(row);
                labelLimit = Math.max(labelLimit, areaLabelLimit);
            }
        }
    }

    private static final class Eval {
        final String key;
        String value = "", status = "failed", reason, mainValue, subValue;
        boolean lookup, review;
        BigDecimal eok;
        Map<String, Object> convert;
        final List<Map<String, Object>> parts = new ArrayList<>();
        final Set<String> warn = new LinkedHashSet<>();

        Eval(String key) { this.key = key; }

        void fail(String code, boolean lk) { if (reason == null) { reason = code; } lookup |= lk; }
    }

    /**
     * 양식(dt)에 <b>아직 연결로 남아 있는</b> 칸만 평가한다 — 사용자가 지운 행·열의 칸은 건너뛰고 unlinked_count 로만 알린다.
     * derive_sum 은 남은 of 만 합산하고(하나도 없으면 manual), 합계 범위 안에 사용자가 추가한 입력 칸이 있으면
     * sums.of 에 포함하고 SUM_HAS_MANUAL_PARTS 경고 + review 로 둔다(서버는 그 칸의 값을 모른다).
     */
    static Result table(Ctx c, TableMap t, BoardDocSpec.Table dt) {
        Set<String> present = BoardDocSpec.mappedKeys(dt);
        Acc acc = new Acc();
        Map<String, Eval> evals = new LinkedHashMap<>();
        int unlinked = 0;
        for (CellSpec sp : t.getSpecs().values()) {
            if (present.contains(sp.key)) { evals.put(sp.key, eval(c, sp, acc)); } else { unlinked++; }
        }
        Map<String, List<String>> manualParts = new HashMap<>();
        Map<String, List<String>> restOf = new HashMap<>();
        for (CellSpec sp : t.getSpecs().values()) {
            if ("derive_sum".equals(sp.op) && evals.containsKey(sp.key)) {
                List<String> rest = new ArrayList<>();
                for (String k : sp.of) { if (evals.containsKey(k)) { rest.add(k); } }
                restOf.put(sp.key, rest);
                manualParts.put(sp.key, BoardExcelFill.manualParts(dt, sp.key, rest));
                derive(evals.get(sp.key), sp, rest, manualParts.get(sp.key), evals);
            }
        }
        int evaluable = 0, lookupFails = 0;
        List<Map<String, Object>> cells = new ArrayList<>();
        for (CellSpec sp : t.getSpecs().values()) {
            Eval e = evals.get(sp.key);
            if (e == null) { continue; }
            if (!"manual".equals(sp.op) && !"derive_sum".equals(sp.op)) { evaluable++; if (e.lookup) { lookupFails++; } }
            cells.add(toCell(e));
        }
        String state = lookupFails == 0 ? "ok" : lookupFails == evaluable ? "failed" : "partial";
        Map<String, Object> tm = new LinkedHashMap<>();
        tm.put("ref", t.getRef()); tm.put("label_state", state); tm.put("needs_review", !"ok".equals(state));
        tm.put("label_mismatches", new ArrayList<Object>());      // 머리글 대조는 옛 형식 전용 — 새 형식은 lookup_errors
        tm.put("lookup_errors", acc.lookup);
        tm.put("cells", cells);
        tm.put("unlinked_count", unlinked);
        List<Map<String, Object>> sumRel = new ArrayList<>();
        for (BoardExcelMap.Sum sm : t.getSums()) {
            List<String> rest = restOf.get(sm.getTotal());
            if (rest == null || rest.isEmpty()) { continue; }       // 합계 칸이 없거나 남은 부품이 없다
            Map<String, Object> sr = new LinkedHashMap<>();
            List<String> of = new ArrayList<>(rest);
            of.addAll(manualParts.get(sm.getTotal()));
            sr.put("total", sm.getTotal()); sr.put("of", of); sumRel.add(sr);
        }
        tm.put("sums", sumRel);
        Result r = new Result();
        r.table = tm; r.source = source(c, t, acc);
        return r;
    }

    private static Eval eval(Ctx c, CellSpec sp, Acc acc) {
        Eval e = new Eval(sp.key);
        if ("manual".equals(sp.op)) { e.status = "manual"; e.reason = "MANUAL_INPUT"; return e; }
        if ("derive_sum".equals(sp.op)) { return e; }
        boolean numeric = !"plain".equals(sp.op);
        List<BigDecimal> mainN = new ArrayList<>();
        List<BigDecimal> subN = new ArrayList<>();
        for (Part p : sp.main) { collect(c, p, "main", e, mainN, acc, numeric); }
        for (Part p : sp.sub) { collect(c, p, "sub", e, subN, acc, true); }
        if (e.reason == null) {
            if ("plain".equals(sp.op)) {
                e.value = String.valueOf(e.parts.get(0).get("display"));
            } else {
                BigDecimal total = BoardNumber.sum(mainN);
                e.eok = BoardNumber.eokValue(total);
                String main = BoardNumber.format(e.eok);
                Map<String, Object> cv = new LinkedHashMap<>();
                cv.put("kind", "paren".equals(sp.op) ? "eok_paren" : "eok");
                cv.put("unit_from", c.m.area(sp.main.get(0).area).getUnit()); cv.put("unit_to", UNIT_TARGET);
                cv.put("divisor", 100); cv.put("sum", BoardExcelFill.plain(total));
                cv.put("rounding", "HALF_UP_2"); cv.put("of", null);
                if ("paren".equals(sp.op)) {
                    BigDecimal st = BoardNumber.sum(subN);
                    e.mainValue = main; e.subValue = BoardNumber.format(BoardNumber.eokValue(st));
                    e.value = BoardNumber.paren(e.mainValue, e.subValue);
                    cv.put("sub_sum", BoardExcelFill.plain(st));
                } else {
                    e.value = main; cv.put("sub_sum", null);
                }
                cv.put("result", e.value);
                e.convert = cv;
            }
        }
        e.status = e.reason != null ? "failed" : e.review ? "review" : "filled";
        if (e.reason != null) { e.value = ""; e.mainValue = null; e.subValue = null; e.eok = null; e.convert = null; }
        return e;
    }

    private static void collect(Ctx c, Part p, String role, Eval e, List<BigDecimal> nums, Acc acc, boolean numeric) {
        AreaDef d = c.m.area(p.area);
        Located l = c.locate(p.area);
        if (!l.ok()) { e.fail(l.error, true); acc.lookup(p.area, null, l.error, l.ref, 0, l.row); return; }
        RowHit h = l.rows.get(p.row);
        if (h.error != null) { e.fail(h.error, true); acc.lookup(p.area, p.row, h.error, d.rowText(p.row), h.found, 0); return; }
        String sheetName = c.sheetName(p.area);
        Sheet s = c.b.sheet(sheetName);
        int col = l.cols.get(p.col);
        int labelLimit = Integer.MAX_VALUE;
        for (Integer cc : l.cols.values()) { labelLimit = Math.min(labelLimit, cc); }
        String unit = c.unitState(p.area);
        for (Integer rn : h.rows) {
            XlsxBook.Value v = c.b.value(s, rn, col);
            String shown = v.display.trim();
            String why = v.problem != null ? v.problem : shown.isEmpty() ? "PART_EMPTY"
                    : shown.length() > BoardDocSpec.MAX_CELL ? "TOO_LONG" : null;
            BigDecimal num = null;
            if (why == null && numeric) {
                num = v.numeric ? BoardExcelFill.rawDecimal(v) : BoardExcelFill.shownNum(v.display);
                if (num == null) { why = "NOT_NUMERIC"; } else if (!v.numeric) { e.warn.add("TEXT_NUMBER"); }
            }
            Map<String, Object> part = new LinkedHashMap<>();
            part.put("role", role); part.put("sheet", sheetName);
            part.put("cell", new CellReference(rn, col).formatAsString());
            part.put("display", why == null ? shown : "");
            BigDecimal raw = why == null ? BoardExcelFill.rawDecimal(v) : null;
            if (raw == null) {
                part.put("raw", null); part.put("rounded", null);
            } else {
                part.put("raw", BoardExcelFill.plain(raw));
                BigDecimal sn = BoardExcelFill.shownNum(shown);
                part.put("rounded", sn == null ? null : (Object) (sn.compareTo(raw) != 0));
            }
            e.parts.add(part);
            if (why != null) { e.fail(why, false); } else if (numeric) { nums.add(num); }
            acc.touch(sheetName, rn, col, labelLimit);
            if (l.sheetHidden) { e.warn.add("HIDDEN_SHEET"); }
            if (h.hidden || l.titleHidden || l.headerHidden) { e.warn.add("HIDDEN_ROW"); }
            if (l.hiddenCols.contains(p.col)) { e.warn.add("HIDDEN_COLUMN"); }
            if (v.hiddenFormat) { e.warn.add("HIDDEN_FORMAT"); }
            if (c.b.hasExternalRef(s, rn, col)) { e.warn.add("EXTERNAL_REF"); }
            if ("UNIT_MISMATCH".equals(unit)) { e.warn.add("UNIT_MISMATCH"); e.review = true; }
            else if ("UNIT_UNKNOWN".equals(unit)) { e.warn.add("UNIT_UNKNOWN"); }
        }
    }

    /**
     * A 합계 — 표시값(억원 둘째 자리)의 합. 남은 부품(rest)만 합산한다. 하나라도 실패·직접입력이면 failed,
     * 남은 부품이 하나도 없으면 manual(사용자가 직접 입력). 합계 범위 안에 사용자 입력 칸(manual)이 있으면 경고 + review.
     */
    private static void derive(Eval e, CellSpec sp, List<String> rest, List<String> manual, Map<String, Eval> evals) {
        if (rest.isEmpty()) { e.status = "manual"; e.reason = "MANUAL_INPUT"; return; }
        BigDecimal acc = BigDecimal.ZERO;
        boolean ok = true;
        for (String k : rest) {
            Eval x = evals.get(k);
            if (x.eok == null) { ok = false; } else { acc = acc.add(x.eok); e.review |= x.review; }
        }
        if (!ok) { e.fail("PART_FAILED", false); e.status = "failed"; return; }
        if (!manual.isEmpty()) { e.warn.add("SUM_HAS_MANUAL_PARTS"); e.review = true; }
        e.value = BoardNumber.format(acc);
        Map<String, Object> cv = new LinkedHashMap<>();
        cv.put("kind", "display_sum"); cv.put("unit_from", UNIT_TARGET); cv.put("unit_to", UNIT_TARGET);
        cv.put("divisor", null); cv.put("sum", BoardExcelFill.plain(acc)); cv.put("sub_sum", null);
        cv.put("rounding", "HALF_UP_2"); cv.put("of", new ArrayList<>(rest)); cv.put("result", e.value);
        e.convert = cv;
        e.status = e.review ? "review" : "filled";
    }

    private static Map<String, Object> toCell(Eval e) {
        Map<String, Object> src = new LinkedHashMap<>();
        if (e.parts.isEmpty()) {
            src.put("sheet", null); src.put("cell", null); src.put("display", ""); src.put("raw", null); src.put("rounded", null);
        } else {
            src.putAll(e.parts.get(0)); src.remove("role");
        }
        List<Map<String, Object>> w = new ArrayList<>();
        for (String code : e.warn) { Map<String, Object> m = new LinkedHashMap<>(); m.put("code", code); w.add(m); }
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("key", e.key); c.put("value", e.value); c.put("status", e.status); c.put("reason", e.reason);
        c.put("source", src); c.put("warnings", w);
        c.put("parts", e.parts); c.put("part_count", e.parts.size()); c.put("convert", e.convert);
        c.put("main_value", e.mainValue); c.put("sub_value", e.subValue);
        return c;
    }

    /**
     * 사용한 칸의 외접 사각형(열은 A 부터). 표당·요청당 상한을 넘거나 열이 너무 넓으면 omitted:true 로 격자 없이 알린다.
     * 격자에는 지도가 읽은 열과 행 이름(구분) 열만 싣고, 그 밖의 열·숨은 행의 값은 ""로 가린다.
     */
    private static Map<String, Object> source(Ctx c, TableMap t, Acc acc) {
        Map<String, Object> src = new LinkedHashMap<>();
        src.put("ref", t.getRef());
        CellRangeAddress range = acc.sheet == null ? null : new CellRangeAddress(acc.minRow, acc.maxRow, 0, acc.maxCol);
        long n = range == null ? 0L : (long) (acc.maxRow - acc.minRow + 1) * (acc.maxCol + 1);
        boolean fits = range != null && acc.maxCol < XlsxBook.MAX_INDEX_COLS
                && n <= MAX_GRID_TABLE && (long) c.gridCells + n <= MAX_GRID_CELLS;
        if (fits) {
            c.gridCells += (int) n;
            Sheet s = c.b.sheet(acc.sheet);
            Set<Integer> show = new HashSet<>(acc.usedCols);
            for (int col = 0; col < acc.labelLimit && col <= acc.maxCol; col++) {
                if (!s.isColumnHidden(col)) { show.add(col); }
            }
            src.putAll(c.b.grid(acc.sheet, range, show, acc.usedRows));
            src.put("omitted", false);
        } else {
            src.put("sheet", acc.sheet); src.put("range", range == null ? null : range.formatAsString());
            src.put("first_row", range == null ? 0 : range.getFirstRow() + 1);
            src.put("cols", new ArrayList<Object>()); src.put("rows", new ArrayList<Object>()); src.put("merges", new ArrayList<Object>());
            src.put("omitted", true);
        }
        return src;
    }
}
