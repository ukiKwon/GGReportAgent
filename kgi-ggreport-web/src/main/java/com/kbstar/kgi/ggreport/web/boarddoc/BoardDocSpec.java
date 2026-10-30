package com.kbstar.kgi.ggreport.web.boarddoc;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 이사회 자료 양식의 표 정의. JSON(화면 HTML 표)과 docx(POI)가 같은 객체를 쓴다.
 * 모든 수치·기관명은 가상이다. 병합으로 가려지는 칸은 rows 에서 생략한다(HTML 과 같은 규칙).
 * 쪽 구분은 두지 않는다(표 중심). 확장: D 표 등은 Doc 의 tables 에 Table 을 더하면 된다(가변 행은 rows 를 만드는 쪽에서 반복).
 */
public final class BoardDocSpec {

    public static final String DEFAULT_ID = "default_doc";
    public static final String DEFAULT_NAME = "이사회 자료 수익성 분석(기본 양식)";
    private static final double DISCOUNT = 1.0331;   // 고정자산 기회비용률 3.31%
    private static final double TAX = 0.22;

    private BoardDocSpec() {
    }

    /** id 에 맞는 양식. 없으면 null. sample=false 면 매핑 값 칸이 빈 문자열. */
    public static Doc find(String id, boolean sample) {
        return DEFAULT_ID.equals(id) ? defaultDoc(sample) : null;
    }

    // ── 모델 ──

    public static final class Cell {
        private final String text;
        private final int colspan;
        private final int rowspan;
        private final boolean header;
        private final boolean mapped;
        private final String align;

        Cell(String text, int colspan, int rowspan, boolean header, boolean mapped, String align) {
            this.text = text;
            this.colspan = colspan;
            this.rowspan = rowspan;
            this.header = header;
            this.mapped = mapped;
            this.align = align;
        }

        Cell span(int cs, int rs) {
            return new Cell(text, cs, rs, header, mapped, align);
        }

        public String getText() { return text; }
        public int getColspan() { return colspan; }
        public int getRowspan() { return rowspan; }
        public boolean isHeader() { return header; }
        public boolean isMapped() { return mapped; }
        public String getAlign() { return align; }
    }

    public static final class Table {
        private final String id;
        private final String mapping;
        private final String title;
        private final int columns;
        private final List<List<Cell>> rows;
        private final List<String> notes;

        Table(String id, String mapping, String title, int columns, List<List<Cell>> rows, String... notes) {
            this.id = id;
            this.mapping = mapping;
            this.title = title;
            this.columns = columns;
            this.rows = Collections.unmodifiableList(rows);
            this.notes = Collections.unmodifiableList(Arrays.asList(notes));
            layout(this);                       // 병합 규칙 위반이면 만들 때 바로 실패
        }

        public String getId() { return id; }
        public String getMapping() { return mapping; }
        public String getTitle() { return title; }
        public int getColumns() { return columns; }
        public List<List<Cell>> getRows() { return rows; }
        public List<String> getNotes() { return notes; }
    }

    public static final class Doc {
        private final String id;
        private final String name;
        private final List<Table> tables;

        Doc(String id, String name, Table... tables) {
            this.id = id;
            this.name = name;
            this.tables = Collections.unmodifiableList(Arrays.asList(tables));
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public List<Table> getTables() { return tables; }
    }

    /**
     * 각 행의 (보이는) 셀이 시작하는 격자 열 번호. 겹침·초과·행 미충족이면 IllegalStateException.
     * docx 생성기도 이 결과를 쓴다.
     */
    public static int[][] layout(Table t) {
        int rowsN = t.rows.size();
        int cols = t.columns;
        boolean[][] used = new boolean[rowsN][cols];
        int[][] start = new int[rowsN][];
        for (int r = 0; r < rowsN; r++) {
            List<Cell> row = t.rows.get(r);
            start[r] = new int[row.size()];
            int c = 0;
            for (int i = 0; i < row.size(); i++) {
                Cell cell = row.get(i);
                while (c < cols && used[r][c]) {
                    c++;
                }
                if (cell.colspan < 1 || cell.rowspan < 1 || c + cell.colspan > cols || r + cell.rowspan > rowsN) {
                    throw new IllegalStateException("table " + t.id + " layout out of range");
                }
                for (int dr = 0; dr < cell.rowspan; dr++) {
                    for (int dc = 0; dc < cell.colspan; dc++) {
                        if (used[r + dr][c + dc]) {
                            throw new IllegalStateException("table " + t.id + " layout overlap");
                        }
                        used[r + dr][c + dc] = true;
                    }
                }
                start[r][i] = c;
                c += cell.colspan;
            }
            for (; c < cols; c++) {
                if (!used[r][c]) {
                    throw new IllegalStateException("table " + t.id + " row " + r + " not filled");
                }
            }
        }
        return start;
    }

