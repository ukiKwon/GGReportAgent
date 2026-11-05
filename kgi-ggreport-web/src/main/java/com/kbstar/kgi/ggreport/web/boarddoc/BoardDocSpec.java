package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

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
        private final boolean input;
        private final String rowId;
        private final String colId;

        Cell(String text, int colspan, int rowspan, boolean header, boolean mapped, String align) {
            this(text, colspan, rowspan, header, mapped, align, false, null, null);
        }

        private Cell(String text, int colspan, int rowspan, boolean header, boolean mapped, String align,
                     boolean input, String rowId, String colId) {
            this.text = text;
            this.colspan = colspan;
            this.rowspan = rowspan;
            this.header = header;
            this.mapped = mapped;
            this.align = align;
            this.input = input;
            this.rowId = rowId;
            this.colId = colId;
        }

        Cell span(int cs, int rs) {
            return new Cell(text, cs, rs, header, mapped, align, input, rowId, colId);
        }

        /** 모든 속성을 지정해 만든 칸(구조 편집·복원용). id 는 Table 생성자가 붙인다. */
        static Cell make(String text, int cs, int rs, boolean header, boolean mapped, String align, boolean input) {
            return new Cell(text, cs, rs, header, mapped, align, input, null, null);
        }

        /** 행·열 id 를 붙인 사본(Table 생성자가 부여). */
        Cell withIds(String r, String c) {
            return new Cell(text, colspan, rowspan, header, mapped, align, input, r, c);
        }

        /** 문구만 바꾼 사본(나머지 속성·id 유지). */
        Cell withText(String t) {
            return new Cell(t, colspan, rowspan, header, mapped, align, input, rowId, colId);
        }

        /** 사용자가 직접 값을 적는 칸 표시만 바꾼 사본(PR-1 카탈로그에는 없다). */
        Cell withInput(boolean in) {
            return new Cell(text, colspan, rowspan, header, mapped, align, in, rowId, colId);
        }

        /** 칸 주소표 r{행id}_c{열id}(예 r1_c2). 병합 칸은 앵커(왼쪽 위) 칸의 행id/열id. Table 에 들어가면 항상 채워진다. */
        public String getKey() { return rowId == null || colId == null ? null : cellKey(rowId, colId); }
        public String getRowId() { return rowId; }
        public String getColId() { return colId; }
        public String getText() { return text; }
        public int getColspan() { return colspan; }
        public int getRowspan() { return rowspan; }
        public boolean isHeader() { return header; }
        public boolean isMapped() { return mapped; }
        /** 사용자가 직접 입력하는 값 칸(엑셀 연결 없음). */
        public boolean isInput() { return input; }
        public String getAlign() { return align; }
    }

    public static final class Table {
        private final String id;
        private final String mapping;
        private final String title;
        private final int columns;
        private final List<List<Cell>> rows;
        private final List<String> notes;
        private final String unit;
        private final List<String> rowIds;
        private final List<String> colIds;
        private final int nextR;
        private final int nextC;

        /** 카탈로그 기본 생성자: 행 id = r{원래 행번호}, 열 id = c{격자 열번호}, 새 id 카운터는 FIRST_NEW_ID 부터. */
        Table(String id, String mapping, String title, int columns, List<List<Cell>> rows, String... notes) {
            this(id, mapping, title, columns, sequentialIds("r", rows.size()), sequentialIds("c", columns),
                    FIRST_NEW_ID, FIRST_NEW_ID, rows, notes);
        }

        /**
         * 명시 id 생성자: 카탈로그에 열/행을 나중에 더할 때(기존 id 는 그대로, 새 칸은 새 id) 또는 저장본을 복원할 때 쓴다.
         * rowIds.size()==rows.size(), colIds.size()==columns, id 는 r/c + 0~99999 정규형이며 중복 없음,
         * nextR/nextC 는 쓰인 숫자보다 크고 100000 이하(재사용 금지 카운터). 위반이면 IllegalStateException.
         */
        Table(String id, String mapping, String title, int columns, List<String> rowIds, List<String> colIds,
              int nextR, int nextC, List<List<Cell>> rows, String... notes) {
            this.id = id;
            this.unit = unitOf(id);             // 읽기 전용: 표 id 로만 정해지고 사용자 입력으로 바뀌지 않는다
            this.mapping = mapping;
            this.title = title;
            this.columns = columns;
            checkIds(id, rowIds, rows.size(), nextR, true);
            checkIds(id, colIds, columns, nextC, false);
            this.rowIds = Collections.unmodifiableList(new ArrayList<>(rowIds));
            this.colIds = Collections.unmodifiableList(new ArrayList<>(colIds));
            this.nextR = nextR;
            this.nextC = nextC;
            int[][] start = layoutOf(id, columns, rows);     // 병합 규칙 위반이면 만들 때 바로 실패
            List<List<Cell>> keyed = new ArrayList<>();
            for (int r = 0; r < rows.size(); r++) {
                List<Cell> kr = new ArrayList<>();
                for (int i = 0; i < rows.get(r).size(); i++) {
                    kr.add(rows.get(r).get(i).withIds(rowIds.get(r), colIds.get(start[r][i])));
                }
                keyed.add(Collections.unmodifiableList(kr));
            }
            this.rows = Collections.unmodifiableList(keyed);
            this.notes = Collections.unmodifiableList(Arrays.asList(notes));
        }

        public String getId() { return id; }
        /** 행 id 목록(행 순서). 카탈로그 행은 r{원래 행번호}. */
        public List<String> getRowIds() { return rowIds; }
        /** 열 id 목록(격자 열 순서). 카탈로그 열은 c{원래 격자 열번호}. */
        public List<String> getColIds() { return colIds; }
        /** 다음에 발급할 새 행/열 숫자(재사용 금지 카운터). 응답에는 싣지 않는다. */
        @JsonIgnore
        public int getNextR() { return nextR; }
        @JsonIgnore
        public int getNextC() { return nextC; }
        public String getMapping() { return mapping; }
        public String getTitle() { return title; }
        public int getColumns() { return columns; }
        public List<List<Cell>> getRows() { return rows; }
        public List<String> getNotes() { return notes; }
        /** 단위 표기(예: "(단위: 억원)"). 없으면 빈 문자열. 제목과 분리된 읽기 전용 값. */
        public String getUnit() { return unit; }
    }

    public static final String UNIT_EOK = "(단위: 억원)";

    private static String unitOf(String tableId) {
        return "A".equals(tableId) || "B".equals(tableId) || "C-2".equals(tableId) || "C-3".equals(tableId)
                || C5_REF.equals(tableId) ? UNIT_EOK : "";
    }

    public static final class Doc {
        private final String id;
        private final String name;
        private final List<Table> tables;
        private final Map<String, int[]> kept;

        Doc(String id, String name, Table... tables) {
            this(id, name, Arrays.asList(tables), Collections.<String, int[]>emptyMap());
        }

        /** kept: 양식에서 빠진 표의 id 카운터(ref → {next_r, next_c}). 표를 지웠다 다시 넣어도 지운 id 를 재사용하지 않게 보관한다. */
        Doc(String id, String name, List<Table> tables, Map<String, int[]> kept) {
            this.id = id;
            this.name = name;
            this.tables = Collections.unmodifiableList(new ArrayList<>(tables));
            Map<String, int[]> copy = new java.util.LinkedHashMap<>();
            for (Map.Entry<String, int[]> e : kept.entrySet()) {
                copy.put(e.getKey(), new int[]{e.getValue()[0], e.getValue()[1]});
            }
            this.kept = Collections.unmodifiableMap(copy);
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public List<Table> getTables() { return tables; }
        /** 빠진 표의 카운터. 응답에는 싣지 않는다. */
        @JsonIgnore
        public Map<String, int[]> getKept() { return kept; }
    }

    /**
     * 각 행의 (보이는) 셀이 시작하는 격자 열 번호. 겹침·초과·행 미충족이면 IllegalStateException.
     * docx 생성기도 이 결과를 쓴다.
     */
    public static int[][] layout(Table t) {
        return layoutOf(t.id, t.columns, t.rows);
    }

    /** layout 의 본체 — Table 을 만들기 전(id 부여 전)에도 쓰려고 값만 받는다. */
    private static int[][] layoutOf(String tableId, int cols, List<List<Cell>> rowList) {
        int rowsN = rowList.size();
        boolean[][] used = new boolean[rowsN][cols];
        int[][] start = new int[rowsN][];
        for (int r = 0; r < rowsN; r++) {
            List<Cell> row = rowList.get(r);
            start[r] = new int[row.size()];
            int c = 0;
            for (int i = 0; i < row.size(); i++) {
                Cell cell = row.get(i);
                while (c < cols && used[r][c]) {
                    c++;
                }
                if (cell.colspan < 1 || cell.rowspan < 1 || c + cell.colspan > cols || r + cell.rowspan > rowsN) {
                    throw new IllegalStateException("table " + tableId + " layout out of range");
                }
                for (int dr = 0; dr < cell.rowspan; dr++) {
                    for (int dc = 0; dc < cell.colspan; dc++) {
                        if (used[r + dr][c + dc]) {
                            throw new IllegalStateException("table " + tableId + " layout overlap");
                        }
                        used[r + dr][c + dc] = true;
                    }
                }
                start[r][i] = c;
                c += cell.colspan;
            }
            for (; c < cols; c++) {
                if (!used[r][c]) {
                    throw new IllegalStateException("table " + tableId + " row " + r + " not filled");
                }
            }
        }
        return start;
    }

    // ── 카탈로그·편집 (양식 커스텀) ──

    /** 카탈로그(표 목록·구조·셀 키)가 바뀌면 올린다. 버전 행의 CATALOG_VER 와 달라지면 응답이 낡았다고 알린다. */
    public static final int CATALOG_VER = 2;
    /** CATALOG_VER 2 에서 새로 생긴 열 id(C-3 사업초기). 얼린 v1 구조와 비교할 때 이 열을 뺀다. */
    public static final String C3_INIT_COL = "c6";
    /** CATALOG_VER 2 에서 새로 생긴 표(맨 뒤에 덧붙는다). */
    public static final String C5_REF = "C-5";
    /** 저장 JSON 형식 번호(칸 key 가 r{행id}_c{열id}인 구조 저장). 카탈로그 버전과 별개다 — 이 값만 바뀌면 CATALOG_VER 는 그대로. */
    public static final int FORM_FMT = 2;
    /** 사용자가 만든 행/열 id 의 시작 숫자(카탈로그 id 는 이보다 작다). 지운 id 는 재사용하지 않는다. */
    public static final int FIRST_NEW_ID = 100;
    /** id 숫자 상한(정규형 최대 5자리). 카운터는 이 값+1 까지 갈 수 있다. */
    public static final int MAX_ID_NUM = 99999;
    public static final int MAX_NAME = 60;
    public static final int MAX_TITLE = 100;
    public static final int MAX_CELL = 100;
    /** 구조 편집 상한: 표당 행·열·앵커 칸(병합으로 가려진 칸은 세지 않는다), 양식 전체 앵커 칸. */
    public static final int MAX_ROWS = 40;
    public static final int MAX_COLS = 12;
    public static final int MAX_TABLE_CELLS = 300;
    public static final int MAX_FORM_CELLS = 800;

    /** 고를 수 있는 표 전체(순서 고정). 지금은 기본 양식의 표 6개다(A, B, C-2, C-3, C-4, C-5). */
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

    private static final Pattern ROW_ID = Pattern.compile("^r(0|[1-9][0-9]{0,4})$");
    private static final Pattern COL_ID = Pattern.compile("^c(0|[1-9][0-9]{0,4})$");
    private static final Pattern CELL_KEY = Pattern.compile("^r(0|[1-9][0-9]{0,4})_c(0|[1-9][0-9]{0,4})$");
    /** 새 열의 임시 id(요청 안에서만 쓰이고 서버가 c{카운터}로 바꾼다). */
    private static final Pattern TEMP_ID = Pattern.compile("^n[1-9][0-9]{0,2}$");

    /** 행 id 정규형: r + (0 또는 앞자리 0 없는 1~5자리 숫자). 구조 편집이 입력 id 를 이 함수로 거른다. */
    public static boolean isValidRowId(String s) {
        return s != null && ROW_ID.matcher(s).matches();
    }

    /** 열 id 정규형: c + (0 또는 앞자리 0 없는 1~5자리 숫자). */
    public static boolean isValidColId(String s) {
        return s != null && COL_ID.matcher(s).matches();
    }

    /** 칸 key 정규형 r{행id숫자}_c{열id숫자}. */
    public static boolean isValidCellKey(String s) {
        return s != null && CELL_KEY.matcher(s).matches();
    }

    /** id 의 숫자 부분(정규형일 때만 호출). */
    static int idNum(String id) {
        return Integer.parseInt(id.substring(1));
    }

    /** 칸 키 = 행 id + "_" + 열 id. 예) ("r1","c2") → "r1_c2". 병합 칸은 앵커(왼쪽 위) 칸의 행id/열id. */
    public static String cellKey(String rowId, String colId) {
        return rowId + "_" + colId;
    }

    /** r{prefix}0..r{prefix}{n-1} 형태의 카탈로그 기본 id 목록. */
    private static List<String> sequentialIds(String prefix, int n) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add(prefix + i);
        }
        return out;
    }

    /** id 목록 검증(개수·정규형·중복·카운터). 값은 메시지에 싣지 않는다. */
    private static void checkIds(String tableId, List<String> ids, int expected, int next, boolean row) {
        if (ids == null || ids.size() != expected || next < 1 || next > MAX_ID_NUM + 1) {
            throw new IllegalStateException("table " + tableId + " ids invalid");
        }
        Set<String> seen = new HashSet<>();
        for (String id : ids) {
            if (!(row ? isValidRowId(id) : isValidColId(id)) || !seen.add(id) || idNum(id) >= next) {
                throw new IllegalStateException("table " + tableId + " ids invalid");
            }
        }
    }

    /**
     * 옛 key(r{행}c{순번}, 얼린 번역표)를 새 key 로. catalogVer 별 상수라 카탈로그가 바뀌어도 결과가 같다.
     * 모르는 버전·표·위치·모양이면 null(호출자가 닫힌 실패).
     */
    public static String legacyToKey(int catalogVer, String ref, String oldKey) {
        return BoardLegacyKeys.toKey(catalogVer, ref, oldKey);
    }

    /** 옛 모양이면 번역하고, 이미 새 정규형이면 그대로, 그 밖이면 null. */
    public static String resolveKey(int catalogVer, String ref, String key) {
        if (BoardLegacyKeys.isLegacyShape(key)) {
            return legacyToKey(catalogVer, ref, key);
        }
        return isValidCellKey(key) ? key : null;
    }

    /** 편집할 수 있는 칸 키(PR-1: 엑셀 연결 칸이 아닌 칸). */
    public static Set<String> editableKeys(Table t) {
        Set<String> out = new LinkedHashSet<>();
        for (List<Cell> row : t.getRows()) {
            for (Cell c : row) {
                if (!c.isMapped()) {
                    out.add(c.getKey());
                }
            }
        }
        return out;
    }

    /** 엑셀 연결 칸 키 집합(카탈로그 표 기준). 엑셀 지도 기동 검증이 쓴다. */
    public static Set<String> mappedKeys(Table t) {
        Set<String> out = new LinkedHashSet<>();
        for (List<Cell> row : t.getRows()) {
            for (Cell c : row) {
                if (c.isMapped()) {
                    out.add(c.getKey());
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
        private final List<ColEdit> cols;
        private final List<RowEdit> rows;
        private final boolean stored;
        private final int nextR;
        private final int nextC;
        private final boolean keptOnly;

        /** 구조를 보내지 않는 표(칸 문구만 cells 맵으로). 구조는 base 버전(없으면 카탈로그)의 것을 그대로 쓴다. */
        public TableEdit(String ref, String title, List<String> notes, Map<String, String> cells) {
            this(ref, title, notes, cells, null, null, false, 0, 0, false);
        }

        /** 구조(cols·rows)를 보내는 표. cols·rows 는 둘 다 있거나 둘 다 없어야 한다(한쪽만 있으면 거부). */
        public TableEdit(String ref, String title, List<String> notes, Map<String, String> cells,
                         List<ColEdit> cols, List<RowEdit> rows) {
            this(ref, title, notes, cells, cols, rows, false, 0, 0, false);
        }

        private TableEdit(String ref, String title, List<String> notes, Map<String, String> cells,
                          List<ColEdit> cols, List<RowEdit> rows, boolean stored, int nextR, int nextC, boolean keptOnly) {
            this.ref = ref;
            this.title = title;
            this.notes = notes;
            this.cells = cells == null ? new java.util.LinkedHashMap<String, String>() : cells;
            this.cols = cols;
            this.rows = rows;
            this.stored = stored;
            this.nextR = nextR;
            this.nextC = nextC;
            this.keptOnly = keptOnly;
        }

        /** 저장본(JSON)에서 복원한 구조. id 는 정규형이고 카운터(nextR/nextC)보다 작아야 한다(임시 id·base 대조 없음). */
        static TableEdit stored(String ref, String title, List<ColEdit> cols, List<RowEdit> rows, int nextR, int nextC) {
            return new TableEdit(ref, title, null, null, cols, rows, true, nextR, nextC, false);
        }

        /** 양식에서 빠진 표의 카운터만 담은 항목(저장본의 kept). */
        static TableEdit kept(String ref, int nextR, int nextC) {
            return new TableEdit(ref, null, null, null, null, null, true, nextR, nextC, true);
        }

        public String getRef() { return ref; }
        public String getTitle() { return title; }
        public List<String> getNotes() { return notes; }
        public Map<String, String> getCells() { return cells; }
        public List<ColEdit> getCols() { return cols; }
        public List<RowEdit> getRows() { return rows; }
    }

    /** 열 하나. id 는 base 버전의 열 id 그대로 또는 새 열의 임시 id("n1","n2"…). */
    public static final class ColEdit {
        private final String id;

        public ColEdit(String id) { this.id = id; }

        public String getId() { return id; }
    }

    /** 칸 하나(앵커 칸만). col = 칸이 놓인 열의 id(임시 id 포함). 값이 빠진 속성은 기본(1, 1, false, false, "left", ""). */
    public static final class CellEdit {
        private final String col;
        private final String text;
        private final Integer colspan;
        private final Integer rowspan;
        private final Boolean header;
        private final Boolean input;
        private final String align;

        public CellEdit(String col, String text, Integer colspan, Integer rowspan, Boolean header, Boolean input,
                        String align) {
            this.col = col;
            this.text = text;
            this.colspan = colspan;
            this.rowspan = rowspan;
            this.header = header;
            this.input = input;
            this.align = align;
        }

        public String getCol() { return col; }
        public String getText() { return text; }
        public Integer getColspan() { return colspan; }
        public Integer getRowspan() { return rowspan; }
        public Boolean getHeader() { return header; }
        public Boolean getInput() { return input; }
        public String getAlign() { return align; }
    }

    /** 행 하나. id 는 base 버전의 행 id 그대로, 새 행은 null. */
    public static final class RowEdit {
        private final String id;
        private final List<CellEdit> cells;

        public RowEdit(String id, List<CellEdit> cells) {
            this.id = id;
            this.cells = cells;
        }

        public String getId() { return id; }
        public List<CellEdit> getCells() { return cells; }
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
        return build(id, name, edits, sample, null);
    }

    public static final String BAD_STRUCT = "표 구조가 올바르지 않습니다. 화면을 새로 고친 뒤 다시 편집해 주세요.";
    private static final String MSG_CELL_LONG = "칸 문구는 " + MAX_CELL + "자 이하로 입력해 주세요.";
    private static final String MSG_CELL_BAD = "칸 문구에 쓸 수 없는 문자가 있습니다.";

    /**
     * base 가 있으면(저장 직전의 현재 버전 Doc) 구조 편집의 "기존 id" 는 base 의 해당 표에 있는 것만 인정하고,
     * 구조를 보내지 않은 표는 base 구조를 그대로 쓴다. 새 행/열 id 는 base 표의 카운터에서 서버가 발급한다(지운 id 재사용 없음).
     * base 에 없던 표(새로 넣은 표)는 카탈로그 구조에서 시작하고, 예전에 지운 표라면 그때의 카운터를 이어받는다.
     * 저장본에서 읽은 항목(TableEdit.stored)은 base 대조 없이 정규형 id + 카운터 범위만 본다.
     */
    public static Doc build(String id, String name, List<TableEdit> edits, boolean sample, Doc base) {
        if (edits == null || edits.isEmpty()) {
            throw new EditException("표를 하나 이상 넣어 주세요.");
        }
        Map<String, int[]> carried = new java.util.LinkedHashMap<>();       // 이 요청 이전에 쓰인 카운터(ref → {r, c})
        Map<String, Table> baseTables = new java.util.HashMap<>();
        if (base != null) {
            carried.putAll(base.getKept());
            for (Table bt : base.getTables()) {
                baseTables.put(bt.getId(), bt);
                carried.put(bt.getId(), new int[]{bt.getNextR(), bt.getNextC()});
            }
        }
        Set<String> seen = new HashSet<>();
        List<Table> out = new ArrayList<>();
        Map<String, int[]> kept = new java.util.LinkedHashMap<>();
        int formCells = 0;
        for (TableEdit e : edits) {
            Table cat = e == null ? null : catalogTable(e.ref, sample);
            if (cat == null) {
                throw new EditException("알 수 없는 표입니다.");
            }
            if (e.keptOnly) {
                if (e.nextR < FIRST_NEW_ID || e.nextR > MAX_ID_NUM + 1 || e.nextC < FIRST_NEW_ID || e.nextC > MAX_ID_NUM + 1) {
                    throw new EditException(BAD_STRUCT);
                }
                kept.put(cat.getId(), new int[]{e.nextR, e.nextC});
                continue;
            }
            if (!seen.add(cat.getId())) {
                throw new EditException("같은 표를 두 번 넣을 수 없습니다.");
            }
            if (e.getNotes() != null && !e.getNotes().equals(cat.getNotes())) {
                throw new EditException("표 주석은 수정할 수 없습니다.");
            }
            String title = e.getTitle() == null ? cat.getTitle()
                    : clean(e.getTitle(), MAX_TITLE, false, "표 제목을 입력해 주세요.",
                            "표 제목은 " + MAX_TITLE + "자 이하로 입력해 주세요.", "표 제목에 쓸 수 없는 문자가 있습니다.");
            Table known = e.stored ? null : baseTables.get(cat.getId());
            int[] carry = carried.get(cat.getId());
            Table t;
            if (e.cols != null || e.rows != null) {
                if (!e.getCells().isEmpty()) {
                    throw bad();                                              // 구조를 보내는 표는 cells 맵을 함께 보낼 수 없다
                }
                formCells += inputAnchors(e);                                 // 큰 배열을 만들기 전에 합계 상한부터 본다
                if (formCells > MAX_FORM_CELLS) {
                    throw new EditException(MSG_FORM_CELLS);
                }
                int sr = e.stored ? e.nextR : known != null ? known.getNextR()
                        : carry != null ? Math.max(FIRST_NEW_ID, carry[0]) : FIRST_NEW_ID;
                int sc = e.stored ? e.nextC : known != null ? known.getNextC()
                        : carry != null ? Math.max(FIRST_NEW_ID, carry[1]) : FIRST_NEW_ID;
                t = assemble(cat, known, e, title, sr, sc);
            } else {
                Table src = known != null ? known : cat;
                formCells += anchorCount(src);
                if (formCells > MAX_FORM_CELLS) {
                    throw new EditException(MSG_FORM_CELLS);
                }
                int sr = known != null ? known.getNextR() : carry != null ? Math.max(FIRST_NEW_ID, carry[0]) : FIRST_NEW_ID;
                int sc = known != null ? known.getNextC() : carry != null ? Math.max(FIRST_NEW_ID, carry[1]) : FIRST_NEW_ID;
                t = fromKnown(cat, src, e, title, sr, sc);
            }
            out.add(t);
        }
        if (out.isEmpty()) {
            throw new EditException("표를 하나 이상 넣어 주세요.");
        }
        for (Map.Entry<String, int[]> c : carried.entrySet()) {              // 이번에 빠진 표의 카운터를 이어서 보관
            if (!seen.contains(c.getKey())) {
                int[] k = kept.get(c.getKey());
                kept.put(c.getKey(), k == null ? c.getValue()
                        : new int[]{Math.max(k[0], c.getValue()[0]), Math.max(k[1], c.getValue()[1])});
            }
        }
        kept.keySet().removeAll(seen);
        return new Doc(id, name, out, kept);
    }

    private static final String MSG_FORM_CELLS = "양식 전체에 넣을 수 있는 칸은 " + MAX_FORM_CELLS + "개까지입니다.";

    private static int anchorCount(Table t) {
        int n = 0;
        for (List<Cell> r : t.getRows()) {
            n += r.size();
        }
        return n;
    }

    /** 요청에 담긴 앵커 칸 수(null 안전 — 검증 전 상한 확인용). */
    private static int inputAnchors(TableEdit e) {
        int n = 0;
        if (e.rows != null) {
            for (RowEdit r : e.rows) {
                if (r != null && r.getCells() != null) {
                    n += r.getCells().size();
                }
            }
        }
        return n;
    }

    private static Map<String, Cell> cellsByKey(Table t) {
        Map<String, Cell> out = new java.util.HashMap<>();
        for (List<Cell> row : t.getRows()) {
            for (Cell c : row) {
                out.put(c.getKey(), c);
            }
        }
        return out;
    }

    /**
     * 구조를 보내지 않은 표: src(base 의 표, 없으면 카탈로그) 구조를 그대로 두고 칸 문구만 cells 맵으로 정한다.
     * 전체 교체 규칙: cells 에 없는 칸은 카탈로그 기본 문구(카탈로그에 없는 사용자 추가 칸은 빈 문구)로 돌아간다.
     * 연결 칸의 문구는 항상 카탈로그(샘플 또는 빈칸)다.
     */
    private static Table fromKnown(Table cat, Table src, TableEdit e, String title, int nextR, int nextC) {
        Set<String> editable = editableKeys(src);
        for (Map.Entry<String, String> c : e.getCells().entrySet()) {
            if (!editable.contains(c.getKey())) {
                throw new EditException("수정할 수 없는 칸이 포함되어 있습니다.");
            }
            if (c.getValue() == null) {
                throw new EditException("칸 문구가 올바르지 않습니다.");
            }
        }
        Map<String, Cell> catKey = cellsByKey(cat);
        List<List<Cell>> rows = new ArrayList<>();
        for (int r = 0; r < src.getRows().size(); r++) {
            List<Cell> dst = new ArrayList<>();
            for (Cell c : src.getRows().get(r)) {
                String key = c.getKey();
                Cell cc = catKey.get(key);
                String text;
                if (c.isMapped()) {
                    text = cc != null ? cc.getText() : "";
                } else if (e.getCells().containsKey(key)) {
                    text = clean(e.getCells().get(key), MAX_CELL, true, null, MSG_CELL_LONG, MSG_CELL_BAD);
                } else {
                    text = cc != null && !cc.isMapped() ? cc.getText() : "";
                }
                dst.add(c.withText(text));
            }
            rows.add(dst);
        }
        return new Table(cat.getId(), cat.getMapping(), title, src.getColumns(),
                src.getRowIds(), src.getColIds(), nextR, nextC, rows, cat.getNotes().toArray(new String[0]));
    }

    private static EditException bad() {
        return new EditException(BAD_STRUCT);
    }

    /** 구조(cols·rows)를 만든다. 모든 상한·id·격자 검증을 여기서 한다. 실패는 EditException(고정 문구, 입력값 미포함). */
    private static Table assemble(Table cat, Table known, TableEdit e, String title, int startR, int startC) {
        try {
            return assembleChecked(cat, known, e, title, startR, startC);
        } catch (IllegalStateException ex) {
            throw bad();                                                      // layoutOf·Table 생성자의 규칙 위반을 500 이 아닌 400 으로
        }
    }

    private static Table assembleChecked(Table cat, Table known, TableEdit e, String title, int startR, int startC) {
        List<ColEdit> cols = e.cols;
        List<RowEdit> rows = e.rows;
        if (cols == null || rows == null) {
            throw bad();                                                      // 한쪽만 보낼 수 없다
        }
        if (cols.isEmpty() || cols.size() > MAX_COLS) {
            throw new EditException("열은 1개 이상 " + MAX_COLS + "개 이하여야 합니다.");
        }
        if (rows.isEmpty() || rows.size() > MAX_ROWS) {
            throw new EditException("행은 1개 이상 " + MAX_ROWS + "개 이하여야 합니다.");
        }
        int anchors = 0;
        for (RowEdit r : rows) {
            if (r == null || r.getCells() == null || r.getCells().size() > cols.size()) {
                throw bad();
            }
            anchors += r.getCells().size();
            if (anchors > MAX_TABLE_CELLS) {
                throw new EditException("표 하나에 넣을 수 있는 칸은 " + MAX_TABLE_CELLS + "개까지입니다.");
            }
        }
        boolean stored = e.stored;
        Table idSource = known != null ? known : cat;
        Set<String> knownCols = new HashSet<>(idSource.getColIds());
        Set<String> knownRows = new HashSet<>(idSource.getRowIds());
        int nextC = startC;
        int nextR = startR;

        List<String> colIds = new ArrayList<>();
        Map<String, Integer> colIndex = new java.util.HashMap<>();            // 요청에 쓰인 열 id(임시 포함) → 격자 열 번호
        for (int i = 0; i < cols.size(); i++) {
            ColEdit c = cols.get(i);
            String cid = c == null ? null : c.getId();
            if (cid == null || colIndex.containsKey(cid)) {
                throw bad();
            }
            if (isValidColId(cid)) {
                if (stored ? idNum(cid) >= startC : !knownCols.contains(cid)) {
                    throw bad();                                              // 위조·지운 id 재사용
                }
                colIds.add(cid);
            } else if (!stored && TEMP_ID.matcher(cid).matches()) {
                colIds.add(null);
            } else {
                throw bad();
            }
            colIndex.put(cid, i);
        }
        for (int i = 0; i < colIds.size(); i++) {
            if (colIds.get(i) == null) {
                if (nextC > MAX_ID_NUM) {
                    throw new EditException("더 이상 열을 추가할 수 없습니다.");
                }
                colIds.set(i, "c" + nextC++);
            }
        }

        List<String> rowIds = new ArrayList<>();
        Set<String> rowSeen = new HashSet<>();
        for (RowEdit r : rows) {
            String rid = r.getId();
            if (rid == null) {
                if (stored) {
                    throw bad();
                }
                rowIds.add(null);
                continue;
            }
            if (!isValidRowId(rid) || !rowSeen.add(rid) || (stored ? idNum(rid) >= startR : !knownRows.contains(rid))) {
                throw bad();
            }
            rowIds.add(rid);
        }
        for (int i = 0; i < rowIds.size(); i++) {
            if (rowIds.get(i) == null) {
                if (nextR > MAX_ID_NUM) {
                    throw new EditException("더 이상 행을 추가할 수 없습니다.");
                }
                rowIds.set(i, "r" + nextR++);
            }
        }
        if (!stored) {
            keepCatalogOrder(colIds, cat.getColIds());
            keepCatalogOrder(rowIds, cat.getRowIds());
        }

        List<List<Cell>> grid = new ArrayList<>();
        List<List<String>> declared = new ArrayList<>();
        for (RowEdit r : rows) {
            List<Cell> row = new ArrayList<>();
            List<String> decl = new ArrayList<>();
            for (CellEdit ce : r.getCells()) {
                if (ce == null) {
                    throw bad();
                }
                int cs = ce.getColspan() == null ? 1 : ce.getColspan();
                int rs = ce.getRowspan() == null ? 1 : ce.getRowspan();
                if (cs < 1 || cs > cols.size() || rs < 1 || rs > rows.size()) {   // 곱셈·덧셈 전에 범위부터
                    throw bad();
                }
                String align = ce.getAlign() == null ? "left" : ce.getAlign();
                if (!("left".equals(align) || "center".equals(align) || "right".equals(align))) {
                    throw bad();
                }
                boolean header = Boolean.TRUE.equals(ce.getHeader());
                boolean input = Boolean.TRUE.equals(ce.getInput());
                if (header && input) {
                    throw bad();
                }
                String text = ce.getText() == null ? ""
                        : clean(ce.getText(), MAX_CELL, true, null, MSG_CELL_LONG, MSG_CELL_BAD);
                row.add(Cell.make(text, cs, rs, header, false, align, input));
                decl.add(ce.getCol());
            }
            grid.add(row);
            declared.add(decl);
        }
        int[][] start = layoutOf(cat.getId(), cols.size(), grid);             // 겹침·범위 초과·빈 칸이면 ISE → 호출부가 400
        Set<String> catMapped = mappedKeys(cat);
        Map<String, Cell> catKey = cellsByKey(cat);
        for (int r = 0; r < grid.size(); r++) {
            for (int i = 0; i < grid.get(r).size(); i++) {
                Integer idx = declared.get(r).get(i) == null ? null : colIndex.get(declared.get(r).get(i));
                if (idx == null || idx.intValue() != start[r][i]) {
                    throw bad();                                              // 칸이 말한 열 ≠ 실제 격자 위치
                }
                Cell c = grid.get(r).get(i);
                String key = cellKey(rowIds.get(r), colIds.get(start[r][i]));
                if (!c.isHeader() && !c.isInput() && catMapped.contains(key)) {
                    // 카탈로그 연결 칸 위치에 일반 값 칸이 그대로 있으면 엑셀 연결 유지(문구는 카탈로그의 샘플/빈칸)
                    grid.get(r).set(i, Cell.make(catKey.get(key).getText(), c.colspan, c.rowspan, false, true, c.align, false));
                }
            }
        }
        return new Table(cat.getId(), cat.getMapping(), title, cols.size(), rowIds, colIds, nextR, nextC, grid,
                cat.getNotes().toArray(new String[0]));
    }

    /** 카탈로그 id(100 미만)끼리의 상대 순서는 바뀔 수 없다(연결 행·열이 다른 머리 밑으로 가는 조용한 오적용 방지). 새 id 는 어디든 가능. */
    private static void keepCatalogOrder(List<String> ids, List<String> catalogIds) {
        int last = -1;
        for (String id : ids) {
            int k = catalogIds.indexOf(id);
            if (k >= 0) {
                if (k < last) {
                    throw new EditException("기본 양식의 행·열 순서는 바꿀 수 없습니다. 행·열은 새로 끼워 넣을 수 있습니다.");
                }
                last = k;
            }
        }
    }

    /**
     * 화면이 보낸 값을 <b>값 칸에만</b>(엑셀 연결 칸 + 사용자가 직접 입력하는 칸 input&amp;&amp;!mapped) 얹은 새 Doc.
     * values: 표 ref → (칸 키 → 값). 보내지 않은 값 칸은 빈칸.
     * 값 칸이 아닌 키(머리글·라벨 등)·문서에 없는 표는 EditException. 값은 clean(제어문자 거부·trim·100자).
     * <p>⚠️ 보안 메모: 워드에는 w:t 일반 텍스트로만 쓴다(BoardDocDocx.run → XWPFRun.setText) — 수식 주입 처리가 필요 없다.
     * 이 값을 필드 코드(fldSimple·instrText)나 하이퍼링크에 넣지 말 것. CSV/xlsx 내보내기가 생기면
     * =,+,-,@ 로 시작하는 값 앞에 ' 를 붙일 것.
     */
    public static Doc withValues(Doc doc, Map<String, Map<String, String>> values) {
        Map<String, Map<String, String>> in = values == null
                ? new java.util.HashMap<String, Map<String, String>>() : values;
        Set<String> refs = new HashSet<>();
        for (Table t : doc.getTables()) {
            refs.add(t.getId());
        }
        if (!refs.containsAll(in.keySet())) {
            throw new EditException("알 수 없는 표입니다.");
        }
        List<Table> out = new ArrayList<>();
        for (Table t : doc.getTables()) {
            Map<String, String> cells = in.get(t.getId()) == null
                    ? new java.util.HashMap<String, String>() : in.get(t.getId());
            Set<String> mapped = new HashSet<>();                     // 값을 받을 수 있는 칸: 엑셀 연결 칸 + 직접 입력 칸
            List<List<Cell>> rows = new ArrayList<>();
            for (int r = 0; r < t.getRows().size(); r++) {
                List<Cell> dst = new ArrayList<>();
                for (int i = 0; i < t.getRows().get(r).size(); i++) {
                    Cell c = t.getRows().get(r).get(i);
                    String key = c.getKey();
                    String text = c.getText();
                    if (c.isMapped() || c.isInput()) {
                        mapped.add(key);
                        String v = cells.get(key);
                        text = v == null ? "" : clean(v, MAX_CELL, true, null,
                                "칸 값은 " + MAX_CELL + "자 이하로 입력해 주세요.", "칸 값에 쓸 수 없는 문자가 있습니다.");
                    }
                    dst.add(c.withText(text));
                }
                rows.add(dst);
            }
            if (!mapped.containsAll(cells.keySet())) {
                throw new EditException("값을 넣을 수 없는 칸이 포함되어 있습니다.");
            }
            out.add(new Table(t.getId(), t.getMapping(), t.getTitle(), t.getColumns(),
                    t.getRowIds(), t.getColIds(), t.getNextR(), t.getNextC(), rows,
                    t.getNotes().toArray(new String[0])));
        }
        return new Doc(doc.getId(), doc.getName(), out.toArray(new Table[0]));
    }

    /**
     * 제어문자(줄바꿈·탭 포함)·서식 문자(Cf: U+202E 방향 바꿈, U+200B 폭 없는 공백, U+FEFF 등 — ZWJ U+200D 도 포함해 모두)·
     * 짝 없는 서로게이트·U+FFFE/FFFF 거부 후 앞뒤 공백 제거, 길이 검사.
     * 눈에 안 보이거나 화면·워드 표시를 뒤집는 글자로 칸 문구를 위장하는 것을 막는다. 오류 문구는 고정(입력을 싣지 않는다).
     */
    private static String clean(String raw, int max, boolean allowEmpty, String emptyMsg, String longMsg, String badMsg) {
        if (raw == null) {
            throw new EditException(emptyMsg);
        }
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            int type = Character.getType(cp);
            if (type == Character.CONTROL || type == Character.SURROGATE || type == Character.LINE_SEPARATOR
                    || type == Character.PARAGRAPH_SEPARATOR || type == Character.FORMAT
                    || cp == 0xFFFE || cp == 0xFFFF
                    || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C) {   // Java 8 의 유니코드 표는 방향 격리 문자(Cf)를 아직 모른다
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

        // page4 표 C-3: NPV 수익성 (사업초기 + 1~4년차 + 계). 사업초기 열은 CATALOG_VER 2 에서 더해졌다:
        // 화면 순서는 구분, 사업초기, 1~4년차, 계 이지만 열 id 는 기존 c1~c5 를 그대로 두고 새 열만 c6 (id 재사용·이동 금지).
        String[] labels3 = {"총수익(A)", "총비용(B)", "예상영업이익(C)=(A-B)", "출연금 및 예비비(D)", "미회수투자액(PV)"};
        long[][] n = new long[5][5];
        long[] unrecovered = {1600, 1200, 800, 300, 0};
        for (int t = 0; t <= 4; t++) {
            double d = Math.pow(DISCOUNT, t);
            n[0][t] = Math.round(revenue[t] / d);
            n[1][t] = Math.round(cost[t] / d);
            n[2][t] = n[0][t] - n[1][t];
            n[3][t] = Math.round(donate[t] / d);
            n[4][t] = unrecovered[t];
        }
        List<List<Cell>> c3 = rows(row(head("구분"), head("사업초기"), head("1년차"), head("2년차"), head("3년차"),
                head("4년차"), head("계")));
        for (int i = 0; i < 5; i++) {
            List<Cell> r = labeled(lab(labels3[i]), f, n[i]);
            r.add(f.v(i == 4 ? 0 : sum(n[i])));
            c3.add(r);
        }
        Table t3 = new Table("C-3", "C-3", "Ⅲ. 순현재가치(NPV) 수익성", 7,
                sequentialIds("r", 6), Arrays.asList("c0", C3_INIT_COL, "c1", "c2", "c3", "c4", "c5"),
                FIRST_NEW_ID, FIRST_NEW_ID, c3);

        // page4 표 C-4: 투자적정성 분석 (판단기준은 고정 문구)
        Table t4 = new Table("C-4", "C-4", "Ⅳ. 투자적정성 분석", 3, rows(
                row(head("구분"), head("산출값"), head("투자가부 결정 판단기준")),
                row(lab("회수기간법(Payback Period)"), f.vc("3.2년"), lab("목표기간 보다 회수기간 짧을 시 투자 결정")),
                row(lab("순현재가치(NPV)"), f.vc("2,345"), lab("순 현재가치가 \"0\"보다 클 때 투자 결정")),
                row(lab("내부수익률법(IRR)"), f.vc("5.8%"), lab("IRR이 고정자산 기회비용을 상회하는 경우 투자 결정"))),
                "※투입비용은 사업기간 내 연차별 비용을 현재가치로 환산한 값을 적용하고, 수익은 매년 발생하는 명목금액 기준으로 산출",
                "※ 현재가치할인율 3.31% (고정자산 기회비용률)");

        return new Doc(DEFAULT_ID, DEFAULT_NAME, a, b, t2, t3, t4, c5(f));
    }

    /** 값 칸 6개(사업초기, 1~4년차, 계). 샘플 문구는 가상 숫자다. */
    private static void vals6(List<Cell> r, Fill f, int rowNo) {
        for (int c = 0; c < 6; c++) {
            r.add(f.v(String.format(Locale.US, "%,.2f", rowNo * 1.25 + c * 0.5)));
        }
    }

    /** 라벨 칸(들) 뒤에 값 칸 6개를 붙인 한 행. */
    private static List<Cell> c5Row(Fill f, int rowNo, Cell... labels) {
        List<Cell> r = row(labels);
        vals6(r, f, rowNo);
        return r;
    }

    /**
     * 붙임 5 'Ⅴ. 세부 수익성 분석표(명목가치)' (CATALOG_VER 2 에서 추가, 맨 뒤). 9열: 구분1~3, 사업초기, 1~4년차, 계.
     * 머리 1행 + 데이터 25행(행 번호 = 데이터 순번). 값 칸 25×6 = 150 은 엑셀 연결 칸이다. 행·열 id 는 기본(r0~r25, c0~c8).
     */
    private static Table c5(Fill f) {
        List<List<Cell>> t = rows(row(head("구분").span(3, 1), head("사업초기"), head("1년차"), head("2년차"),
                head("3년차"), head("4년차"), head("계")));
        t.add(c5Row(f, 1, lab("수익").span(1, 11), lab("기관수익").span(1, 5), lab("공금예금 수익(a)")));
        t.add(c5Row(f, 2, lab("MMDA 수익(b)")));
        t.add(c5Row(f, 3, lab("정기예금 수익(c)")));
        t.add(c5Row(f, 4, lab("보통예금 수익(d)")));
        t.add(c5Row(f, 5, lab("수익금액 소계")));
        t.add(c5Row(f, 6, lab("부수거래 수익").span(1, 2), lab("본청 공무원 수익(e)")));
        t.add(c5Row(f, 7, lab("수익금액 소계")));
        t.add(c5Row(f, 8, lab("추가수익").span(1, 3), lab("산하기관 이익(f)")));
        t.add(c5Row(f, 9, lab("산하기관 임직원 이익(g)")));
        t.add(c5Row(f, 10, lab("수익금액 소계")));
        t.add(c5Row(f, 11, lab("총 수익").span(2, 1)));
        t.add(c5Row(f, 12, lab("비용").span(1, 8), lab("영업점").span(1, 4), lab("인건비/물건비(h)")));
        t.add(c5Row(f, 13, lab("임차료(i)")));
        t.add(c5Row(f, 14, lab("자동화기기 운영(j)")));
        t.add(c5Row(f, 15, lab("영업점 비용 소계")));
        t.add(c5Row(f, 16, lab("기타").span(1, 3), lab("전산구축/운영비(k)")));
        t.add(c5Row(f, 17, lab("본부 인건비/물건비(l)")));
        t.add(c5Row(f, 18, lab("기타 비용 소계")));
        t.add(c5Row(f, 19, lab("총 비용").span(2, 1)));
        t.add(c5Row(f, 20, lab("예상영업이익").span(3, 1)));
        t.add(c5Row(f, 21, lab("협력사업비(출연금)").span(3, 1)));
        t.add(c5Row(f, 22, lab("예비비").span(3, 1)));
        t.add(c5Row(f, 23, lab("법인세 차감전 순이익").span(3, 1)));
        t.add(c5Row(f, 24, lab("법인세(26.4%)").span(3, 1)));
        t.add(c5Row(f, 25, lab("법인세 차감후 이익").span(3, 1)));
        return new Table(C5_REF, C5_REF, "Ⅴ. 세부 수익성 분석표(명목가치)", 9, t);
    }
}
