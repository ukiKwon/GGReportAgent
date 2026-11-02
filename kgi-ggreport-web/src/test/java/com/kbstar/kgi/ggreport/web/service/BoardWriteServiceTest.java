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
        BoardWriteService s = new BoardWriteService(forms(), map, 5, 20, 40, 200000, 2);
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

    @Test
    public void 슬롯이_없으면_503_BUSY() throws Exception {
        BoardWriteService s = new BoardWriteService(forms(), new BoardExcelMap(), 5, 20, 40, 200000, 0);
        ApiException e = rejected(s, BoardExcelFixture.xlsx(null));
        assertEquals(503, e.getStatus());
        assertEquals("BUSY", ((Map<?, ?>) e.getDetailObject()).get("code"));
    }
}