    // ── 카탈로그·편집 (양식 커스텀) ──

    /** 카탈로그(표 목록·구조·셀 키)가 바뀌면 올린다. 버전 행의 CATALOG_VER 와 달라지면 응답이 낡았다고 알린다. */
    public static final int CATALOG_VER = 1;
    public static final int MAX_NAME = 60;
    public static final int MAX_TITLE = 100;
    public static final int MAX_CELL = 100;

    /** 고를 수 있는 표 전체(순서 고정). 지금은 기본 양식의 표 5개다. */
    public static List<Table> catalog(boolean sample) {
        return defaultDoc(sample).getTables();
    }

    /** ref(=Table.id)에 맞는 카탈로그 표. 없으면 null. */
    public static Table catalogTable(String ref, boolean sample) {
        if (ref != null) {
            for (Table t : catalog(sample)) {
                if (t.getId().equals(ref)) {
                    return t;
                }
            }
        }
        return null;
    }

    /** 칸 키: r{행}c{그 행에서 보이는 셀의 순번}. 병합으로 가려진 칸은 rows 에 없으므로 번호도 없다. */
    public static String cellKey(int row, int seq) {
        return "r" + row + "c" + seq;
    }

    /** 편집할 수 있는 칸 키(매핑 값 칸이 아닌 칸). */
    public static Set<String> editableKeys(Table t) {
        Set<String> out = new LinkedHashSet<>();
        for (int r = 0; r < t.getRows().size(); r++) {
            List<Cell> row = t.getRows().get(r);
            for (int i = 0; i < row.size(); i++) {
                if (!row.get(i).isMapped()) {
                    out.add(cellKey(r, i));
                }
            }
        }
        return out;
    }

    /** 표 하나에 대한 재정의 입력. notes 는 읽기 전용이라 보냈다면 카탈로그 값과 같아야 한다(null = 안 보냄). */
    public static final class TableEdit {
        private final String ref;
        private final String title;
        private final List<String> notes;
        private final Map<String, String> cells;

        public TableEdit(String ref, String title, List<String> notes, Map<String, String> cells) {
            this.ref = ref;
            this.title = title;
            this.notes = notes;
            this.cells = cells == null ? new java.util.LinkedHashMap<String, String>() : cells;
        }

        public String getRef() { return ref; }
        public String getTitle() { return title; }
        public List<String> getNotes() { return notes; }
        public Map<String, String> getCells() { return cells; }
    }

    /** 사용자 입력이 규칙에 어긋남. 메시지는 사용자에게 그대로 보여도 되는 문구다(내부 정보 없음). */
    public static final class EditException extends RuntimeException {
        public EditException(String message) {
            super(message);
        }
    }

    /** 양식 이름 검사: 앞뒤 공백 제거, 1~60자, 제어문자 없음. */
    public static String validName(String raw) {
        return clean(raw, MAX_NAME, false, "양식 이름을 입력해 주세요.",
                "양식 이름은 " + MAX_NAME + "자 이하로 입력해 주세요.", "양식 이름에 쓸 수 없는 문자가 있습니다.");
    }

