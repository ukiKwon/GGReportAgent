package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.CTMergeCells;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.CTWorksheet;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.function.Consumer;

/**
 * 가상 원본(수익성분석표 모양) — 위치 해석 시험용. 모든 글자·숫자는 가상. 칸 값 = 행번호(0-기준)*100 + 열번호(0-기준),
 * 단 머리가 "5년" 인 열은 큰 수(읽히면 시험이 실패하도록).
 *
 * <pre>
 * 시트 "수익성분석"
 *  r0..3   요약표(미끼): 총수익(A)=777, 총비용(B)=555
 *  r5      "2.세부 산출표"      r6 머리글(구분 A:D 병합, E.. = headers)
 *  r7      총수익(A) (A:D 가로 병합)
 *  r8..14  수익(A 세로) / 기관수익(B 8..10) / 공금예금(a)(C 8..9) / 수익·이익(D) / 소계(C10:D10)
 *          부수거래(B 11..13) / 임직원(C 11..12) / 수익·이익(D) / 소계(C13:D13) / 소계(B14:D14)
 *  r15 총비용(B)  r16 영업이익(C) = (A)-(B)
 *  r17..18 인건비(A 세로) / 본부부서 인건비(B:D 가로 병합) 두 행
 *  r20     "3.투자 및 출연금 적정성 검토"
 *  r21     "3-1.판단 기준표"   r22 머리글(회수기간법, 순 현재가치(NPV), 내부수익률법)   r23 값
 *  r25     "3-2.회수 기간 계산"  r26 머리글(구분 A:B 병합, C.. = headers)   r27 총수익 현가(A)   r28 총비용 현가(B)
 * </pre>
 */
public final class BoardSourceFixture {

    public static final XlsxBook.Limits LIMITS = new XlsxBook.Limits(20L << 20, 40L << 20, 200000);
    public static final String SHEET = "수익성분석";
    public static final long BIG = 987654321012L;
    public static final String[] HEADERS = {"사업초기", "1년", "2년", "3년", "4년", "5년", "계"};

    private BoardSourceFixture() {
    }

    public static XlsxBook open(byte[] data) throws XlsxBook.Rejected {
        return XlsxBook.open(data, LIMITS);
    }

    public static byte[] book(String[] headers, Consumer<XSSFWorkbook> tweak) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet(SHEET);
            text(s, 0, 0, "1.요약표");
            text(s, 1, 0, "구분");
            text(s, 1, 1, "금액");
            text(s, 2, 0, "총수익(A)");
            num(s, 2, 1, 777);
            text(s, 3, 0, "총비용(B)");
            num(s, 3, 1, 555);

            text(s, 5, 0, "2.세부 산출표");
            text(s, 6, 0, "구분");
            merge(s, 6, 0, 6, 3);
            for (int i = 0; i < headers.length; i++) {
                text(s, 6, 4 + i, headers[i]);
            }
            text(s, 7, 0, "총수익(A)");
            merge(s, 7, 0, 7, 3);
            text(s, 8, 0, "수익");
            merge(s, 8, 0, 14, 0);
            text(s, 8, 1, "기관수익");
            merge(s, 8, 1, 10, 1);
            text(s, 8, 2, "공금예금(a)");
            merge(s, 8, 2, 9, 2);
            text(s, 8, 3, "수익");
            text(s, 9, 3, "이익");
            text(s, 10, 2, "소계");
            merge(s, 10, 2, 10, 3);
            text(s, 11, 1, "부수거래");
            merge(s, 11, 1, 13, 1);
            text(s, 11, 2, "임직원");
            merge(s, 11, 2, 12, 2);
            text(s, 11, 3, "수익");
            text(s, 12, 3, "이익");
            text(s, 13, 2, "소계");
            merge(s, 13, 2, 13, 3);
            text(s, 14, 1, "소계");
            merge(s, 14, 1, 14, 3);
            text(s, 15, 0, "총비용(B)");
            merge(s, 15, 0, 15, 3);
            text(s, 16, 0, "영업이익(C) = (A)-(B)");
            merge(s, 16, 0, 16, 3);
            text(s, 17, 0, "인건비");
            merge(s, 17, 0, 18, 0);
            text(s, 17, 1, "본부부서 인건비");
            merge(s, 17, 1, 17, 3);
            text(s, 18, 1, "본부부서 인건비");
            merge(s, 18, 1, 18, 3);
            for (int r = 7; r <= 18; r++) {
                for (int i = 0; i < headers.length; i++) {
                    num(s, r, 4 + i, valueFor(headers[i], r, 4 + i));
                }
            }

