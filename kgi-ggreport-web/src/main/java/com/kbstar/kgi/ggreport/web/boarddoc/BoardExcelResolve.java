package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 구역(area) 안에서 열 머리(이름)와 행 라벨 경로(꼬리 일치)로 칸 위치를 찾는다. 값은 읽지 않는다(좌표만).
 *
 * <p>구역 = 제목 행(title) ~ 다음 제목(until) 직전. 구역 안에서 머리글 행(header_has)을 찾고, 열 id 는 머리글 칸의 이름으로 정한다
 * (정의하지 않은 열은 읽히지 않는다). 행 경로는 구분 열(최대 4칸)의 값으로 만들고, 세로 병합은 위쪽 값을 상속하며
 * 가로 병합은 한 번만 센다(병합 상속은 라벨 열에만 — 값 칸은 병합 좌상단만 읽는 것이 {@link XlsxBook#value} 의 동작).
 * 지도 경로가 실제 경로의 접미이면 일치. 후보 수가 {@code count} 와 다르면 실패(추측하지 않는다).
 *
 * <p>오류 결과에는 업로드 파일의 실제 라벨 글자를 넣지 않는다 — 코드, 지도 쪽 id, 1-기준 행 번호만.
 */
public final class BoardExcelResolve {

    public static final int MAX_AREA_ROWS = 1000;
    public static final int MAX_LABEL_COLS = 4;

    private BoardExcelResolve() {
    }

    /** 찾을 행 한 개. path 모드(라벨 경로, 꼬리 일치) 또는 below 모드(머리글 행 바로 아래 N번째 행). */
    public static final class RowDef {
        final String id;
        final int count;
        final List<List<BoardLabel.Spec>> path;
        final int below;

        private RowDef(String id, int count, List<List<BoardLabel.Spec>> path, int below) {
            this.id = id;
            this.count = count;
            this.path = path;
            this.below = below;
        }

        /** segments 각 원소는 "별칭1|별칭2", 끝 {@code *} 는 접두 일치. count 는 정확히 그만큼 찾아야 함(1~10). */
        public static RowDef of(String id, int count, String... segments) {
            if (id == null || id.isEmpty() || count < 1 || count > 10 || segments == null || segments.length == 0) {
                throw new IllegalArgumentException("ROW_DEF");
            }
            List<List<BoardLabel.Spec>> p = new ArrayList<>();
            for (String sg : segments) {
                p.add(BoardLabel.parseAliases(sg));
            }
            return new RowDef(id, count, p, 0);
        }

        /** 머리글 행에서 offset(1~10) 칸 아래 행. */
        public static RowDef below(String id, int offset) {
            if (id == null || id.isEmpty() || offset < 1 || offset > 10) {
                throw new IllegalArgumentException("ROW_DEF");
            }
            return new RowDef(id, 1, new ArrayList<List<BoardLabel.Spec>>(), offset);
        }

        public String getId() {
            return id;
        }
    }

    /** 구역 정의. cols: 열 id → "이름1|이름2". */
    public static final class Area {
        final String id;
        final String sheet;
        final List<BoardLabel.Spec> title;
        final List<BoardLabel.Spec> until;
        final List<List<BoardLabel.Spec>> headerHas;
        final Map<String, List<BoardLabel.Spec>> cols;
        final List<RowDef> rows;

        public Area(String id, String sheet, String title, String until, List<String> headerHas,
                    Map<String, String> cols, List<RowDef> rows) {
            if (id == null || id.isEmpty() || sheet == null || sheet.isEmpty() || cols == null || cols.isEmpty()) {
                throw new IllegalArgumentException("AREA_DEF");
            }
            this.id = id;
            this.sheet = sheet;
            this.title = BoardLabel.parseAliases(title);
            this.until = until == null ? null : BoardLabel.parseAliases(until);
            List<List<BoardLabel.Spec>> hh = new ArrayList<>();
            if (headerHas != null) {
                for (String h : headerHas) {
                    hh.add(BoardLabel.parseAliases(h));
                }
            }
            this.headerHas = hh;
            Map<String, List<BoardLabel.Spec>> cm = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : cols.entrySet()) {
                cm.put(e.getKey(), BoardLabel.parseAliases(e.getValue()));
            }
            this.cols = cm;
            Set<String> seen = new LinkedHashSet<>();
            for (RowDef d : rows) {
                if (!seen.add(d.id)) {
                    throw new IllegalArgumentException("AREA_DEF");
                }
            }
            this.rows = new ArrayList<>(rows);
        }

        public String getId() {
            return id;
        }
    }

    /** 행 하나의 찾기 결과. error 가 null 이면 rows(0-기준 행 번호, 위에서 아래 순)에 count 개가 들어 있다. */
    public static final class RowHit {
        public final String id;
        public String error;
        public final List<Integer> rows = new ArrayList<>();
        /** 후보 수(오류 해석용 숫자). */
        public int found;
        /** 찾은 행 중 하나라도 숨김. */
        public boolean hidden;

        RowHit(String id) {
            this.id = id;
        }
    }

    /**
     * 구역 찾기 결과. error 가 있으면 구역 전체 실패(rows 비어 있음). ref 는 실패한 열 id·구역 id 같은 지도 쪽 글자,
     * row 는 1-기준 행 번호(0=모름). 업로드 텍스트는 담지 않는다.
     */
    public static final class Located {
        public final String areaId;
        public String error;
        public String ref;
        public int row;
        public boolean sheetHidden;
        public boolean titleHidden;
        public boolean headerHidden;
        /** 열 id → 0-기준 열 번호. */
        public final Map<String, Integer> cols = new LinkedHashMap<>();
        public final Set<String> hiddenCols = new LinkedHashSet<>();
        public final Map<String, RowHit> rows = new LinkedHashMap<>();

        Located(String areaId) {
            this.areaId = areaId;
        }

        public boolean ok() {
            return error == null;
        }
    }

    public static Located locate(XlsxBook b, Area a) {
        Located out = new Located(a.id);
        Sheet s = b.sheet(a.sheet);
        if (s == null) {
            return fail(out, "SHEET_MISSING", a.id, 0);
        }
        out.sheetHidden = b.isHidden(s);
        List<Row> rows = new ArrayList<>();
        for (Row r : s) {                                         // 실제 있는 행만
            rows.add(r);
        }

        // 1) 제목 행
        int titleIdx = -1;
        int hits = 0;
        for (int i = 0; i < rows.size(); i++) {
            if (rowMatches(b, s, rows.get(i), a.title)) {
                hits++;
                if (titleIdx < 0) {
                    titleIdx = i;
                }
            }
        }
        if (hits == 0) {
            return fail(out, "AREA_NOT_FOUND", a.id, 0);
        }
        if (hits > 1) {
            return fail(out, "AREA_AMBIGUOUS", a.id, 0);
        }
        out.titleHidden = XlsxBook.rowHidden(s, rows.get(titleIdx).getRowNum());

        // 2) 구역 끝
        int end = rows.size();
        if (a.until != null) {
            for (int i = titleIdx + 1; i < rows.size(); i++) {
                if (rowMatches(b, s, rows.get(i), a.until)) {
                    end = i;
                    break;
                }
            }
        }
        if (end - titleIdx - 1 > MAX_AREA_ROWS) {
            return fail(out, "AREA_TOO_LARGE", a.id, rows.get(titleIdx).getRowNum() + 1);
        }

        // 3) 머리글 행
        int headerIdx = -1;
        for (int i = titleIdx + 1; i < end; i++) {
            if (headerMatches(b, s, rows.get(i), a.headerHas)) {
                headerIdx = i;
                break;
            }
        }
        if (headerIdx < 0) {
            return fail(out, "HEADER_NOT_FOUND", a.id, rows.get(titleIdx).getRowNum() + 1);
        }
        Row header = rows.get(headerIdx);
        int hn = header.getRowNum();
        out.headerHidden = XlsxBook.rowHidden(s, hn);

        // 4) 열 id → 열 번호(이름 기준)
        List<Integer> hcols = new ArrayList<>();
        List<String> hkeys = new ArrayList<>();
        for (Cell c : header) {
            String k = keyAt(b, s, hn, c.getColumnIndex());
            if (!k.isEmpty()) {
                hcols.add(c.getColumnIndex());
                hkeys.add(k);
            }
        }
        int minData = Integer.MAX_VALUE;
        for (Map.Entry<String, List<BoardLabel.Spec>> e : a.cols.entrySet()) {
            int n = 0;
            int found = -1;
            for (int j = 0; j < hkeys.size(); j++) {
                if (BoardLabel.matchesAnyKey(e.getValue(), hkeys.get(j))) {
                    n++;
                    found = hcols.get(j);
                }
            }
            if (n == 0) {
                return fail(out, "COL_NOT_FOUND", e.getKey(), hn + 1);
            }
            if (n > 1) {
                return fail(out, "COL_AMBIGUOUS", e.getKey(), hn + 1);
            }
            out.cols.put(e.getKey(), found);
            minData = Math.min(minData, found);
            if (s.isColumnHidden(found)) {
                out.hiddenCols.add(e.getKey());
            }
        }

        List<Row> data = rows.subList(headerIdx + 1, end);
        int lastNum = data.isEmpty() ? hn : data.get(data.size() - 1).getRowNum();

        // 5) 경로가 필요한 행 정의가 있으면 구분 열·병합 색인·행별 경로
        boolean needPath = false;
        for (RowDef d : a.rows) {
            needPath |= d.below == 0;
        }
        List<List<String>> paths = null;
        if (needPath) {
            int labelStart = Integer.MAX_VALUE;
            labelStart = Math.min(labelStart, firstFilledCol(b, s, header, minData));
            for (Row r : data) {
                labelStart = Math.min(labelStart, firstFilledCol(b, s, r, minData));
            }
            if (labelStart == Integer.MAX_VALUE || minData - labelStart > MAX_LABEL_COLS) {
                return fail(out, "AREA_LABEL_COLS", a.id, hn + 1);
            }
            if (lastNum - hn + 1 > XlsxBook.MAX_INDEX_ROWS) {
                return fail(out, "AREA_TOO_LARGE", a.id, hn + 1);
            }
            XlsxBook.MergedIndex ix = b.mergedIndex(s, new CellRangeAddress(hn, lastNum, labelStart, minData - 1));
            if (ix.hasOverlap()) {
                return fail(out, "MERGE_OVERLAP", a.id, hn + 1);
            }
            paths = new ArrayList<>();
            for (Row r : data) {
                paths.add(pathOf(b, s, ix, r.getRowNum(), labelStart, minData - 1));   // 행마다 정규화 1회, 저장
            }
        }

        // 6) 행 찾기
        for (RowDef d : a.rows) {
            RowHit h = new RowHit(d.id);
            if (d.below > 0) {
                Row t = s.getRow(hn + d.below);
                if (t == null || t.getRowNum() > lastNum) {
                    h.error = "ROW_NOT_FOUND";
                } else {
                    h.rows.add(t.getRowNum());
                    h.found = 1;
                }
            } else {
                for (int i = 0; i < data.size(); i++) {
                    List<String> p = paths.get(i);
                    if (!p.isEmpty() && tailMatches(d.path, p)) {
                        h.rows.add(data.get(i).getRowNum());
                    }
                }
                h.found = h.rows.size();
                if (h.found == 0) {
                    h.error = "ROW_NOT_FOUND";
                } else if (h.found != d.count) {
                    h.error = d.count == 1 ? "ROW_AMBIGUOUS" : "ROW_COUNT_MISMATCH";
                }
            }
            if (h.error != null) {
                h.rows.clear();
            }
            for (Integer rn : h.rows) {
                h.hidden |= XlsxBook.rowHidden(s, rn);
            }
            out.rows.put(d.id, h);
        }
        return out;
    }

    private static Located fail(Located out, String code, String ref, int row) {
        out.error = code;
        out.ref = ref;
        out.row = row;
        out.cols.clear();
        out.hiddenCols.clear();
        out.rows.clear();
        return out;
    }

    private static String keyAt(XlsxBook b, Sheet s, int row, int col) {
        return BoardLabel.key(b.value(s, row, col).display);
    }

    private static boolean rowMatches(XlsxBook b, Sheet s, Row r, List<BoardLabel.Spec> specs) {
        for (Cell c : r) {
            if (BoardLabel.matchesAnyKey(specs, keyAt(b, s, r.getRowNum(), c.getColumnIndex()))) {
                return true;
            }
        }
        return false;
    }

    /** header_has 의 모든 항목이 이 행의 어떤 칸과 일치. 비어 있으면 제목 바로 다음 행(첫 후보)을 머리글로 본다. */
    private static boolean headerMatches(XlsxBook b, Sheet s, Row r, List<List<BoardLabel.Spec>> want) {
        if (want.isEmpty()) {
            return true;
        }
        List<String> keys = new ArrayList<>();
        for (Cell c : r) {
            String k = keyAt(b, s, r.getRowNum(), c.getColumnIndex());
            if (!k.isEmpty()) {
                keys.add(k);
            }
        }
        for (List<BoardLabel.Spec> group : want) {
            boolean any = false;
            for (String k : keys) {
                any |= BoardLabel.matchesAnyKey(group, k);
            }
            if (!any) {
                return false;
            }
        }
        return true;
    }

    /** limit 열 왼쪽에서 값이 있는 가장 왼쪽 열(없으면 MAX_VALUE). */
    private static int firstFilledCol(XlsxBook b, Sheet s, Row r, int limit) {
        int min = Integer.MAX_VALUE;
        for (Cell c : r) {
            int col = c.getColumnIndex();
            if (col < limit && col < min && !keyAt(b, s, r.getRowNum(), col).isEmpty()) {
                min = col;
            }
        }
        return min;
    }

    /** 구분 열 [from,to] 의 정규화 경로. 세로 병합은 좌상단 값 상속, 가로 병합은 한 번만, 빈 칸은 건너뜀. */
    private static List<String> pathOf(XlsxBook b, Sheet s, XlsxBook.MergedIndex ix, int row, int from, int to) {
        List<String> path = new ArrayList<>();
        for (int c = from; c <= to; c++) {
            CellRangeAddress m = ix.regionAt(row, c);
            String k;
            if (m != null) {
                if (c > Math.max(m.getFirstColumn(), from)) {
                    continue;                                       // 같은 병합의 두 번째 칸부터는 이미 셌다
                }
                k = keyAt(b, s, m.getFirstRow(), m.getFirstColumn());
            } else {
                k = keyAt(b, s, row, c);
            }
            if (!k.isEmpty()) {
                path.add(k);
            }
        }
        return path.isEmpty() ? Collections.<String>emptyList() : path;
    }

    /** 지도 경로가 실제 경로의 접미(꼬리)인가 — 한 방향만. */
    static boolean tailMatches(List<List<BoardLabel.Spec>> want, List<String> have) {
        int d = have.size() - want.size();
        if (d < 0) {
            return false;
        }
        for (int i = 0; i < want.size(); i++) {
            if (!BoardLabel.matchesAnyKey(want.get(i), have.get(d + i))) {
                return false;
            }
        }
        return true;
    }
}
