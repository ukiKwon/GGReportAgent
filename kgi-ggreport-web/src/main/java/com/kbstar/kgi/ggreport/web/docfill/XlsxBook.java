package com.kbstar.kgi.ggreport.web.docfill;

import com.kbstar.kgi.ggreport.web.support.Pii;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFCell;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * 업로드된 .xlsx 를 <b>캐시값만</b> 읽는다(재계산·외부 함수 실행 없음, WorkbookFactory 미사용 → HSSF 경로 없음).
 * 열기 전에 {@link ZipGuard} 로 실제 압축 해제량·중복 entry 를 검사하고, 매크로는 zip 이름·[Content_Types].xml 로 거른다.
 * 거부는 코드만 담는다 — POI 메시지·임시 경로는 밖으로 내보내지 않는다(cause 는 예외 클래스 단순 이름, 로그용).
 */
public final class XlsxBook implements Closeable {

    public static final int GRID_CLIP = 200;

    public static final class Limits {
        final long maxEntry;
        final long maxTotal;
        final int maxCells;

        public Limits(long maxEntry, long maxTotal, int maxCells) {
            this.maxEntry = maxEntry;
            this.maxTotal = maxTotal;
            this.maxCells = maxCells;
        }
    }

    public static final class Rejected extends Exception {
        public final int status;
        public final String code;
        public final String cause;

        Rejected(int status, String code, String cause) {
            super(code, null, false, false);
            this.status = status;
            this.code = code;
            this.cause = cause;
        }
    }

    /** display = 서식 적용 표시값(응답에 싣는 것), raw = 원값(숫자는 정수/평문 표현). problem 이 있으면 값 없음. */
    public static final class Value {
        static final Value EMPTY = new Value("", "", null);
        public final String display;
        public final String raw;
        public final String problem;
        /** 숫자 셀(또는 숫자 캐시값 수식)에서 읽었을 때만 true — 문자열·불리언은 false. */
        public final boolean numeric;

        Value(String display, String raw, String problem) {
            this(display, raw, problem, false);
        }

        /** 서식이 숫자 구역을 모두 비워 엑셀 화면에는 안 보이는 숫자(예 ";;;")면 true. 서식 문자열은 싣지 않는다. */
        public final boolean hiddenFormat;

        Value(String display, String raw, String problem, boolean numeric) {
            this(display, raw, problem, numeric, false);
        }

        Value(String display, String raw, String problem, boolean numeric, boolean hiddenFormat) {
            this.display = display;
            this.raw = raw;
            this.problem = problem;
            this.numeric = numeric;
            this.hiddenFormat = hiddenFormat;
        }
    }

    public static final class PiiHit {
        public final String sheet;
        public final int row;
        public final int col;
        public final String label;
        public final String kind;

        PiiHit(String sheet, int row, int col, String label, String kind) {
            this.sheet = sheet;
            this.row = row;
            this.col = col;
            this.label = label;
            this.kind = kind;
        }

        public String ref() {
            return row < 0 ? label + "!(시트 이름)" : label + "!" + new CellReference(row, col).formatAsString();
        }
    }

    private final OPCPackage pkg;
    private final XSSFWorkbook wb;
    private final boolean externalLinks;
    private final DataFormatter fmt = new DataFormatter(Locale.KOREA);

    private XlsxBook(OPCPackage pkg, XSSFWorkbook wb, boolean externalLinks) {
        this.pkg = pkg;
        this.wb = wb;
        this.externalLinks = externalLinks;
    }

    public static XlsxBook open(byte[] data, Limits lim) throws Rejected {
        if (isOle2(data) || !isZip(data)) {
            throw new Rejected(415, "NOT_XLSX", null);         // .xls·암호 걸린 xlsx(OLE2)·기타
        }
        ZipGuard.Result z;
        try {
            z = ZipGuard.check(data, lim.maxEntry, lim.maxTotal);
        } catch (ZipGuard.Rejected e) {
            throw new Rejected(422, e.code, null);
        }
        if (macro(z)) {
            throw new Rejected(422, "MACRO", null);
        }
        boolean ext = false;
        for (String n : z.names) {
            ext |= n.startsWith("xl/externallinks/");
        }
        OPCPackage pkg = null;
        try {
            pkg = OPCPackage.open(new ByteArrayInputStream(data));
            XlsxBook b = new XlsxBook(pkg, new XSSFWorkbook(pkg), ext);
            if (b.cellCount(lim.maxCells) > lim.maxCells) {
                b.close();
                throw new Rejected(422, "TOO_MANY_CELLS", null);
            }
            return b;
        } catch (Rejected r) {
            throw r;
        } catch (Exception e) {                                // InvalidFormat·IO·POIXML·Runtime
            if (pkg != null) {
                pkg.revert();
            }
            throw new Rejected(422, "BROKEN", e.getClass().getSimpleName());
        }
    }

