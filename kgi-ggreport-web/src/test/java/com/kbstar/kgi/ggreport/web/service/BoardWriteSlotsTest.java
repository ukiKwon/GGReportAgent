package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardExcelFixture;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/**
 * security S3 — 실패한 업로드도 동시 처리 슬롯(세마포어)을 돌려준다. 슬롯 조회가 패키지 전용이라 service 패키지에 둔다.
 * 마스터 8203417(관리자). 엑셀은 가상이다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BoardWriteSlotsTest {

    private static final String ADMIN = "8203417";
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    @Autowired
    private BoardWriteService service;

    @Test
    public void 깨진_업로드_3번_뒤에도_슬롯이_모두_돌아오고_정상_업로드가_된다() throws Exception {
        byte[] broken = new byte[4 + 1024];
        broken[0] = 'P';
        broken[1] = 'K';
        broken[2] = 3;
        broken[3] = 4;
        for (int i = 0; i < 3; i++) {
            try {
                service.upload(ADMIN, "default_doc", null, new MockMultipartFile("file", "가상.xlsx", XLSX, broken));
                fail("BROKEN 이어야 한다");
            } catch (ApiException e) {
                assertEquals(422, e.getStatus());
                assertEquals("BROKEN", ((Map<?, ?>) e.getDetailObject()).get("code"));
            }
        }
        assertEquals(service.getConcurrency(), service.availableSlots());
        assertEquals(2, service.getConcurrency());
        Map<String, Object> ok = service.upload(ADMIN, "default_doc", null,
                new MockMultipartFile("file", "가상.xlsx", XLSX, BoardExcelFixture.xlsx(null)));
        assertEquals(95, ((Map<?, ?>) ok.get("summary")).get("total"));
        assertEquals(service.getConcurrency(), service.availableSlots());
    }
}
