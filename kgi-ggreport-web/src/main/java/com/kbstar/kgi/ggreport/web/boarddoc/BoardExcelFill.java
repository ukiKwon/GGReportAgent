package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellReference;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 시트 존재 검사 → 머리글(라벨) 대조 → 값 채우기(캐시값) → 합계 주의(표시값 기준).
 * 개인정보 검사는 이 앞에서 끝났다(호출자 몫).
 *
 * <p>머리글 대조(C1): 표마다 머리글 칸 중 절반 이상(불일치 수 * 2 &gt;= 라벨 수)이 어떤 별칭과도 다르면 그 표는
 * {@code label_state="failed"} — 모든 칸을 failed/LABEL_MISMATCH/빈값으로 두고 값을 싣지 않는다.
 * 일부만 다르면 {@code "partial"} — 값은 채우되 칸 status 를 {@code "review"}로 두고 filled 에 세지 않는다.
 */
public final class BoardExcelFill {

    static final int MAX_REASONS = 20;
    static final int MAX_LABEL_REPORT = 10;
    static final int ACTUAL_CLIP = 40;
    static final int RAW_SCALE = 6;
    static final int RAW_MAX_LEN = 40;

    /** 정규식 통과 뒤에만 BigDecimal 로 바꾼다(C3) — 자릿수 상한으로 지수·거대 값을 막는다. */
    private static final Pattern RAW_NUM = Pattern.compile("-?\\d{1,40}(\\.\\d{1,40})?");
    private static final Pattern SHOWN_NUM = Pattern.compile("[-+]?\\d{1,30}(\\.\\d{1,15})?");

    private BoardExcelFill() {
    }

