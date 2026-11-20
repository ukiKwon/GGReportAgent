package com.kbstar.kgi.ggreport.web.docout;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 문서 출력 모델(NEXT 100 S0) — 제목·문단·표·쪽 구분의 불변 값 객체. 렌더러({@link DocxKit})와 분리해 둔다.
 * 표의 칸은 문단·표를 담을 수 있다(표 속 표, 깊이 상한 {@link #MAX_TABLE_DEPTH}). 병합은 colspan·rowspan 으로 적고,
 * 세로 병합으로 가려지는 자리의 칸은 <b>행에서 뺀다</b>({@link Groups#rowspans} 의 0 = 칸 생략). 격자는 {@link Table#layout()} 이 검증한다
 * (겹침·열 초과·행 초과·빈 칸이면 {@link IllegalStateException}).
 * 이사회 자료용 {@code boarddoc.BoardDocSpec} 과 별개다(020·골든 보호).
 */
public final class DocModel {

    public static final int MAX_TABLE_DEPTH = 2;

    public enum Bullet { NONE, CIRCLE_O, DASH }

    public enum Shade { NONE, HEADER, HATCH }

    public enum Align { LEFT, CENTER, RIGHT }

    /** 문서를 이루는 블록: Heading · Para · Table · PageBreak. */
    public interface Block {
    }

    private final List<Block> blocks;

    public DocModel(List<Block> blocks) {
        this.blocks = Collections.unmodifiableList(new ArrayList<Block>(blocks));
    }

    public List<Block> getBlocks() {
        return blocks;
    }

    // ── Run ─────────────────────────────────────────────────────────────

    public static final class Run {
        private final String text;
        private final boolean bold;
        private final boolean superscript;

        public Run(String text, boolean bold, boolean superscript) {
            this.text = text == null ? "" : text;
            this.bold = bold;
            this.superscript = superscript;
        }

        public static Run of(String text) {
            return new Run(text, false, false);
        }

        public static Run bold(String text) {
            return new Run(text, true, false);
        }

        public static Run sup(String text) {
            return new Run(text, false, true);
        }

        public String getText() {
            return text;
        }

        public boolean isBold() {
            return bold;
        }

        public boolean isSuperscript() {
            return superscript;
        }
    }

    // ── 블록 ────────────────────────────────────────────────────────────

    public static final class Heading implements Block {
        private final String text;
        private final int size;

        public Heading(String text, int size) {
            if (size < 6 || size > 40) {
                throw new IllegalArgumentException("heading size");
            }
            this.text = text == null ? "" : text;
            this.size = size;
        }

        public String getText() {
            return text;
        }

        public int getSize() {
            return size;
        }
    }

    public static final class Para implements Block {
        public static final int DEFAULT_PT = 10;

        private final List<Run> runs;
        private final Bullet bullet;
        private final int level;
        private final int size;
        private final Align align;

        public Para(List<Run> runs, Bullet bullet, int level, int size, Align align) {
            if (level < 0 || level > 2) {
                throw new IllegalArgumentException("level 0~2");
            }
            if (size < 6 || size > 40) {
                throw new IllegalArgumentException("para size");
            }
            this.runs = Collections.unmodifiableList(new ArrayList<Run>(runs));
            this.bullet = bullet == null ? Bullet.NONE : bullet;
            this.level = level;
            this.size = size;
            this.align = align == null ? Align.LEFT : align;
        }

        public static Para plain(String text) {
            return new Para(Collections.singletonList(Run.of(text)), Bullet.NONE, 0, DEFAULT_PT, Align.LEFT);
        }

        public static Para of(Bullet bullet, int level, Run... runs) {
            return new Para(Arrays.asList(runs), bullet, level, DEFAULT_PT, Align.LEFT);
        }

        public static Para bullet(Bullet bullet, String text) {
            return of(bullet, 0, Run.of(text));
        }

        public List<Run> getRuns() {
            return runs;
        }

        public Bullet getBullet() {
            return bullet;
        }

        public int getLevel() {
            return level;
        }

        public int getSize() {
            return size;
        }

        public Align getAlign() {
            return align;
        }
    }

    public static final class PageBreak implements Block {
    }

    /**
     * 그림 한 개(JPEG, 본문 속 인라인) — 문단·표 칸 어디에나 둘 수 있다. 크기는 mm, 파일 검사는 호출자 몫(형식·크기).
     * 렌더러는 글자 문단처럼 한 줄을 차지하게 그린다(기관장 Word 사진, e4 11-20 — 추가만, 기존 블록 무변경).
     */
    public static final class Picture implements Block {
        public static final int MAX_MM = 200;
        public static final int MAX_BYTES = 5 * 1024 * 1024;

        private final byte[] data;
        private final int widthEmu;
        private final int heightEmu;
        private final String alt;

        private Picture(byte[] data, double widthMm, double heightMm, String alt) {
            if (data == null || data.length == 0 || data.length > MAX_BYTES) {
                throw new IllegalArgumentException("picture bytes");
            }
            if (!(widthMm > 0) || !(heightMm > 0) || widthMm > MAX_MM || heightMm > MAX_MM) {
                throw new IllegalArgumentException("picture size");
            }
            this.data = data.clone();
            this.widthEmu = (int) Math.round(widthMm * 36000d);    // 1mm = 36000 EMU
            this.heightEmu = (int) Math.round(heightMm * 36000d);
            this.alt = alt == null ? "" : alt;
        }

        public static Picture jpeg(byte[] data, double widthMm, double heightMm, String alt) {
            return new Picture(data, widthMm, heightMm, alt);
        }

        public byte[] getData() {
            return data.clone();
        }

        public int getWidthEmu() {
            return widthEmu;
        }

        public int getHeightEmu() {
            return heightEmu;
        }

        public String getAlt() {
            return alt;
        }
    }

    // ── 표 ──────────────────────────────────────────────────────────────

    public static final class Cell {
        private final List<Block> blocks;
        private final int colspan;
        private final int rowspan;
        private final boolean header;
        private final Shade shade;
        private final Align align;
        private final int depth;   // 이 칸 안의 가장 깊은 표 깊이(없으면 0)

        public Cell(List<Block> blocks, int colspan, int rowspan, boolean header, Shade shade, Align align) {
            if (colspan < 1 || rowspan < 1) {
                throw new IllegalArgumentException("span >= 1");
            }
            int d = 0;
            for (Block b : blocks) {
                if (b instanceof Table) {
                    d = Math.max(d, ((Table) b).depth);
                } else if (b instanceof Heading || b instanceof PageBreak) {
                    throw new IllegalArgumentException("cell holds paragraphs and tables only");
                }
            }
            this.blocks = Collections.unmodifiableList(new ArrayList<Block>(blocks));
            this.colspan = colspan;
            this.rowspan = rowspan;
            this.header = header;
            this.shade = shade == null ? Shade.NONE : shade;
            this.align = align == null ? Align.LEFT : align;
            this.depth = d;
        }

        /** 글자 한 줄 칸. */
        public static Cell text(String text) {
            return new Cell(Collections.<Block>singletonList(Para.plain(text)), 1, 1, false, Shade.NONE, Align.LEFT);
        }

        /** 머리 칸(굵게는 렌더러가 아니라 호출자가 Run 으로 정한다 — 음영 HEADER, 가운데 맞춤). */
        public static Cell header(String text) {
            return new Cell(Collections.<Block>singletonList(new Para(Collections.singletonList(Run.bold(text)), Bullet.NONE, 0,
                    Para.DEFAULT_PT, Align.CENTER)), 1, 1, true, Shade.HEADER, Align.CENTER);
        }

        public static Cell of(List<Block> blocks) {
            return new Cell(blocks, 1, 1, false, Shade.NONE, Align.LEFT);
        }

        public Cell withSpan(int colspan, int rowspan) {
            return new Cell(blocks, colspan, rowspan, header, shade, align);
        }

        public Cell withShade(Shade s) {
            return new Cell(blocks, colspan, rowspan, header, s, align);
        }

        public List<Block> getBlocks() {
            return blocks;
        }

        public int getColspan() {
            return colspan;
        }

        public int getRowspan() {
            return rowspan;
        }

        public boolean isHeader() {
            return header;
        }

        public Shade getShade() {
            return shade;
        }

        public Align getAlign() {
            return align;
        }
    }

    public static final class Table implements Block {
        private final int columns;
        private final double[] colWidthsPct;   // null = 균등
        private final List<List<Cell>> rows;
        private final int headerRows;
        private final boolean rowsCantSplit;
        private final int depth;

        /**
         * @param colWidthsPct null 이거나 열 수와 같은 길이(양수). 합이 100 이 아니어도 비율로 쓴다.
         * @param headerRows   앞쪽 몇 행을 쪽마다 되풀이할 머리 행(tblHeader)으로 쓸지
         * @param rowsCantSplit 행을 쪽 사이에서 자르지 않는다 — 겉 표(긴 칸)에는 false, 작은 표·평가표에는 true
         */
        public Table(int columns, double[] colWidthsPct, List<List<Cell>> rows, int headerRows, boolean rowsCantSplit) {
            if (columns < 1 || columns > 20) {
                throw new IllegalArgumentException("columns 1~20");
            }
            if (colWidthsPct != null) {
                if (colWidthsPct.length != columns) {
                    throw new IllegalArgumentException("colWidthsPct length");
                }
                for (double w : colWidthsPct) {
                    if (!(w > 0)) {
                        throw new IllegalArgumentException("colWidthsPct positive");
                    }
                }
            }
            if (rows.isEmpty()) {
                throw new IllegalStateException("table has no rows");
            }
            if (headerRows < 0 || headerRows > rows.size()) {
                throw new IllegalArgumentException("headerRows");
            }
            List<List<Cell>> copy = new ArrayList<List<Cell>>();
            int d = 0;
            for (List<Cell> r : rows) {
                copy.add(Collections.unmodifiableList(new ArrayList<Cell>(r)));
                for (Cell c : r) {
                    d = Math.max(d, c.depth);
                }
            }
            this.depth = 1 + d;
            if (this.depth > MAX_TABLE_DEPTH) {
                throw new IllegalStateException("table depth > " + MAX_TABLE_DEPTH);
            }
            this.columns = columns;
            this.colWidthsPct = colWidthsPct == null ? null : colWidthsPct.clone();
            this.rows = Collections.unmodifiableList(copy);
            this.headerRows = headerRows;
            this.rowsCantSplit = rowsCantSplit;
            layout();   // 만들 때 격자를 검증한다
        }

        public int getColumns() {
            return columns;
        }

        public double[] getColWidthsPct() {
            return colWidthsPct == null ? null : colWidthsPct.clone();
        }

        public List<List<Cell>> getRows() {
            return rows;
        }

        public int getHeaderRows() {
            return headerRows;
        }

        public boolean isRowsCantSplit() {
            return rowsCantSplit;
        }

        public int getDepth() {
            return depth;
        }

        /**
         * 격자 배치 — {@code [행][행 안 칸 번호] = 시작 열}. 위 행의 세로 병합이 차지한 자리는 건너뛴다.
         * 겹침·열 초과·행 초과·덜 채운 행이면 {@link IllegalStateException}.
         */
        public int[][] layout() {
            int rn = rows.size();
            boolean[][] occ = new boolean[rn][columns];
            int[][] start = new int[rn][];
            for (int r = 0; r < rn; r++) {
                List<Cell> row = rows.get(r);
                start[r] = new int[row.size()];
                int c = 0;
                for (int i = 0; i < row.size(); i++) {
                    while (c < columns && occ[r][c]) {
                        c++;
                    }
                    Cell cell = row.get(i);
                    if (c + cell.colspan > columns) {
                        throw new IllegalStateException("row " + r + " exceeds columns");
                    }
                    if (r + cell.rowspan > rn) {
                        throw new IllegalStateException("row " + r + " rowspan exceeds rows");
                    }
                    for (int dr = 0; dr < cell.rowspan; dr++) {
                        for (int dc = 0; dc < cell.colspan; dc++) {
                            if (occ[r + dr][c + dc]) {
                                throw new IllegalStateException("cells overlap at row " + (r + dr));
                            }
                            occ[r + dr][c + dc] = true;
                        }
                    }
                    start[r][i] = c;
                    c += cell.colspan;
                }
                while (c < columns && occ[r][c]) {
                    c++;
                }
                if (c < columns) {
                    throw new IllegalStateException("row " + r + " has empty grid slots");
                }
            }
            return start;
        }
    }
}
