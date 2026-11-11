package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

import static org.junit.Assert.assertEquals;

/**
 * 기관장 사진 롤백(NEXT 72·77, 테스트 55) — 이력(LOG) 삽입이 실패하면 사진 행도 되돌아가고 저장 폴더에 새 파일이 남지 않는다.
 *
 * <p>⚠️ 일부러 {@code @Transactional} 을 붙이지 않는다 — 테스트 트랜잭션이 서비스 트랜잭션을 삼키면 롤백 여부를 볼 수 없다
 * ({@link PrepRollbackApiTest} 와 같은 방식). 실패 주입: H2 에 임시 CHECK 제약({@code EVENT_CD <> 'PHOTO_ADD'})을 걸었다가 뒤정리에서 푼다.
 * 이 테스트가 만든 기관장 행(기관 dongjak)·접근 이력은 앞뒤로 지운다.
 */
@RunWith(SpringRunner.class)
@AppTest
public class HeadPhotoRollbackApiTest extends HeadApiTestBase {

    private static final String INST3 = "dongjak";
    private static final String CK = "CK_TMP_NO_PHOTO_ADD";
    private static final Path DIR = Paths.get("target/head-photo-test");

    private long accessLogBase;
    private boolean constraint;

    @Before
    public void 앞정리() {
        cleanRows();
        accessLogBase = jdbc.queryForObject("SELECT COALESCE(MAX(LOG_ID), 0) FROM ACCESS_LOG", Long.class);
    }

    @After
    public void 뒤정리() {
        if (constraint) {
            jdbc.execute("ALTER TABLE INST_HEAD_LOG DROP CONSTRAINT " + CK);
            constraint = false;
        }
        cleanRows();
        jdbc.update("DELETE FROM ACCESS_LOG WHERE LOG_ID > ?", accessLogBase);
    }

    private void cleanRows() {
        jdbc.update("DELETE FROM INST_HEAD_ITEM WHERE INSTITUTION_ID=?", INST3);
        jdbc.update("DELETE FROM INST_HEAD_PHOTO WHERE INSTITUTION_ID=?", INST3);
        jdbc.update("DELETE FROM INST_HEAD_LOG WHERE INSTITUTION_ID=?", INST3);
        jdbc.update("DELETE FROM INST_HEAD_ACT WHERE INSTITUTION_ID=?", INST3);
        jdbc.update("DELETE FROM INST_HEAD WHERE INSTITUTION_ID=?", INST3);
    }

    private long fileCount() throws Exception {
        if (!Files.isDirectory(DIR)) {
            return 0;
        }
        try (Stream<Path> s = Files.list(DIR)) {
            return s.count();
        }
    }

    @Test
    public void 이력_삽입이_실패하면_사진_행과_저장_파일이_함께_사라진다() throws Exception {
        long head = addHeadOk(INST3, T1, "홍길동", "구청장");
        long before = fileCount();
        jdbc.execute("ALTER TABLE INST_HEAD_LOG ADD CONSTRAINT " + CK + " CHECK (EVENT_CD <> 'PHOTO_ADD')");
        constraint = true;

        MvcResult r = upload(INST3, T1, head, "face.jpg", jpeg(300, 400), "KOGL1");

        assertEquals(text(r), 500, r.getResponse().getStatus());
        assertEquals("사진 행이 되돌아갔다", 0, count("SELECT COUNT(*) FROM INST_HEAD_PHOTO WHERE HEAD_ID=?", head));
        assertEquals("저장 폴더에 새 파일이 없다", before, fileCount());
        assertEquals("이력도 남지 않았다", 0, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='PHOTO_ADD' AND HEAD_ID=?", head));
    }
}
