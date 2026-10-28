package com.kbstar.kgi.ggreport.web.docfill;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.CellValue;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * 엑셀에서 <b>화면에 보이는 그대로의 글자</b>를 읽는다.
 *
 * <p>워드에 옮겨 적을 값은 사람이 엑셀에서 눈으로 본 값이어야 한다 — {@code #,##0} 서식의
 * 1234567이 "1,234,567"로, 날짜 서식 셀이 "2026-10-27"로 나와야 한다(원시 숫자 1234567이나
 * 46322가 문서에 들어가면 사고다). 그래서 {@link DataFormatter}로 <b>셀 서식을 적용</b>해 읽고,
 * 수식 셀은 {@link FormulaEvaluator}로 <b>계산한 결과</b>를 쓴다.
 *
 * <p>값을 못 가져온 이유는 예외가 아니라 {@link Found#problem}에 담는다 — 규칙이 여러 개일 때
 * 하나가 틀렸다고 나머지까지 멈추면 안 되고, 어떤 규칙이 왜 틀렸는지가 보고서에 남아야 한다.
 */
public final class ExcelSource implements Closeable {

    /** 조회 결과. {@code problem}이 null이면 {@code value}가 쓸 값이다. */
    public static final class Found {
        public final String value;
        public final String problem;

        private Found(String value, String problem) {
            this.value = value;
            this.problem = problem;
        }

        static Found ok(String value) { return new Found(value, null); }
        static Found problem(String problem) { return new Found(null, problem); }
    }

    private final Workbook workbook;
    private final FormulaEvaluator evaluator;
    // 로케일을 고정한다 — 서버 PC의 지역 설정에 따라 같은 셀이 다르게 읽히면 안 된다.
    private final DataFormatter formatter = new DataFormatter(Locale.KOREA);

    private ExcelSource(Workbook workbook) {
        this.workbook = workbook;
        this.evaluator = workbook.getCreationHelper().createFormulaEvaluator();
    }

    public static ExcelSource open(InputStream in) throws IOException {
        return new ExcelSource(WorkbookFactory.create(in));
    }

    public Found valueAt(String sheetName, String address) {
        Sheet sheet = sheet(sheetName);
        if (sheet == null) return Found.problem("시트를 찾을 수 없다: " + sheetName);
        CellReference ref;
        try {
            ref = new CellReference(address);
        } catch (RuntimeException e) {
            return Found.problem("셀 주소가 올바르지 않다: " + address);
        }
        int rowIdx = ref.getRow();
        int colIdx = ref.getCol();
        // 병합 셀의 값은 왼쪽 위 칸에만 있다 — 안쪽 주소를 줘도 사람이 보는 값(병합의 값)을 준다.
        for (CellRangeAddress r : sheet.getMergedRegions()) {
            if (r.isInRange(rowIdx, colIdx)) {
                rowIdx = r.getFirstRow();
                colIdx = r.getFirstColumn();
                break;
            }
        }
        Row row = sheet.getRow(rowIdx);
        Cell cell = row == null ? null : row.getCell(colIdx);
        return text(cell, sheet.getSheetName() + "!" + address);
    }

    /**
     * 머리글 행에서 {@code valueHeader}·{@code keyHeader} 열을 찾고, 그 아래에서
     * {@code keyHeader} 열이 {@code keyValue}인 행의 {@code valueHeader} 열 값을 돌려준다.
     * 조건에 맞는 행이 둘 이상이면 <b>고르지 않고 문제로 보고한다</b> — 첫 줄을 조용히 쓰면
     * 동명 기관이 있을 때 엉뚱한 금액이 제안서에 들어간다.
     */
    public Found lookup(String sheetName, int headerRow, String valueHeader,
                        String keyHeader, String keyValue) {
        Sheet sheet = sheet(sheetName);
        if (sheet == null) return Found.problem("시트를 찾을 수 없다: " + sheetName);
        Row header = sheet.getRow(headerRow - 1);
        if (header == null) return Found.problem("머리글 행이 비어 있다: " + headerRow + "행");
        int valueCol = -1;
        int keyCol = -1;
        for (Cell c : header) {
            String h = formatter.formatCellValue(c, evaluator).trim();
            if (h.equals(valueHeader.trim())) valueCol = c.getColumnIndex();
            if (h.equals(keyHeader.trim())) keyCol = c.getColumnIndex();
        }
        if (valueCol < 0) return Found.problem("머리글을 찾을 수 없다: " + valueHeader);
        if (keyCol < 0) return Found.problem("머리글을 찾을 수 없다: " + keyHeader);

        Row hit = null;
        int hits = 0;
        for (int r = headerRow; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            Cell k = row.getCell(keyCol);
            if (k != null && formatter.formatCellValue(k, evaluator).trim().equals(keyValue.trim())) {
                hit = row;
                hits++;
            }
        }
        if (hits == 0) return Found.problem(keyHeader + " = '" + keyValue + "' 인 행이 없다");
        if (hits > 1) return Found.problem(keyHeader + " = '" + keyValue + "' 인 행이 " + hits + "개라 하나로 정할 수 없다");
        return text(hit.getCell(valueCol), sheet.getSheetName() + "[" + keyValue + "]." + valueHeader);
    }

    private Sheet sheet(String name) {
        if (name == null || name.trim().isEmpty()) {
            return workbook.getNumberOfSheets() == 0 ? null : workbook.getSheetAt(0);
        }
        return workbook.getSheet(name);
    }

    private Found text(Cell cell, String where) {
        String t = cell == null ? "" : display(cell);
        if (t.trim().isEmpty()) return Found.problem("값이 비어 있다: " + where);
        // 수식 오류(#DIV/0! #REF! …)는 값이 아니다 — 문서에 "#REF!"가 인쇄되면 안 된다.
        if (t.startsWith("#") && (t.endsWith("!") || t.endsWith("?") || t.equals("#N/A"))) {
            return Found.problem("엑셀 오류값(" + t + "): " + where);
        }
        return Found.ok(t);
    }

    /**
     * 화면에 보이는 글자. POI가 날짜로 인식하지 못하는 한글 날짜 서식만 직접 푼다(ExcelDateFormat).
     */
    private String display(Cell cell) {
        String fmt = cell.getCellStyle() == null ? null : cell.getCellStyle().getDataFormatString();
        if (ExcelDateFormat.isNonAsciiDateFormat(fmt)) {
            Double n = numeric(cell);
            if (n != null) {
                boolean use1904 = workbook instanceof XSSFWorkbook && ((XSSFWorkbook) workbook).isDate1904();
                return ExcelDateFormat.format(fmt, DateUtil.getJavaDate(n, use1904));
            }
        }
        return formatter.formatCellValue(cell, evaluator);
    }

    /** 숫자 셀이거나 숫자로 계산되는 수식 셀의 값. 그 밖이면 null. */
    private Double numeric(Cell cell) {
        if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
        if (cell.getCellType() == CellType.FORMULA) {
            CellValue v = evaluator.evaluate(cell);
            if (v != null && v.getCellType() == CellType.NUMERIC) return v.getNumberValue();
        }
        return null;
    }

    @Override
    public void close() throws IOException {
        workbook.close();
    }
}
