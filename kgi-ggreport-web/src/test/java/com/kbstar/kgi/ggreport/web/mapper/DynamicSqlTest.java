package com.kbstar.kgi.ggreport.web.mapper;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.kbstar.kgi.ggreport.web.config.MyBatisConfig;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import org.apache.ibatis.session.Configuration;
import org.junit.Test;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * 동적 SQL({@code <set>}·{@code <choose>}·{@code <if>}·{@code <foreach>})과
 * <b>방언 분기({@code databaseId})</b>가 실제로 어떤 문장을 만드는지 본다.
 * DB 도 스프링 컨텍스트도 없이 돈다 — MyBatis 의 {@code getBoundSql()} 덕분이다.
 *
 * <p>이게 없으면 동적 SQL 은 <b>단계 2에서 그 분기를 처음 타는 순간까지</b> 한 번도
 * 실행되지 않는다. OGNL 식의 오타({@code upd.present(…)} 의 이름 하나)는 컴파일도
 * 컨텍스트 기동도 통과한 뒤 하필 화면에서 터진다.
 *
 * <p>그리고 <b>방언 분기는 더 늦게 터진다</b> — 접속한 DB 에 맞는 쪽만 로드되므로,
 * MySQL 로 개발하는 동안 Oracle 분기는 <b>한 번도 파싱되지 않는다.</b> 여기서 두 벌을
 * 각각 만들어 양쪽을 같은 무게로 본다({@link MapperConfigurations}).
 *
 * <p>⚠️ SQL 이 <b>맞는지</b>가 아니라 <b>어떤 모양으로 만들어지는지</b>만 본다.
 * 실행 검증은 내부망 Oracle 의 몫이다(설계 §8).
 */
public class DynamicSqlTest {

    private static final Configuration ORACLE = MapperConfigurations.parse(MyBatisConfig.ORACLE);
    private static final Configuration MYSQL = MapperConfigurations.parse(MyBatisConfig.MYSQL);

    private final ObjectMapper json = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

    /** 방언이 안 갈리는 문장은 아무 쪽에서 봐도 같다. Oracle 쪽을 기준으로 읽는다. */
    private static String sql(Class<?> mapper, String method, Map<String, Object> params) {
        return MapperConfigurations.sql(ORACLE, mapper, method, params);
    }