    public boolean hasExternalLinks() { return externalLinks; }

    public Sheet sheet(String name) { return wb.getSheet(name); }

    public boolean isHidden(Sheet s) {
        int i = wb.getSheetIndex(s);
        return wb.isSheetHidden(i) || wb.isSheetVeryHidden(i);
    }

    public static boolean rowHidden(Sheet s, int row) {
        Row r = s.getRow(row);
        return r != null && r.getZeroHeight();
    }

    public Value value(Sheet s, int row, int col) {
        Row r = s.getRow(row);
        return valueOf(r == null ? null : r.getCell(col));
    }

    Value valueOf(Cell c) {
        if (c == null) {
            return Value.EMPTY;
        }
        CellType t = c.getCellType();
        if (t == CellType.FORMULA) {
            if (!((XSSFCell) c).getCTCell().isSetV()) {
                return new Value("", "", "NO_CACHED_VALUE");
            }
            t = c.getCachedFormulaResultType();
        }
        switch (t) {
            case NUMERIC:
                double d = c.getNumericCellValue();
                CellStyle st = c.getCellStyle();
                return new Value(fmt.formatRawCellContents(d, st.getDataFormat(), st.getDataFormatString()), raw(d), null, true,
                        hiddenNumber(st.getDataFormatString(), d));
            case STRING:
                String s = c.getRichStringCellValue().getString();
                return new Value(s, s, null, false, hiddenText(c.getCellStyle().getDataFormatString()));
            case BOOLEAN:
                String b = c.getBooleanCellValue() ? "TRUE" : "FALSE";
                return new Value(b, b, null);
            case ERROR:
                return new Value("", "", "EXCEL_ERROR");
            default:
                return Value.EMPTY;
        }
    }

    /**
     * 숫자 셀의 값 부호에 해당하는 구역이 숨김이면 true. 구역 1개=전체, 2개=양수·0은 1번/음수는 2번,
     * 3개 이상=양수/음수/0. 서식 문자열은 어디에도 싣지 않는다.
     */
    public static boolean hiddenNumber(String f, double d) {
        List<String> sec = sections(f);
        if (sec.isEmpty()) {
            return false;
        }
        int i;
        if (sec.size() == 1) {
            i = 0;
        } else if (sec.size() == 2) {
            i = d < 0 ? 1 : 0;
        } else {
            i = d > 0 ? 0 : d < 0 ? 1 : 2;
        }
        return invisible(sec.get(i));
    }

    /** 문자열 셀: 4번째 구역이 있고 숨김이면 true. */
    public static boolean hiddenText(String f) {
        List<String> sec = sections(f);
        return sec.size() >= 4 && invisible(sec.get(3));
    }

    /** 따옴표 리터럴·\x·_x·*x·[...] 를 걷어낸 뒤 자리표시자(0 # ? @)도 영문자(General·날짜 서식)도 없으면 안 보이는 구역. */
    private static boolean invisible(String stripped) {
        for (int i = 0; i < stripped.length(); i++) {
            char ch = stripped.charAt(i);
            if (ch == '0' || ch == '#' || ch == '?' || ch == '@'
                    || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
                return false;
            }
        }
        return true;
    }

    /** ';' 로 구역을 나누되 따옴표 안·괄호 안의 ';' 는 무시하고, 리터럴·이스케이프·조건 부분은 이미 걷어낸 문자열을 돌려준다. */
    private static List<String> sections(String f) {
        List<String> out = new ArrayList<>();
        if (f == null || f.isEmpty()) {
            return out;
        }
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < f.length(); i++) {
            char ch = f.charAt(i);
            if (ch == '"') {
                int e = f.indexOf('"', i + 1);
                i = e < 0 ? f.length() : e;
            } else if (ch == '[') {
                int e = f.indexOf(']', i + 1);
                i = e < 0 ? f.length() : e;
            } else if (ch == '\\' || ch == '_' || ch == '*') {
                i++;
            } else if (ch == ';') {
                out.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        out.add(cur.toString());
        return out;
    }

    /** 숫자 원값 — 정수면 정수 표현(서식에 가려진 13자리도 그대로), 아니면 평문 소수. */
    static String raw(double d) {
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            return "";
        }
        if (d == Math.rint(d) && Math.abs(d) < 1e15) {
            return Long.toString((long) d);
        }
        return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
    }

