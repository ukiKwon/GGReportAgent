package com.kbstar.kgi.ggreport.web.boarddoc;

import com.kbstar.kgi.ggreport.web.docfill.XlsxBook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * S6a — 실제 지도(excel-map.json, v2)로 가상 샘플 수익성분석표를 채운다. 샘플의 모든 값은 가상이다.
 * 샘플은 {@code boarddoc/profit_sample.xlsx}(테스트 자원) 또는 {@code ../docs/samples/} 에서 읽는다.
 *
 * <p>기대값은 두 겹이다. 명목 값은 샘플 생성기(docs/samples/GenProfitSample.java.txt) 수식으로 손으로 계산한 고정값,
 * 현재가치(PV) 등은 같은 바이트를 POI 로 직접 열어(라벨 시작 글자·고정 열 번호) 읽은 원값을 명세대로 환산한 독립 오라클.
 * 오라클은 BoardLabel·BoardExcelResolve 를 쓰지 않는다.
 */
public class BoardProfitSampleTest {

    /** 세부 산출표 열(0-기준): 사업초기, 1~4년, 계. 5년 열 = 9. */
    private static final int[] DETAIL_COLS = {4, 5, 6, 7, 8, 10};
    /** 3-2 열: 사업초기, 1~4년, 계. 5년 열 = 7. */
    private static final int[] PV_COLS = {2, 3, 4, 5, 6, 8};
    private static final int DETAIL_FIVE = 9;
    private static final int PV_FIVE = 7;