    /**
     * 카탈로그에서 구조를 만들고 재정의 값만 얹어 Doc 을 만든다. edits 의 순서가 곧 표 순서이고,
     * edits 에 없는 표는 빠진다(삭제). 같은 표 두 번·모르는 표·매핑 칸 수정·주석 수정은 EditException.
     * 칸을 보내지 않으면 카탈로그 기본 문구가 된다(전체 교체 의미).
     */
    public static Doc build(String id, String name, List<TableEdit> edits, boolean sample) {
        if (edits == null || edits.isEmpty()) {
            throw new EditException("표를 하나 이상 넣어 주세요.");
        }
        Set<String> seen = new HashSet<>();
        List<Table> out = new ArrayList<>();
        for (TableEdit e : edits) {
            Table base = e == null ? null : catalogTable(e.getRef(), sample);
            if (base == null) {
                throw new EditException("알 수 없는 표입니다.");
            }
            if (!seen.add(base.getId())) {
                throw new EditException("같은 표를 두 번 넣을 수 없습니다.");
            }
            if (e.getNotes() != null && !e.getNotes().equals(base.getNotes())) {
                throw new EditException("표 주석은 수정할 수 없습니다.");
            }
            String title = e.getTitle() == null ? base.getTitle()
                    : clean(e.getTitle(), MAX_TITLE, false, "표 제목을 입력해 주세요.",
                            "표 제목은 " + MAX_TITLE + "자 이하로 입력해 주세요.", "표 제목에 쓸 수 없는 문자가 있습니다.");
            Set<String> editable = editableKeys(base);
            for (Map.Entry<String, String> c : e.getCells().entrySet()) {
                if (!editable.contains(c.getKey())) {
                    throw new EditException("수정할 수 없는 칸이 포함되어 있습니다.");
                }
                if (c.getValue() == null) {
                    throw new EditException("칸 문구가 올바르지 않습니다.");
                }
            }
            List<List<Cell>> rows = new ArrayList<>();
            for (int r = 0; r < base.getRows().size(); r++) {
                List<Cell> src = base.getRows().get(r);
                List<Cell> dst = new ArrayList<>();
                for (int i = 0; i < src.size(); i++) {
                    Cell c = src.get(i);
                    String text = c.getText();
                    String key = cellKey(r, i);
                    if (!c.isMapped() && e.getCells().containsKey(key)) {
                        text = clean(e.getCells().get(key), MAX_CELL, true, null,
                                "칸 문구는 " + MAX_CELL + "자 이하로 입력해 주세요.", "칸 문구에 쓸 수 없는 문자가 있습니다.");
                    }
                    dst.add(new Cell(text, c.getColspan(), c.getRowspan(), c.isHeader(), c.isMapped(), c.getAlign()));
                }
                rows.add(dst);
            }
            out.add(new Table(base.getId(), base.getMapping(), title, base.getColumns(), rows,
                    base.getNotes().toArray(new String[0])));
        }
        return new Doc(id, name, out.toArray(new Table[0]));
    }

    /** 제어문자(줄바꿈·탭 포함)·짝 없는 서로게이트·U+FFFE/FFFF 거부 후 앞뒤 공백 제거, 길이 검사. */
    private static String clean(String raw, int max, boolean allowEmpty, String emptyMsg, String longMsg, String badMsg) {
        if (raw == null) {
            throw new EditException(emptyMsg);
        }
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            int type = Character.getType(cp);
            if (type == Character.CONTROL || type == Character.SURROGATE || type == Character.LINE_SEPARATOR
                    || type == Character.PARAGRAPH_SEPARATOR || cp == 0xFFFE || cp == 0xFFFF) {
                throw new EditException(badMsg);
            }
        }
        String s = raw.trim();
        if (s.isEmpty() && !allowEmpty) {
            throw new EditException(emptyMsg);
        }
        if (s.length() > max) {
            throw new EditException(longMsg);
        }
        return s;
    }

    // ── 정의 ──

    private static final class Fill {
        final boolean sample;

        Fill(boolean sample) { this.sample = sample; }

        Cell v(String s) { return new Cell(sample ? s : "", 1, 1, false, true, "right"); }
        Cell vc(String s) { return new Cell(sample ? s : "", 1, 1, false, true, "center"); }
        Cell v(long n) { return v(String.format(Locale.US, "%,d", n)); }
    }

    private static Cell lab(String t) { return new Cell(t, 1, 1, false, false, "left"); }
    private static Cell head(String t) { return new Cell(t, 1, 1, true, false, "center"); }

    private static List<Cell> row(Cell... c) {
        return new ArrayList<>(Arrays.asList(c));
    }

    @SafeVarargs
    private static List<List<Cell>> rows(List<Cell>... r) {
        return new ArrayList<>(Arrays.asList(r));
    }

    private static List<Cell> labeled(Cell label, Fill f, long[] vals) {
        List<Cell> out = new ArrayList<>();
        out.add(label);
        for (long x : vals) {
            out.add(f.v(x));
        }
        return out;
    }

    private static long sum(long[] a) {
        long s = 0;
        for (long x : a) {
            s += x;
        }
        return s;
    }