    /** 시트가 없는 표만 구조 오류로 본다(머리글 불일치는 {@link #fill} 이 표 단위로 처리). */
    public static List<Map<String, Object>> structure(XlsxBook b, BoardExcelMap m, List<String> refs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String ref : refs) {
            BoardExcelMap.TableMap t = m.table(ref);
            if (t.isNamed()) {                                  // 구역마다 시트 별칭 중 하나가 있어야 한다
                for (String id : t.getAreaIds()) {
                    BoardExcelMap.AreaDef d = m.area(id);
                    if (d.resolveSheet(b) == null) {
                        Map<String, Object> r = new LinkedHashMap<>();
                        r.put("ref", ref);
                        r.put("code", "SHEET_MISSING");
                        r.put("sheet", d.getSheets().get(0));
                        out.add(r);
                        break;
                    }
                }
                if (out.size() >= MAX_REASONS) {
                    return out;
                }
                continue;
            }
            if (b.sheet(t.getSheet()) == null) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("ref", ref);
                r.put("code", "SHEET_MISSING");
                r.put("sheet", t.getSheet());
                out.add(r);
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
        int total = 0, filled = 0, review = 0, failed = 0, manual = 0, warns = 0, labelTables = 0;
        BoardExcelNamedFill.Ctx ctx = new BoardExcelNamedFill.Ctx(b, m);     // 구역 찾기 결과는 요청당 한 번씩만
        for (BoardDocSpec.Table dt : doc.getTables()) {
            BoardExcelMap.TableMap t = m.table(dt.getId());
            if (t == null) {
                unmapped.add(dt.getId());
                continue;
            }
            if (t.isNamed()) {
                BoardExcelNamedFill.Result nr = BoardExcelNamedFill.table(ctx, t, dt);
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> cs = (List<Map<String, Object>>) nr.table.get("cells");
                for (Map<String, Object> cc : cs) {
                    total++;
                    Object st = cc.get("status");
                    if ("filled".equals(st)) filled++; else if ("review".equals(st)) review++;
                    else if ("manual".equals(st)) manual++; else failed++;
                    warns += warnings(cc).size();
                }
                if (Boolean.TRUE.equals(nr.table.get("needs_review"))) {
                    labelTables++;
                }
                tables.add(nr.table);
                sources.add(nr.source);
                continue;
            }
            Sheet s = b.sheet(t.getSheet());
            boolean hiddenSheet = b.isHidden(s);

            // 머리글 대조
            List<Map<String, Object>> mismatches = new ArrayList<>();
            int mismatchCount = 0;
            for (Map.Entry<String, List<String>> l : t.getLabels().entrySet()) {
                CellReference lc = new CellReference(l.getKey());
                String actual = BoardExcelMap.norm(b.value(s, lc.getRow(), lc.getCol()).display);
                boolean match = false;
                for (String alias : l.getValue()) {
                    match |= BoardExcelMap.norm(alias).equals(actual);
                }
                if (!match) {
                    mismatchCount++;
                    if (mismatches.size() < MAX_LABEL_REPORT) {
                        Map<String, Object> mm = code("LABEL_MISMATCH");
                        mm.put("cell", l.getKey());
                        mm.put("expected", l.getValue().get(0));
                        mm.put("actual", actual.length() > ACTUAL_CLIP ? actual.substring(0, ACTUAL_CLIP) : actual);
                        mismatches.add(mm);
                    }
                }
            }
            String labelState = mismatchCount == 0 ? "ok"
                    : mismatchCount * 2 >= t.getLabels().size() ? "failed" : "partial";
            boolean needsReview = !"ok".equals(labelState);
            if (needsReview) {
                labelTables++;
            }

            Map<String, XlsxBook.Value> vals = new HashMap<>();
            Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
            Set<String> present = BoardDocSpec.mappedKeys(dt);      // 양식에 연결로 남아 있는 칸만 읽는다
            int unlinked = 0;
            for (Map.Entry<String, CellReference> e : t.getCells().entrySet()) {
                if (!present.contains(e.getKey())) {
                    unlinked++;
                    continue;
                }
                CellReference at = e.getValue();
                XlsxBook.Value v = b.value(s, at.getRow(), at.getCol());
                vals.put(e.getKey(), v);
                String shown = v.display.trim();
                String reason = "failed".equals(labelState) ? "LABEL_MISMATCH"
                        : v.problem != null ? v.problem : shown.isEmpty() ? "EMPTY"
                        : shown.length() > BoardDocSpec.MAX_CELL ? "TOO_LONG" : null;
                List<Map<String, Object>> w = new ArrayList<>();
                if (hiddenSheet) w.add(code("HIDDEN_SHEET"));
                if (XlsxBook.rowHidden(s, at.getRow())) w.add(code("HIDDEN_ROW"));
                if (s.isColumnHidden(at.getCol())) w.add(code("HIDDEN_COLUMN"));
                if (v.hiddenFormat) w.add(code("HIDDEN_FORMAT"));
                if (needsReview) w.add(code("LABEL_MISMATCH"));
                Map<String, Object> source = new LinkedHashMap<>();
                source.put("sheet", t.getSheet());
                source.put("cell", at.formatAsString());
                source.put("display", reason == null ? shown : "");
                BigDecimal raw = reason == null ? rawDecimal(v) : null;
                if (raw == null) {
                    source.put("raw", null);
                    source.put("rounded", null);
                } else {
                    source.put("raw", plain(raw));
                    BigDecimal sn = shownNum(shown);
                    source.put("rounded", sn == null ? null : (Object) (sn.compareTo(raw) != 0));
                }
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("key", e.getKey());
                c.put("value", reason == null ? shown : "");
                c.put("status", reason != null ? "failed" : "partial".equals(labelState) ? "review" : "filled");
                c.put("reason", reason);
                c.put("source", source);
                c.put("warnings", w);
                Map<String, Object> p0 = new LinkedHashMap<>();         // 새 형식 칸과 같은 키를 갖게 한다
                p0.put("role", "main");
                p0.putAll(source);
                c.put("parts", new ArrayList<>(java.util.Collections.singletonList(p0)));
                c.put("part_count", 1);
                c.put("convert", null);
                c.put("main_value", null);
                c.put("sub_value", null);
                byKey.put(e.getKey(), c);
            }
            Map<String, List<String>> sumOf = new LinkedHashMap<>();   // 합계 칸 → 남은 부품 + 합계 범위의 사용자 입력 칸
            Set<String> sumPartial = new HashSet<>();                  // 부품이 줄었거나 사용자 입력 칸이 끼어 엑셀 합계와 비교할 수 없는 합계
            for (BoardExcelMap.Sum sm : t.getSums()) {
                List<String> rest = new ArrayList<>();
                for (String k : sm.getOf()) {
                    if (byKey.containsKey(k)) {
                        rest.add(k);
                    }
                }
                if (!byKey.containsKey(sm.getTotal()) || rest.isEmpty()) {
                    continue;
                }
                List<String> typed = manualParts(dt, sm.getTotal(), rest);
                List<String> all = new ArrayList<>(rest);
                all.addAll(typed);
                sumOf.put(sm.getTotal(), all);
                if (rest.size() != sm.getOf().size() || !typed.isEmpty()) {
                    sumPartial.add(sm.getTotal());
                }
                if (!typed.isEmpty()) {
                    Map<String, Object> tc = byKey.get(sm.getTotal());
                    warnings(tc).add(code("SUM_HAS_MANUAL_PARTS"));
                    if ("filled".equals(tc.get("status"))) {
                        tc.put("status", "review");
                    }
                }
            }
            if (!"failed".equals(labelState)) {                // failed 표는 검산하지 않는다
                for (BoardExcelMap.Sum sm : t.getSums()) {
                    if (!sumOf.containsKey(sm.getTotal()) || sumPartial.contains(sm.getTotal())) {
                        continue;                              // 부품을 지웠거나 입력 칸이 끼면 엑셀 합계와 맞지 않는 게 당연하다
                    }
                    BigDecimal acc = BigDecimal.ZERO;
                    boolean ok = true;
                    for (String k : sm.getOf()) {
                        BigDecimal x = shownOf(vals.get(k));
                        ok &= x != null;
                        acc = x == null ? acc : acc.add(x);
                    }
                    BigDecimal tot = shownOf(vals.get(sm.getTotal()));
                    if (ok && tot != null && acc.compareTo(tot) != 0) {
                        Map<String, Object> w = code("SUM_MISMATCH");
                        w.put("basis", "display");
                        w.put("expected", plain(acc));
                        w.put("actual", plain(tot));
                        w.put("diff", plain(tot.subtract(acc)));
                        warnings(byKey.get(sm.getTotal())).add(w);
                    }
                }
            }
            for (Map<String, Object> c : byKey.values()) {
                total++;
                Object st = c.get("status");
                if ("filled".equals(st)) filled++; else if ("review".equals(st)) review++; else failed++;
                for (Map<String, Object> wn : warnings(c)) {      // 머리글 주의는 label_mismatch_tables 로 센다
                    if (!"LABEL_MISMATCH".equals(wn.get("code"))) {
                        warns++;
                    }
                }
            }
            Map<String, Object> tm = new LinkedHashMap<>();
            tm.put("ref", t.getRef());
            tm.put("label_state", labelState);
            tm.put("needs_review", needsReview);
            tm.put("label_mismatches", mismatches);
            tm.put("cells", new ArrayList<>(byKey.values()));
            tm.put("unlinked_count", unlinked);
            List<Map<String, Object>> sumRel = new ArrayList<>();     // 칸 key 기준 합계 관계(프런트 재검산용)
            for (Map.Entry<String, List<String>> sm : sumOf.entrySet()) {
                Map<String, Object> sr = new LinkedHashMap<>();
                sr.put("total", sm.getKey());
                sr.put("of", new ArrayList<>(sm.getValue()));
                sumRel.add(sr);
            }
            tm.put("sums", sumRel);
            tables.add(tm);
            Map<String, Object> src = new LinkedHashMap<>();
            src.put("ref", t.getRef());
            src.putAll(b.grid(t.getSheet(), t.getRange()));
            src.put("omitted", false);
            ctx.gridCells += t.getRange().getNumberOfCells();     // 옛 형식 격자도 요청 전체 예산에 포함
            sources.add(src);
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", total);
        summary.put("filled", filled);
        summary.put("review", review);
        summary.put("failed", failed);
        summary.put("manual", manual);
        summary.put("warnings", warns);
        summary.put("label_mismatch_tables", labelTables);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("assumptions", ctx.assumptions());
        out.put("summary", summary);
        out.put("tables", tables);
        out.put("sources", sources);
        out.put("unmapped_tables", unmapped);
        return out;
    }

    /**
     * 합계 칸(totalKey)의 합계 범위 — 남은 부품(rest) 중 최상단 행부터 합계 바로 위 행까지 — 에서
     * 합계와 같은 열에 있는 <b>사용자 직접 입력 칸</b>(input &amp;&amp; !mapped)의 key 목록(표 순서). 범위를 못 찾으면 빈 목록.
     * 서버는 이 칸들의 값을 모르므로 합계 칸을 review 로 두고 sums.of 에 실어 화면이 다시 계산하게 한다.
     */
    static List<String> manualParts(BoardDocSpec.Table dt, String totalKey, List<String> rest) {
        int totalRow = -1;
        String totalCol = null;
        int top = Integer.MAX_VALUE;
        Set<String> restSet = new HashSet<>(rest);
        for (int r = 0; r < dt.getRows().size(); r++) {
            for (BoardDocSpec.Cell c : dt.getRows().get(r)) {
                if (totalKey.equals(c.getKey())) {
                    totalRow = r;
                    totalCol = c.getColId();
                }
                if (restSet.contains(c.getKey())) {
                    top = Math.min(top, r);
                }
            }
        }
        List<String> out = new ArrayList<>();
        if (totalRow < 0 || top == Integer.MAX_VALUE || top >= totalRow) {
            return out;
        }
        for (int r = top; r < totalRow; r++) {
            for (BoardDocSpec.Cell c : dt.getRows().get(r)) {
                if (totalCol.equals(c.getColId()) && c.isInput() && !c.isMapped()) {
                    out.add(c.getKey());
                }
            }
        }
        return out;
    }

    /** fill 결과에서 머리글 주의가 필요한 표의 ref 목록(최상위 경고용). */
    @SuppressWarnings("unchecked")
    public static List<String> labelMismatchRefs(Map<String, Object> filled) {
        List<String> refs = new ArrayList<>();
        for (Map<String, Object> t : (List<Map<String, Object>>) filled.get("tables")) {
            if (Boolean.TRUE.equals(t.get("needs_review"))) {
                refs.add(String.valueOf(t.get("ref")));
            }
        }
        return refs;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> warnings(Map<String, Object> cell) {
        return (List<Map<String, Object>>) cell.get("warnings");
    }

    /** 합계 검산용 — 문제 없는 칸의 표시값을 숫자로. 읽을 수 없으면 null(검산 생략). */
    private static BigDecimal shownOf(XlsxBook.Value v) {
        return v == null || v.problem != null ? null : shownNum(v.display);
    }

    /**
     * 숫자 셀의 원값 — 소수 6자리 HALF_UP. 숫자 셀이 아니거나 읽을 수 없거나 40자를 넘으면 null.
     * 소수 6자리 한계, 날짜 서식은 일련번호 — 프런트는 rounded=null이면 raw를 숫자 원값으로만 취급.
     * 정규식을 통과한 뒤에만 BigDecimal 로 바꾸고 예외는 null 로 삼킨다(셀 값을 로그·메시지에 쓰지 않는다).
     */
    static BigDecimal rawDecimal(XlsxBook.Value v) {
        if (v == null || !v.numeric || v.problem != null || v.raw == null || !RAW_NUM.matcher(v.raw).matches()) {
            return null;
        }
        try {
            BigDecimal d = new BigDecimal(v.raw).setScale(RAW_SCALE, RoundingMode.HALF_UP);
            return plain(d).length() > RAW_MAX_LEN ? null : d;
        } catch (NumberFormatException | ArithmeticException e) {
            return null;
        }
    }

    /**
     * 표시값 → 숫자. 쉼표·공백 제거, {@code (1,234)}·{@code △}·{@code ▲} 는 음수. 단위·% 등이 붙으면 null.
     */
    static BigDecimal shownNum(String display) {
        if (display == null) {
            return null;
        }
        String s = display.replaceAll("[,\\s]", "");
        boolean neg = false;
        if (s.length() > 2 && s.startsWith("(") && s.endsWith(")")) {
            neg = true;
            s = s.substring(1, s.length() - 1);
        } else if (s.length() > 1 && (s.charAt(0) == '△' || s.charAt(0) == '▲')) {
            neg = true;
            s = s.substring(1);
        }
        if (!SHOWN_NUM.matcher(s).matches() || (neg && (s.startsWith("-") || s.startsWith("+")))) {
            return null;
        }
        try {
            BigDecimal d = new BigDecimal(s);
            return neg ? d.negate() : d;
        } catch (NumberFormatException | ArithmeticException e) {
            return null;
        }
    }

    /** 0 이면 "0", 아니면 후행 0 을 뗀 평문(지수 표기 없음). */
    static String plain(BigDecimal d) {
        return d.signum() == 0 ? "0" : d.stripTrailingZeros().toPlainString();
    }

    private static Map<String, Object> code(String c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", c);
        return m;
    }
}