    private static byte[] sample() throws Exception {
        ClassPathResource cp = new ClassPathResource("boarddoc/profit_sample.xlsx");
        if (cp.exists()) {
            try (InputStream in = cp.getInputStream()) {
                return StreamUtils.copyToByteArray(in);
            }
        }
        File dir = new File("../docs/samples");
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.getName().endsWith("가짜값.xlsx")) {
                    return Files.readAllBytes(f.toPath());
                }
            }
        }
        return null;
    }

    // ── 독립 오라클 ──

    private static final class Oracle {
        final Sheet s;
        final int t2, t3;

        Oracle(Sheet s) {
            this.s = s;
            this.t2 = rowOf("2. 세부 산출표", 0, 0);
            this.t3 = rowOf("3. 투자 및 출연금 적정성 검토", 0, 0);
        }

        String str(int r, int c) {
            Row row = s.getRow(r);
            Cell cell = row == null ? null : row.getCell(c);
            return cell != null && cell.getCellType() == CellType.STRING ? cell.getStringCellValue().trim() : "";
        }

        int rowOf(String exact, int col, int from) {
            for (int r = from; r <= s.getLastRowNum(); r++) {
                if (exact.equals(str(r, col))) {
                    return r;
                }
            }
            throw new AssertionError("row not found");
        }

        double num(int r, int c) {
            return s.getRow(r).getCell(c).getNumericCellValue();
        }

        /** 세부 산출표(2.~3. 사이) 구분 열 0~3 중 하나가 prefix 로 시작하는 첫 행의 col 값. */
        double detail(String prefix, int col) {
            for (int r = t2 + 1; r < t3; r++) {
                for (int c = 0; c < 4; c++) {
                    if (str(r, c).startsWith(prefix)) {
                        return num(r, col);
                    }
                }
            }
            throw new AssertionError("detail row not found");
        }

        /** 3-2(3. 이후) 구분 열 1 이 prefix 로 시작하는 첫 행의 col 값. */
        double pv(String prefix, int col) {
            for (int r = t3 + 1; r <= s.getLastRowNum(); r++) {
                if (str(r, 1).startsWith(prefix)) {
                    return num(r, col);
                }
            }
            throw new AssertionError("pv row not found");
        }

        int valueRow() {
            return rowOf("값", 0, t3);
        }
    }

    /** 백만원 합 → 억원 둘째 자리 문자열(명세 그대로: 칸마다 소수 6자리 → 합 → ÷100 → 둘째 자리 HALF_UP). */
    private static String eok(double... parts) {
        BigDecimal sum = BigDecimal.ZERO;
        for (double d : parts) {
            sum = sum.add(BigDecimal.valueOf(d).setScale(6, RoundingMode.HALF_UP));
        }
        return sum.movePointLeft(2).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    // ── 응답 도우미 ──

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object o) {
        return (List<Map<String, Object>>) o;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return (Map<String, Object>) o;
    }

    private static Map<String, Object> table(Map<String, Object> out, String ref) {
        for (Map<String, Object> t : list(out.get("tables"))) {
            if (ref.equals(t.get("ref"))) {
                return t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    private static Map<String, Object> cell(Map<String, Object> out, String ref, String key) {
        for (Map<String, Object> c : list(table(out, ref).get("cells"))) {
            if (key.equals(c.get("key"))) {
                return c;
            }
        }
        throw new AssertionError("cell not found " + ref + " " + key);
    }

    private static void expect(Map<String, Object> out, String ref, String key, String value) {
        Map<String, Object> c = cell(out, ref, key);
        assertEquals(ref + " " + key + " 값", value, c.get("value"));
        assertEquals(ref + " " + key + " 상태", "filled", c.get("status"));
    }

    // ── 시험 ──

    @Test
    public void 샘플을_실제_지도로_채운다() throws Exception {
        byte[] data = sample();
        assertNotNull("profit_sample.xlsx 를 src/test/resources/boarddoc/ 에 복사하거나 docs/samples 에 둔다", data);

        Map<String, Object> out;
        try (XlsxBook b = BoardSourceFixture.open(data)) {
            assertTrue(BoardExcelFill.structure(b, new BoardExcelMap(), java.util.Arrays.asList("A", "B", "C-2", "C-3", "C-4")).isEmpty());
            out = BoardExcelFill.fill(b, new BoardExcelMap(), BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false));
        }

        // 요약
        Map<String, Object> sm = map(out.get("summary"));
        assertEquals(95, sm.get("total"));
        assertEquals(94, sm.get("filled"));
        assertEquals(0, sm.get("failed"));
        assertEquals(1, sm.get("manual"));                                  // 기관명
        assertEquals(0, sm.get("review"));
        assertEquals(0, sm.get("warnings"));
        assertEquals(0, sm.get("label_mismatch_tables"));
        assertTrue(((List<?>) out.get("unmapped_tables")).isEmpty());
        assertTrue(((List<?>) out.get("assumptions")).isEmpty());           // 단위는 모두 확정(사용자 2026-11-05)

        // 고정값(손계산, 명목)
        expect(out, "A", "r1c2", "5.00");
        expect(out, "A", "r2c1", "1.00");
        expect(out, "A", "r3c1", "4.50");
        expect(out, "A", "r4c1", "10.50");
        String[] b1 = {"48.51", "36.85", "11.66", "5.00 (1.00)", "5.66", "5.32", "0.34"};
        for (int i = 0; i < b1.length; i++) {
            expect(out, "B", "r1c" + (2 + i), b1[i]);
        }
        expect(out, "B", "r2c4", "5.00 (1.00)");                            // D·F 모두 사업초기에만 값이 있어 PV 와 같다
        assertEquals("5.00", cell(out, "B", "r1c5").get("main_value"));
        assertEquals("1.00", cell(out, "B", "r1c5").get("sub_value"));
        String[][] c2 = {
                {"0.00", "8.96", "9.33", null, null, "48.51"},
                {"8.50", "5.60", "5.63", null, null, "36.85"},
                {"-8.50", "3.36", "3.70", null, null, "11.66"},
                {"6.00", "0.00", "0.00", null, null, "6.00"},
                {"-14.50", "3.36", "3.70", null, null, "5.66"},
                {"0.00", "0.89", "0.98", null, null, "5.32"},
                {"-14.50", "2.47", "2.72", null, null, "0.34"}};
        for (int r = 0; r < c2.length; r++) {
            for (int j = 0; j < 6; j++) {
                if (c2[r][j] != null) {
                    expect(out, "C-2", "r" + (r + 1) + "c" + (j + 1), c2[r][j]);
                }
            }
        }
        for (int j = 1; j <= 4; j++) {
            expect(out, "C-3", "r4c" + j, "0.00");
        }
        expect(out, "C-3", "r4c5", "6.00");
        String[] un = {"5.20", "4.10", "2.80", "1.50", "0.00"};                // 미회수 투자액(PV) 1~4년·계 (5년 칸은 0)
        for (int j = 1; j <= 5; j++) {
            expect(out, "C-3", "r5c" + j, un[j - 1]);
        }
        assertEquals("3.4년", cell(out, "C-4", "r1c1").get("value"));

        // 독립 오라클 비교(현재가치 등)
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(data))) {
            Oracle o = new Oracle(wb.getSheetAt(0));
            String[] dl = {"총수익(A)", "총비용(B)", "영업이익(C)", null, "출연금, 기부금 차감 후 영업이익(G)",
                    "법인세 및 법인세분지방소득세(H)", "예상 순이익(I)"};
            String[] pl = {"총 수익 현가(A)", "총비용 현가(B)", "예상 영업이익 현가", null,
                    "출연금, 기부금 예비비 차감 후 영업이익 현가", "법인세 및 법인세분 지방소득세 현가(H)", "예상 순이익 현가(I)"};
            // A
            expect(out, "A", "r1c2", eok(o.detail("출연금(D)", 10)));
            expect(out, "A", "r2c1", eok(o.detail("예비비(F)", 10)));
            expect(out, "A", "r3c1", eok(o.detail("전산구축비", 10)));
            // B 명목·현재가치
            for (int i = 0; i < 7; i++) {
                String nominal = i == 3 ? eok(o.detail("출연금(D)", 10)) + " (" + eok(o.detail("예비비(F)", 10)) + ")"
                        : eok(o.detail(dl[i], 10));
                String present = i == 3 ? eok(o.pv("출연금 현가(D)", 8)) + " (" + eok(o.pv("예비비 현가(F)", 8)) + ")"
                        : eok(o.pv(pl[i], 8));
                expect(out, "B", "r1c" + (2 + i), nominal);
                expect(out, "B", "r2c" + (1 + i), present);
            }
            // C-2
            for (int j = 0; j < 6; j++) {
                for (int i = 0; i < 7; i++) {
                    String want = i == 3 ? eok(o.detail("출연금(D)", DETAIL_COLS[j]), o.detail("예비비(F)", DETAIL_COLS[j]))
                            : eok(o.detail(dl[i], DETAIL_COLS[j]));
                    expect(out, "C-2", "r" + (i + 1) + "c" + (j + 1), want);
                }
                expect(out, "C-2", "r8c" + (j + 1), eok(o.pv("순이익(NPV)", PV_COLS[j])));
            }
            // C-3 (사업초기 열 제외 — y1..y4, 계)
            for (int j = 0; j < 5; j++) {
                int col = PV_COLS[j + 1];
                String[] want = {eok(o.pv(pl[0], col)), eok(o.pv(pl[1], col)), eok(o.pv(pl[2], col)),
                        eok(o.pv("출연금 현가(D)", col), o.pv("예비비 현가(F)", col))};
                for (int i = 0; i < 4; i++) {
                    expect(out, "C-3", "r" + (i + 1) + "c" + (j + 1), want[i]);
                }
            }
            // C-4
            int vr = o.valueRow();
            assertEquals(o.str(vr, 1), cell(out, "C-4", "r1c1").get("value"));
            String npv = (String) cell(out, "C-4", "r2c1").get("value");
            assertEquals(eok(o.num(vr, 2)), npv);
            assertTrue("NPV 는 음수 표기", npv.startsWith("-"));
            assertEquals(o.str(vr, 3), cell(out, "C-4", "r3c1").get("value"));

            // 5년 열은 읽히지 않는다
            for (String ref : new String[]{"A", "B", "C-2", "C-3", "C-4"}) {
                for (Map<String, Object> c : list(table(out, ref).get("cells"))) {
                    for (Map<String, Object> p : list(c.get("parts"))) {
                        CellReference at = new CellReference((String) p.get("cell"));
                        assertNotEquals(at.getRow() < o.t3 ? DETAIL_FIVE : PV_FIVE, (int) at.getCol());
                    }
                }
            }
        }
    }
}
