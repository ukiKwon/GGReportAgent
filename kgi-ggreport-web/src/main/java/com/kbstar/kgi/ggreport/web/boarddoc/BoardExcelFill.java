package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellReference;

import java.math.BigDecimal;
import java.util.*;

/** 구조 검사(머리글 라벨) → 값 채우기(캐시값) → 합계 주의. 개인정보 검사는 이 앞에서 끝났다(호출자 몫). */
public final class BoardExcelFill {

    static final int MAX_REASONS = 20;
    static final int ACTUAL_CLIP = 40;

    private BoardExcelFill() {
    }

    public static List<Map<String, Object>> structure(XlsxBook b, BoardExcelMap m, List<String> refs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String ref : refs) {
            BoardExcelMap.TableMap t = m.table(ref);
            Sheet s = b.sheet(t.getSheet());
            if (s == null) {
                out.add(reason(ref, t.getSheet(), null, null, null));
                continue;
            }
            for (Map.Entry<String, String> l : t.getLabels().entrySet()) {
                CellReference c = new CellReference(l.getKey());
                String actual = norm(b.value(s, c.getRow(), c.getCol()).display);
                if (!norm(l.getValue()).equals(actual)) {
                    out.add(reason(ref, t.getSheet(), l.getKey(), l.getValue(),
                            actual.length() > ACTUAL_CLIP ? actual.substring(0, ACTUAL_CLIP) : actual));
                }
                if (out.size() >= MAX_REASONS) {
                    return out;
                }
            }
        }
        return out;
    }

    public static Map<String, Object> fill(XlsxBook b, BoardExcelMap m, BoardDocSpec.Doc doc) {
        List<Map<String, Object>> tables = new ArrayList<>();
        List<Map<String, Object>> sources = new ArrayList<>();
        List<String> unmapped = new ArrayList<>();
        int total = 0, filled = 0, failed = 0, warns = 0;
        for (BoardDocSpec.Table dt : doc.getTables()) {
            BoardExcelMap.TableMap t = m.table(dt.getId());
            if (t == null) {
                unmapped.add(dt.getId());
                continue;
            }
            Sheet s = b.sheet(t.getSheet());
            boolean hiddenSheet = b.isHidden(s);
            Map<String, XlsxBook.Value> vals = new HashMap<>();
            Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
            for (Map.Entry<String, CellReference> e : t.getCells().entrySet()) {
                CellReference at = e.getValue();
                XlsxBook.Value v = b.value(s, at.getRow(), at.getCol());
                vals.put(e.getKey(), v);
                String shown = v.display.trim();
                String reason = v.problem != null ? v.problem : shown.isEmpty() ? "EMPTY"
                        : shown.length() > BoardDocSpec.MAX_CELL ? "TOO_LONG" : null;
                List<Map<String, Object>> w = new ArrayList<>();
                if (hiddenSheet) w.add(code("HIDDEN_SHEET"));
                if (XlsxBook.rowHidden(s, at.getRow())) w.add(code("HIDDEN_ROW"));
                if (s.isColumnHidden(at.getCol())) w.add(code("HIDDEN_COLUMN"));
                Map<String, Object> source = new LinkedHashMap<>();
                source.put("sheet", t.getSheet());
                source.put("cell", at.formatAsString());
                source.put("display", reason == null ? shown : "");
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("key", e.getKey());
                c.put("value", reason == null ? shown : "");
                c.put("status", reason == null ? "filled" : "failed");
                c.put("reason", reason);
                c.put("source", source);
                c.put("warnings", w);
                byKey.put(e.getKey(), c);
            }
            for (BoardExcelMap.Sum sm : t.getSums()) {
                BigDecimal acc = BigDecimal.ZERO;
                boolean ok = true;
                for (String k : sm.getOf()) {
                    BigDecimal x = num(vals.get(k));
                    ok &= x != null;
                    acc = x == null ? acc : acc.add(x);
                }
                BigDecimal tot = num(vals.get(sm.getTotal()));
                if (ok && tot != null && acc.compareTo(tot) != 0) {
                    Map<String, Object> w = code("SUM_MISMATCH");
                    w.put("expected", acc.toPlainString());
                    warnings(byKey.get(sm.getTotal())).add(w);
                }
            }
            for (Map<String, Object> c : byKey.values()) {
                total++;
                if ("filled".equals(c.get("status"))) filled++; else failed++;
                warns += warnings(c).size();
            }
            Map<String, Object> tm = new LinkedHashMap<>();
            tm.put("ref", t.getRef());
            tm.put("cells", new ArrayList<>(byKey.values()));
            tables.add(tm);
            Map<String, Object> src = new LinkedHashMap<>();
            src.put("ref", t.getRef());
            src.putAll(b.grid(t.getSheet(), t.getRange()));
            sources.add(src);
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", total);
        summary.put("filled", filled);
        summary.put("failed", failed);
        summary.put("warnings", warns);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("tables", tables);
        out.put("sources", sources);
        out.put("unmapped_tables", unmapped);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> warnings(Map<String, Object> cell) {
        return (List<Map<String, Object>>) cell.get("warnings");
    }

    private static BigDecimal num(XlsxBook.Value v) {
        if (v == null || v.problem != null || v.raw.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(v.raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Map<String, Object> code(String c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", c);
        return m;
    }

    private static Map<String, Object> reason(String ref, String sheet, String cell, String expected, String actual) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ref", ref);
        m.put("code", cell == null ? "SHEET_MISSING" : "LABEL_MISMATCH");
        m.put("sheet", sheet);
        m.put("cell", cell);
        m.put("expected", expected);
        m.put("actual", actual);
        return m;
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ");
    }
}