    private static Map<String, Object> params(Object... keyValues) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }

    // ── 방언이 갈리는 자리 (한 쌍이다 — 한쪽만 고치면 여기서 걸린다) ─────────────

    @Test
    public void 페이징은_MySQL이_LIMIT_Oracle이_FETCH_FIRST다() {
        Map<String, Object> p = params("recipients", Arrays.asList("영업팀", "dave"),
                "unreadOnly", Boolean.FALSE, "limit", 50);
        String mysql = MapperConfigurations.sql(MYSQL, NotificationMapper.class,
                "selectByRecipients", p);
        String oracle = MapperConfigurations.sql(ORACLE, NotificationMapper.class,
                "selectByRecipients", p);

        assertTrue("MySQL 분기에 LIMIT 이 없다: " + mysql, mysql.contains("LIMIT ?"));
        assertFalse("MySQL 에 없는 FETCH FIRST 가 들어갔다: " + mysql, mysql.contains("FETCH FIRST"));

        assertTrue("Oracle 분기에 FETCH FIRST 가 없다: " + oracle,
                oracle.contains("FETCH FIRST ? ROWS ONLY"));
        assertFalse("Oracle 에 없는 LIMIT 이 들어갔다: " + oracle, oracle.contains("LIMIT"));

        assertNotEquals("두 방언이 같은 SQL 이다 — 분기가 하나만 실린 것 아닌지 확인할 것",
                mysql, oracle);
        // 갈리는 것은 행 제한 절뿐이다. 나머지 조건은 양쪽이 같아야 한다.
        for (String each : new String[]{mysql, oracle}) {
            assertTrue(each, each.contains("RECIPIENT IN ( ? , ? )"));
            assertTrue(each, each.contains("ORDER BY CREATED_AT DESC"));
        }
    }

    @Test
    public void 담당자_조회는_MySQL만_DISTINCT를_쓴다() {
        Map<String, Object> p = params("team", "영업", "assignee", "dave");
        String mysql = MapperConfigurations.sql(MYSQL, BidCaseMapper.class, "selectForAssignee", p);
        String oracle = MapperConfigurations.sql(ORACLE, BidCaseMapper.class, "selectForAssignee", p);

        assertTrue("MySQL 분기가 원본(SQLite)과 다른 모양이다: " + mysql,
                mysql.toUpperCase().contains("SELECT DISTINCT"));
        // Oracle 은 CLOB 컬럼에 DISTINCT 를 못 쓴다(ORA-00932).
        assertFalse("Oracle 분기에 DISTINCT 가 들어갔다 — ORA-00932 로 죽는다: " + oracle,
                oracle.toUpperCase().contains("DISTINCT"));
        assertTrue("Oracle 분기가 준결합이 아니다: " + oracle, oracle.contains("BID_CASE_ID IN"));
        assertNotEquals(mysql, oracle);
    }

    @Test
    public void 안읽음_조건은_두_방언_모두에_붙는다() {
        Map<String, Object> p = params("recipients", Arrays.asList("영업팀"),
                "unreadOnly", Boolean.TRUE, "limit", 50);
        assertTrue(MapperConfigurations.sql(MYSQL, NotificationMapper.class,
                "selectByRecipients", p).contains("READ_AT IS NULL"));
        assertTrue(MapperConfigurations.sql(ORACLE, NotificationMapper.class,
                "selectByRecipients", p).contains("READ_AT IS NULL"));
    }

    // ── 기관 부분 갱신: 보낸 필드만 SET 에 들어간다 ────────────────────────────

    @Test
    public void 보낸_필드만_SET에_들어간다() throws Exception {
        InstitutionUpdateIn upd = json.readValue("{\"term\": 3}", InstitutionUpdateIn.class);
        String sql = sql(InstitutionMapper.class, "updateFields",
                params("institutionId", "dobong", "upd", upd));

        assertTrue(sql, sql.contains("TERM ="));
        assertFalse("보내지도 않은 컬럼이 갱신 대상이 됐다: " + sql, sql.contains("REGION_CODE ="));
        assertFalse("보내지도 않은 컬럼이 갱신 대상이 됐다: " + sql, sql.contains("LAST_BID ="));
        // <set> 이 꼬리 쉼표를 떼는지 — 안 떼면 `SET TERM = ? WHERE` 가 문법 오류가 된다.
        assertFalse("SET 절에 꼬리 쉼표가 남았다: " + sql, sql.contains(", WHERE"));
    }

    @Test
    public void null을_보낸_필드도_SET에_들어간다() throws Exception {
        // "안 보냄"과 "null 을 보냄"의 구분이 SQL 까지 살아 있는지 — 여기가 term 을
        // 비울 수 없던 옛 결함의 자리다.
        InstitutionUpdateIn upd = json.readValue("{\"term\": null}", InstitutionUpdateIn.class);
        String sql = sql(InstitutionMapper.class, "updateFields",
                params("institutionId", "dobong", "upd", upd));
        assertTrue("null 을 보냈는데 SET 에 없다 — 지울 방법이 사라진다: " + sql,
                sql.contains("TERM ="));
    }

    @Test
    public void 다섯_필드를_모두_보내면_모두_들어간다() throws Exception {
        InstitutionUpdateIn upd = json.readValue(
                "{\"region_code\":\"11\",\"type\":\"지자체\",\"contract_end\":\"2027-01-01\","
                        + "\"last_bid\":\"2023-01-01\",\"term\":3}",
                InstitutionUpdateIn.class);
        String sql = sql(InstitutionMapper.class, "updateFields",
                params("institutionId", "dobong", "upd", upd));
        for (String col : new String[]{"REGION_CODE =", "TYPE =", "CONTRACT_END =",
                                       "LAST_BID =", "TERM ="}) {
            assertTrue(col + " 가 빠졌다: " + sql, sql.contains(col));
        }
    }

    // ── 공고 갱신: 신뢰도에 따라 날짜 컬럼이 갈린다 ─────────────────────────────

    @Test
    public void 확정이면_확정일에_예상이면_예상일에_넣는다() {
        String confirmed = sql(BidCaseMapper.class, "updateFromNotice",
                params("bidCaseId", "bc-1", "confidence", "확정", "date", "2026-09-01",
                        "title", "t", "noticeUrl", "u", "lastSyncedAt", "now"));
        assertTrue(confirmed, confirmed.contains("CONFIRMED_DATE = COALESCE"));
        assertFalse("확정인데 예상일을 건드린다 — '언제 예상했었나'가 사라진다: " + confirmed,
                confirmed.contains("EXPECTED_DATE ="));

        String expected = sql(BidCaseMapper.class, "updateFromNotice",
                params("bidCaseId", "bc-1", "confidence", "예상", "date", "2026-09-01",
                        "title", "t", "noticeUrl", "u", "lastSyncedAt", "now"));
        assertTrue(expected, expected.contains("EXPECTED_DATE = COALESCE"));
        assertFalse(expected, expected.contains("CONFIRMED_DATE ="));
    }

    // ── 참여 결정: 상태를 안 넘기면 상태를 건드리지 않는다 ──────────────────────

    @Test
    public void 상태를_안_넘기면_상태를_안_건드린다() {
        String sql = sql(BidCaseMapper.class, "updateParticipationDecision",
                params("bidCaseId", "bc-1", "decision", null, "participationStatus", null));
        assertTrue(sql, sql.contains("PARTICIPATION_DECISION ="));
        assertFalse("1·2단 결재가 상태까지 바꾸려 한다: " + sql,
                sql.contains("PARTICIPATION_STATUS ="));
    }

    @Test
    public void 상태를_넘기면_함께_바꾼다() {
        String sql = sql(BidCaseMapper.class, "updateParticipationDecision",
                params("bidCaseId", "bc-1", "decision", null, "participationStatus", "참여확정"));
        assertTrue(sql, sql.contains("PARTICIPATION_STATUS ="));
    }

    @Test
    public void 한_수신자_조회에도_안읽음_조건이_붙는다() {
        String one = sql(NotificationMapper.class, "selectByRecipient",
                params("recipient", "영업팀", "unreadOnly", Boolean.TRUE));
        assertTrue(one, one.contains("READ_AT IS NULL"));
        assertFalse(sql(NotificationMapper.class, "selectByRecipient",
                params("recipient", "영업팀", "unreadOnly", Boolean.FALSE))
                .contains("READ_AT IS NULL"));
    }

    // ── 이관 과정에서 일부러 바꾼 자리(되돌리지 말 것) ─────────────────────────

    @Test
    public void 최신공고는_두_방언_모두_SEQ_NO로_고른다() {
        // SEQ_NO 덕분에 이 문장은 방언이 안 갈린다 — 그 사실 자체를 고정한다.
        String oracle = MapperConfigurations.sql(ORACLE, BidCaseMapper.class,
                "selectLatestPerInstitution", params());
        String mysql = MapperConfigurations.sql(MYSQL, BidCaseMapper.class,
                "selectLatestPerInstitution", params());
        assertEquals("한 벌이어야 하는 문장이 방언별로 갈렸다", oracle, mysql);
        assertTrue("SEQ_NO 가 아니다: " + oracle, oracle.contains("MAX(SEQ_NO)"));
        assertFalse("ROWID 로 되돌아갔다 — Oracle 에서 조용히 틀린 답이 나온다: " + oracle,
                oracle.toUpperCase().contains("ROWID"));
    }

    @Test
    public void 작업요약에_최종결재자가_없다() {
        // 골든 14 가 "final_approver 는 언제나 null" 을 계약으로 고정했다.
        String sql = sql(TaskMapper.class, "selectSummaries", params("bidCaseId", "bc-1"));
        assertFalse("SELECT 에 FINAL_APPROVER 가 들어갔다 — 골든 14 가 깨진다: " + sql,
                sql.contains("FINAL_APPROVER"));
    }

    @Test
    public void 공고_INSERT는_두_방언_모두_SEQ_NO를_안_넘긴다() {
        // 넘기면 Oracle IDENTITY / MySQL AUTO_INCREMENT 가 아니라 앱이 값을 정하게 되고,
        // INSERT 가 한 벌로 끝나던 이유(2026-08-26 결정 ①)가 사라진다.
        String oracle = MapperConfigurations.sql(ORACLE, BidCaseMapper.class, "insert", params());
        String mysql = MapperConfigurations.sql(MYSQL, BidCaseMapper.class, "insert", params());
        assertEquals("INSERT 가 방언별로 갈렸다 — SEQ_NO 결정의 전제가 깨졌다", oracle, mysql);
        assertFalse(oracle, oracle.contains("SEQ_NO"));
        assertTrue("participation_decision 을 명시하지 않으면 MySQL 에서 NULL 이 된다: " + oracle,
                oracle.contains("PARTICIPATION_DECISION"));
    }

    @Test
    public void 옛_컬럼을_뽑지_않는다() {
        // 2026-08-06 에 제거된 SCORING_TABLE 이 옛 DB 에 남아 있어도 실려 오면 안 된다.
        String sql = sql(InstitutionMapper.class, "selectAll", params());
        assertFalse(sql, sql.toUpperCase().contains("SCORING_TABLE"));
        assertFalse("SELECT * 는 테이블에 컬럼이 늘면 응답이 바뀐다: " + sql, sql.contains("*"));
        assertEquals("컬럼 수가 달라졌다: " + sql,
                10, countChar(sql.substring(0, sql.indexOf("FROM")), ','));
    }

    private static int countChar(String s, char c) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == c) { n++; }
        }
        return n;
    }
}