    static Doc defaultDoc(boolean sample) {
        Fill f = new Fill(sample);

        // page2 표 A: 재산상 이익제공 및 기부금(안), 4열
        Table a = new Table("A", "A", "재산상 이익제공 및 기부금(안)", 4, rows(
                row(head("기관명"), head("구분"), head("제공금액"), head("비고")),
                row(f.vc("대한민국 기관").span(1, 4), lab("출연금"), f.v(500), lab("").span(1, 3)),
                row(lab("예비비"), f.v(100)),
                row(lab("전산시스템 구축/운영비용"), f.v(300)),
                row(lab("합계"), f.v(900), lab(""))));

        // page3 표 B: 5. 수익성 분석, 9열('구분' 머리는 가로 2칸)
        long[] nominal = {5000, 3200, 1800, 500, 1300, 286, 1014};
        long[] pv = {4400, 2900, 1500, 450, 1050, 231, 819};
        List<Cell> bHead = row(head("구분").span(2, 1), head("총기대수익"), head("총소요비용"),
                head("예상영업이익"), head("출연금(예비비)"), head("추정손익"), head("법인세"), head("순이익"));
        List<Cell> b1 = new ArrayList<>();
        b1.add(lab("").span(1, 2));          // 1열 2~3행 병합, 값 미정 → 빈 칸·mapped=false
        b1.add(lab("명목가치"));
        for (long x : nominal) {
            b1.add(f.v(x));
        }
        List<Cell> b2 = labeled(lab("현재가치"), f, pv);
        Table b = new Table("B", "B", "5. 수익성 분석", 9, rows(bHead, b1, b2));

        // page4 표 C-2: 명목가치 수익성 (사업초기 + 1~4년차 + 계)
        long[] revenue = {0, 1000, 1200, 1400, 1400};
        long[] cost = {400, 700, 750, 700, 650};
        long[] donate = {0, 125, 125, 125, 125};
        long[][] m = new long[8][5];
        for (int t = 0; t < 5; t++) {
            m[0][t] = revenue[t];
            m[1][t] = cost[t];
            m[2][t] = revenue[t] - cost[t];
            m[3][t] = donate[t];
            m[4][t] = m[2][t] - donate[t];
            m[5][t] = Math.round(Math.max(m[4][t], 0) * TAX);
            m[6][t] = m[4][t] - m[5][t];
            m[7][t] = Math.round(m[6][t] / Math.pow(DISCOUNT, t));
        }
        String[] labels2 = {"총수익(A)", "총비용(B)", "예상영업이익(C)=(A-B)", "출연금 및 예비비(D)",
                "순이익(법인세차감전)(E)=(C-D)", "법인세(F)", "순이익(법인세차감후)(E-F)", "순이익(현재가치(NPV)기준)"};
        List<List<Cell>> c2 = rows(row(head("구분"), head("사업초기"), head("1년차"), head("2년차"),
                head("3년차"), head("4년차"), head("계")));
        for (int i = 0; i < 8; i++) {
            List<Cell> r = labeled(lab(labels2[i]), f, m[i]);
            r.add(f.v(sum(m[i])));
            c2.add(r);
        }
        Table t2 = new Table("C-2", "C-2", "Ⅱ. 명목가치 수익성", 7, c2);

        // page4 표 C-3: NPV 수익성 (1~4년차 + 계)
        String[] labels3 = {"총수익(A)", "총비용(B)", "예상영업이익(C)=(A-B)", "출연금 및 예비비(D)", "미회수투자액(PV)"};
        long[][] n = new long[5][4];
        long[] unrecovered = {1200, 800, 300, 0};
        for (int t = 1; t <= 4; t++) {
            double d = Math.pow(DISCOUNT, t);
            n[0][t - 1] = Math.round(revenue[t] / d);
            n[1][t - 1] = Math.round(cost[t] / d);
            n[2][t - 1] = n[0][t - 1] - n[1][t - 1];
            n[3][t - 1] = Math.round(donate[t] / d);
            n[4][t - 1] = unrecovered[t - 1];
        }
        List<List<Cell>> c3 = rows(row(head("구분"), head("1년차"), head("2년차"), head("3년차"),
                head("4년차"), head("계")));
        for (int i = 0; i < 5; i++) {
            List<Cell> r = labeled(lab(labels3[i]), f, n[i]);
            r.add(f.v(i == 4 ? 0 : sum(n[i])));
            c3.add(r);
        }
        Table t3 = new Table("C-3", "C-3", "Ⅲ. 순현재가치(NPV) 수익성", 6, c3);

        // page4 표 C-4: 투자적정성 분석 (판단기준은 고정 문구)
        Table t4 = new Table("C-4", "C-4", "Ⅳ. 투자적정성 분석", 3, rows(
                row(head("구분"), head("산출값"), head("투자가부 결정 판단기준")),
                row(lab("회수기간법(Payback Period)"), f.vc("3.2년"), lab("목표기간 보다 회수기간 짧을 시 투자 결정")),
                row(lab("순현재가치(NPV)"), f.vc("2,345"), lab("순 현재가치가 \"0\"보다 클 때 투자 결정")),
                row(lab("내부수익률법(IRR)"), f.vc("5.8%"), lab("IRR이 고정자산 기회비용을 상회하는 경우 투자 결정"))),
                "※투입비용은 사업기간 내 연차별 비용을 현재가치로 환산한 값을 적용하고, 수익은 매년 발생하는 명목금액 기준으로 산출",
                "※ 현재가치할인율 3.31% (고정자산 기회비용률)");

        return new Doc(DEFAULT_ID, DEFAULT_NAME, a, b, t2, t3, t4);
    }
}
