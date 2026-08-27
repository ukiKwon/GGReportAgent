package com.kbstar.kgi.ggreport.web.db;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.FileCopyUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * 서울 25개 자치구 시드({@code db/oracle/003_seed_institutions.sql}) — Task 2.3.
 *
 * <p>넣은 값 자체는 골든 {@code 00}(기관 목록 25건)이 대조한다
 * ({@code GoldenReadApiTest}). 여기서 보는 것은 <b>골든이 못 보는 성질</b>이다:
 * 시드를 <b>두 번 돌려도 되는가</b>.
 *
 * <p>왜 중요한가: 원본 {@code py -3 -m server.seed} 는 몇 번을 돌려도 안전했고
 * (있으면 건너뛰고 비어 있는 지역·구분만 채운다), 운영에서 실제로 그렇게 쓴다 —
 * 코퍼스를 더 반입한 뒤 다시 돌리는 식이다. SQL 로 옮기면서 그 성질을 잃으면
 * ⓐ 두 번째 실행이 PK 위반으로 죽거나 ⓑ 더 나쁘게는 <b>사람이 채워 둔 값</b>
 * (계약만료일·차기입찰·단계)을 시드 기본값으로 되돌린다. ⓑ는 아무 오류도 안 내고
 * 데이터만 조용히 사라지는 종류다.
 *
 * <p>⚠️ 이 테스트는 DB 를 건드리므로 {@code @Transactional} 로 <b>롤백</b>한다.
 * 스크립트도 트랜잭션에 묶인 커넥션으로 돌려야 함께 되돌아간다 —
 * {@code DataSource} 에서 새 커넥션을 받으면 롤백 밖이라 다른 테스트가 오염된다.
 * (스크립트 끝의 {@code COMMIT;} 은 SQL*Plus 로 직접 돌릴 때를 위한 것이라
 * 여기서는 걷어내고 실행한다 — 안 그러면 롤백할 것이 남지 않는다.)
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionSeedTest {

    private static final String SEED = "db/oracle/003_seed_institutions.sql";

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    public void 시드가_25건이고_지역과_구분이_채워져_있다() {
        assertEquals(25, count("SELECT COUNT(*) FROM INSTITUTIONS"));
        // 지도가 institutionsByRegion 으로 거르므로 REGION_CODE 가 없으면 안 뜬다.
        assertEquals(25, count("SELECT COUNT(*) FROM INSTITUTIONS "
                + "WHERE REGION_CODE = '11' AND TYPE = '지자체' AND STAGE = 1"));
        assertEquals(25, count("SELECT COUNT(*) FROM INSTITUTIONS "
                + "WHERE GIGANLIST_DIR = 'corpus/institutions/' || INSTITUTION_ID"));
    }

    @Test
    public void 한글이_안_깨진다() {
        // 깨지면 골든 00·01 도 실패하지만 원인이 SQL 이 아니라 **읽을 때의 인코딩**이라
        // 찾기 어렵다(spring.sql.init.encoding). 여기서 이름을 직접 못 박는다.
        assertEquals("노원구", jdbc.queryForObject(
                "SELECT NAME_KO FROM INSTITUTIONS WHERE INSTITUTION_ID = 'nowon'", String.class));
        assertEquals("서대문구", jdbc.queryForObject(
                "SELECT NAME_KO FROM INSTITUTIONS WHERE INSTITUTION_ID = 'seodaemun'", String.class));
    }

    @Test
    public void 다시_돌려도_행이_늘지_않고_사람이_넣은_값을_덮지_않는다() {
        // 운영에서 실제로 생기는 상태: 시드 뒤에 담당자가 계약만료일을 채웠고,
        // 단계도 올라갔다. 지역코드는 (옛 DB 처럼) 비어 있다고 두고 백필을 함께 본다.
        jdbc.update("UPDATE INSTITUTIONS SET CONTRACT_END = '2027-12-31', STAGE = 4,"
                + " REGION_CODE = NULL WHERE INSTITUTION_ID = 'nowon'");

        runSeedAgain();

        assertEquals("시드가 행을 또 넣었다", 25, count("SELECT COUNT(*) FROM INSTITUTIONS"));
        List<String> row = jdbc.queryForList(
                "SELECT CONTRACT_END, REGION_CODE, STAGE FROM INSTITUTIONS"
                        + " WHERE INSTITUTION_ID = 'nowon'")
                .stream().findFirst()
                .map(m -> java.util.Arrays.asList(
                        String.valueOf(m.get("CONTRACT_END")),
                        String.valueOf(m.get("REGION_CODE")),
                        String.valueOf(m.get("STAGE"))))
                .orElseThrow(() -> new AssertionError("nowon 이 사라졌다"));
        assertEquals("사람이 넣은 값이 시드 기본값으로 되돌아갔다",
                java.util.Arrays.asList("2027-12-31", "11", "4"), row);
    }

    @Test
    public void 없어진_기관은_시드가_되살린다() {
        // 반대 방향. 행을 지운 뒤 다시 돌리면 채워져야 한다 — 그래야 "코퍼스를 더
        // 반입하고 시드를 다시 돌린다"는 운영 절차가 성립한다.
        jdbc.update("DELETE FROM INSTITUTIONS WHERE INSTITUTION_ID = 'jung'");
        assertEquals(24, count("SELECT COUNT(*) FROM INSTITUTIONS"));

        runSeedAgain();

        assertEquals(25, count("SELECT COUNT(*) FROM INSTITUTIONS"));
        assertEquals("중구", jdbc.queryForObject(
                "SELECT NAME_KO FROM INSTITUTIONS WHERE INSTITUTION_ID = 'jung'", String.class));
        assertNull(jdbc.queryForObject(
                "SELECT CONTRACT_END FROM INSTITUTIONS WHERE INSTITUTION_ID = 'jung'",
                String.class));
    }

    /** 트랜잭션에 묶인 커넥션으로 시드를 한 번 더 실행한다(클래스 주석 참조). */
    private void runSeedAgain() {
        EncodedResource script = new EncodedResource(
                new ByteArrayResource(withoutCommit().getBytes(StandardCharsets.UTF_8)), "UTF-8");
        jdbc.execute((Connection connection) -> {
            ScriptUtils.executeSqlScript(connection, script);
            return null;
        });
    }

    /**
     * 파일 끝의 {@code COMMIT;} 만 걷어낸 스크립트 본문.
     *
     * <p>그 문장은 SQL*Plus 로 직접 돌리는 사람을 위한 것이다 — 없으면 세션을 닫는
     * 순간 시드가 통째로 사라진다. 하지만 여기서 그대로 실행하면 <b>테스트
     * 트랜잭션이 커밋돼</b> 롤백할 것이 남지 않고, 이 테스트가 바꾼 노원구·중구가
     * 그대로 남아 다음 테스트(골든 00·01)를 깨뜨린다.
     */
    private String withoutCommit() {
        try {
            byte[] raw = FileCopyUtils.copyToByteArray(new ClassPathResource(SEED).getInputStream());
            String sql = new String(raw, StandardCharsets.UTF_8);
            String stripped = sql.replaceAll("(?im)^\\s*COMMIT\\s*;\\s*$", "");
            if (stripped.equals(sql)) {
                throw new AssertionError(SEED + " 에서 COMMIT 을 못 찾았다 — 스크립트가"
                        + " 바뀌었으면 이 테스트의 전제(롤백 가능)도 다시 볼 것");
            }
            return stripped;
        } catch (IOException e) {
            throw new IllegalStateException("시드 스크립트를 못 읽었다: " + SEED, e);
        }
    }

    private int count(String sql) {
        Integer n = jdbc.queryForObject(sql, Integer.class);
        return n == null ? 0 : n;
    }
}