    /** 통합문서 전체(숨은 시트 포함). 칸마다 표시값·원값 둘 다 검사하고, 종류별로 칸당 1건. 시트 이름도 검사. */
    public List<PiiHit> scanPii() {
        List<PiiHit> hits = new ArrayList<>();
        for (int i = 0; i < wb.getNumberOfSheets(); i++) {
            Sheet s = wb.getSheetAt(i);
            Set<String> nameKinds = kinds(s.getSheetName(), null);
            String label = nameKinds.isEmpty() ? s.getSheetName() : "#" + (i + 1);
            for (String k : nameKinds) {
                hits.add(new PiiHit(s.getSheetName(), -1, -1, label, k));
            }
            for (Row r : s) {
                for (Cell c : r) {
                    Value v = valueOf(c);
                    for (String k : kinds(v.display, v.raw)) {
                        hits.add(new PiiHit(s.getSheetName(), r.getRowNum(), c.getColumnIndex(), label, k));
                    }
                }
            }
        }
        return hits;
    }

    private static Set<String> kinds(String a, String b) {
        Set<String> out = new LinkedHashSet<>();
        for (Pii.Finding f : Pii.scan(a)) {
            out.add(f.getKind());
        }
        if (b != null && !b.equals(a)) {
            for (Pii.Finding f : Pii.scan(b)) {
                out.add(f.getKind());
            }
        }
        return out;
    }

    /** 출처 격자: 범위 안 표시값(칸당 200자 자름)·병합. */
    public Map<String, Object> grid(String sheetName, CellRangeAddress range) {
        Sheet s = wb.getSheet(sheetName);
        List<String> cols = new ArrayList<>();
        for (int c = range.getFirstColumn(); c <= range.getLastColumn(); c++) {
            cols.add(CellReference.convertNumToColString(c));
        }
        List<List<String>> rows = new ArrayList<>();
        for (int r = range.getFirstRow(); r <= range.getLastRow(); r++) {
            List<String> row = new ArrayList<>();
            for (int c = range.getFirstColumn(); c <= range.getLastColumn(); c++) {
                Value v = value(s, r, c);
                String d = v.problem == null ? v.display : "";
                row.add(d.length() > GRID_CLIP ? d.substring(0, GRID_CLIP) : d);
            }
            rows.add(row);
        }
        List<String> merges = new ArrayList<>();
        for (CellRangeAddress m : s.getMergedRegions()) {
            if (range.intersects(m)) {
                merges.add(m.formatAsString());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sheet", sheetName);
        out.put("range", range.formatAsString());
        out.put("first_row", range.getFirstRow() + 1);
        out.put("cols", cols);
        out.put("rows", rows);
        out.put("merges", merges);
        return out;
    }

    private int cellCount(int max) {
        int n = 0;
        for (Sheet s : wb) {
            for (Row r : s) {
                n += r.getPhysicalNumberOfCells();
                if (n > max) {
                    return n;
                }
            }
        }
        return n;
    }

    private static boolean macro(ZipGuard.Result z) {
        for (String n : z.names) {
            if (n.endsWith("vbaproject.bin") || n.startsWith("xl/macrosheets/")
                    || n.startsWith("xl/dialogsheets/") || n.startsWith("xl/activex/")) {
                return true;
            }
        }
        String ct = z.contentTypes == null ? ""
                : new String(z.contentTypes, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        return ct.contains("macroenabled") || ct.contains("vbaproject");
    }

    private static boolean isZip(byte[] d) {
        return d.length >= 4 && d[0] == 'P' && d[1] == 'K' && d[2] == 3 && d[3] == 4;
    }

    private static boolean isOle2(byte[] d) {
        int[] sig = {0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1};
        if (d.length < sig.length) {
            return false;
        }
        for (int i = 0; i < sig.length; i++) {
            if ((d[i] & 0xFF) != sig[i]) {
                return false;
            }
        }
        return true;
    }

    @Override
    public void close() {
        pkg.revert();                                          // 스트림으로 연 패키지 — 저장 없이 버린다
    }
}