            text(s, 20, 0, "3.투자 및 출연금 적정성 검토");
            text(s, 21, 0, "3-1.판단 기준표");
            text(s, 22, 0, "회수기간법");
            text(s, 22, 1, "순 현재가치(NPV)");
            text(s, 22, 2, "내부수익률법");
            num(s, 23, 0, 4);
            num(s, 23, 1, 123);
            num(s, 23, 2, 7);

            text(s, 25, 0, "3-2.회수 기간 계산");
            text(s, 26, 0, "구분");
            merge(s, 26, 0, 26, 1);
            for (int i = 0; i < headers.length; i++) {
                text(s, 26, 2 + i, headers[i]);
            }
            text(s, 27, 0, "총수익 현가(A)");
            merge(s, 27, 0, 27, 1);
            text(s, 28, 0, "총비용 현가(B)");
            merge(s, 28, 0, 28, 1);
            for (int r = 27; r <= 28; r++) {
                for (int i = 0; i < headers.length; i++) {
                    num(s, r, 2 + i, valueFor(headers[i], r, 2 + i));
                }
            }
            if (tweak != null) {
                tweak.accept(wb);
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    public static byte[] book(Consumer<XSSFWorkbook> tweak) throws IOException {
        return book(HEADERS, tweak);
    }

    /**
     * 작은 시트 "S": r0 "2.세부 산출표", r1 머리글(A 구분, C 사업초기, D 계), r2..4 = B 열 라벨 가/나/다, A 열은 빈 칸(bigMerge 면
     * A3:A1048576 "수익" 병합으로 상속). 값 칸은 C,D = 행번호*100 + 열번호.
     */
    public static byte[] simple(boolean bigMerge, Consumer<XSSFWorkbook> tweak) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet("S");
            text(s, 0, 0, "2.세부 산출표");
            text(s, 1, 0, "구분");
            text(s, 1, 2, "사업초기");
            text(s, 1, 3, "계");
            String[] names = {"가", "나", "다"};
            for (int i = 0; i < 3; i++) {
                text(s, 2 + i, 1, names[i]);
                num(s, 2 + i, 2, (2 + i) * 100 + 2);
                num(s, 2 + i, 3, (2 + i) * 100 + 3);
            }
            if (bigMerge) {
                text(s, 2, 0, "수익");
                s.addMergedRegion(new CellRangeAddress(2, 1048575, 0, 0));
            }
            if (tweak != null) {
                tweak.accept(wb);
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    /** POI 의 겹침 검사를 거치지 않고 병합 영역을 XML 에 직접 더한다(겹침·대량 병합 시험용). */
    public static void rawMerge(Sheet s, String ref) {
        CTWorksheet ws = ((XSSFSheet) s).getCTWorksheet();
        CTMergeCells mc = ws.isSetMergeCells() ? ws.getMergeCells() : ws.addNewMergeCells();
        mc.addNewMergeCell().setRef(ref);
        mc.setCount(mc.sizeOfMergeCellArray());
    }

    static long valueFor(String header, int row, int col) {
        return "5년".equals(header) ? BIG : row * 100L + col;
    }

    static void text(Sheet s, int r, int c, String v) {
        cell(s, r, c).setCellValue(v);
    }

    static void num(Sheet s, int r, int c, double v) {
        cell(s, r, c).setCellValue(v);
    }

    static void merge(Sheet s, int r0, int c0, int r1, int c1) {
        s.addMergedRegion(new CellRangeAddress(r0, r1, c0, c1));
    }

    private static org.apache.poi.ss.usermodel.Cell cell(Sheet s, int r, int c) {
        Row row = s.getRow(r) != null ? s.getRow(r) : s.createRow(r);
        return row.getCell(c) != null ? row.getCell(c) : row.createCell(c);
    }
}
