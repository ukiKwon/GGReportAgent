package com.kbstar.kgi.ggreport.web.docfill;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelFixture;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 서식 문자열 호출 비용 상한(N3)과 개인정보 검사 방문 글자 수 총량 상한(N4). */
public class XlsxBookGuardTest {

    private static final long MB = 1024L * 1024;
    private static final XlsxBook.Limits LIM = new XlsxBook.Limits(20 * MB, 40 * MB, 200000, 200000);

    private static String repeat(char ch, int n) {
        char[] a = new char[n];
        java.util.Arrays.fill(a, ch);
        return new String(a);
    }

    @Test
    public void 서식_문자열이_255자를_넘으면_숨김_아님() {
        assertTrue(XlsxBook.hiddenNumber(";;;", 1));
        assertTrue(XlsxBook.hiddenNumber(";;;" + repeat(' ', 252), 1));        // 255자: 판정한다
        assertFalse(XlsxBook.hiddenNumber(";;;" + repeat(' ', 253), 1));       // 256자: 숨김 아님
        assertTrue(XlsxBook.hiddenText(";;;;"));
        assertFalse(XlsxBook.hiddenText(";;;;" + repeat(' ', 300)));
    }

    @Test
    public void 방문_글자_수_상한을_넘으면_TOO_MANY_CELLS_메모_적중도_센다() throws Exception {
        byte[] data = BoardExcelFixture.xlsx(wb -> {
            Sheet s = wb.createSheet("반복");
            for (int i = 0; i < 100; i++) {
                Row r = s.createRow(i);
                r.createCell(0).setCellValue("abcdefghij");      // 모두 같은 문자열 → 메모 적중
            }
        });
        try (XlsxBook b = XlsxBook.open(data, LIM)) {
            b.maxVisitChars = 500;                                // 고유 글자는 한 번만 쌓이지만 방문은 1000자
            try {
                b.scanPii();
                fail("방문 글자 수 초과는 거부되어야 한다");
            } catch (XlsxBook.Rejected e) {
                assertEquals(422, e.status);
                assertEquals("TOO_MANY_CELLS", e.code);
            }
        }
        try (XlsxBook b = XlsxBook.open(data, LIM)) {
            b.scanPii();                                          // 기본 상한(50,000,000) 안이면 통과
        }
    }
}
