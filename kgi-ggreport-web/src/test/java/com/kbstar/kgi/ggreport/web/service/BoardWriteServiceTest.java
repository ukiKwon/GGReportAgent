package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelFixture;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelMap;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * BoardWriteService 단위 — DB 없이 양식 조회만 흉내 낸다. 시트 이름 대소문자(개인정보 범위 판정)·슬롯 소진.
 * 엑셀·번호는 모두 가상이다.
 */
public class BoardWriteServiceTest {

    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private static BoardFormService forms() {
        BoardFormService f = mock(BoardFormService.class);
        BoardDocSpec.Doc d = BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, false);
        when(f.formForWrite(any(), any(), any()))
                .thenReturn(new BoardFormService.WriteTarget(BoardDocSpec.DEFAULT_ID, null, d.getName(), d));
        return f;
    }

    private static ApiException rejected(BoardWriteService s, byte[] data) {
        try {
            s.upload("0000000", BoardDocSpec.DEFAULT_ID, null, new MockMultipartFile("file", "가상.xlsx", XLSX, data));
            fail("거부되어야 한다");
            return null;
        } catch (ApiException e) {
            return e;
        }
    }

    @Test
    public void 영문_지도_시트와_소문자_파일_시트의_매핑_칸_개인정보는_422() throws Exception {
        BoardExcelMap map = BoardExcelFixture.mapWithSheet("A", "Donation");
        BoardWriteService s = new BoardWriteService(forms(), map, 5, 20, 40, 200000, 200000, 2);
        byte[] x = BoardExcelFixture.xlsx(wb -> {
            wb.setSheetName(wb.getSheetIndex("기부금"), "donation");
            wb.getSheet("donation").getRow(2).getCell(2).setCellValue(Double.parseDouble(BoardExcelFixture.FAKE_RRN));
        });
        ApiException e = rejected(s, x);
        assertEquals(422, e.getStatus());
        Map<?, ?> d = (Map<?, ?>) e.getDetailObject();
        assertEquals("PII_DETECTED", d.get("code"));
        assertEquals(1, d.get("count"));
        assertEquals(2, s.availableSlots());
    }

    private static String code(ApiException e) {
        return String.valueOf(((Map<?, ?>) e.getDetailObject()).get("code"));
    }

    @Test
    public void 행_수_상한을_넘는_엑셀은_422_TOO_MANY_CELLS() throws Exception {
        BoardWriteService s = new BoardWriteService(forms(), BoardExcelFixture.legacyMap(), 5, 20, 40, 200000, 1, 2);
        ApiException e = rejected(s, BoardExcelFixture.xlsx(null));
        assertEquals(422, e.getStatus());
        assertEquals("TOO_MANY_CELLS", code(e));
        assertEquals(2, s.availableSlots());
    }

    @Test
    public void 한_칸_글자가_32767자를_넘는_엑셀은_422_CELL_TOO_LONG() throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 32768; i++) {
            sb.append('x');
        }
        byte[] data = BoardExcelFixture.withEntry(zipWithoutShared(), "xl/sharedStrings.xml",
                ("<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><si><t>" + sb
                        + "</t></si></sst>").getBytes("UTF-8"));
        BoardWriteService s = new BoardWriteService(forms(), BoardExcelFixture.legacyMap(), 5, 20, 40, 200000, 200000, 2);
        ApiException e = rejected(s, data);
        assertEquals(422, e.getStatus());
        assertEquals("CELL_TOO_LONG", code(e));
        assertEquals(2, s.availableSlots());
    }

    /** 공유 문자열 표가 없는 정상 xlsx(숫자·inline 만) 대신, 빈 zip 에 항목을 더하는 바탕. */
    private static byte[] zipWithoutShared() throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream z = new java.util.zip.ZipOutputStream(out)) {
            z.putNextEntry(new java.util.zip.ZipEntry("[Content_Types].xml"));
            z.write("<Types/>".getBytes("UTF-8"));
            z.closeEntry();
        }
        return out.toByteArray();
    }

    @Test
    public void 슬롯이_없으면_503_BUSY() throws Exception {
        BoardWriteService s = new BoardWriteService(forms(), BoardExcelFixture.legacyMap(), 5, 20, 40, 200000, 200000, 0);
        ApiException e = rejected(s, BoardExcelFixture.xlsx(null));
        assertEquals(503, e.getStatus());
        assertEquals("BUSY", ((Map<?, ?>) e.getDetailObject()).get("code"));
    }
}
