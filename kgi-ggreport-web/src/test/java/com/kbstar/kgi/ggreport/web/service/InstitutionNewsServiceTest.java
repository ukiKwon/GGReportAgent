package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 기관 뉴스 반입·조회(060) — 판 규칙·멱등·감사(NEWS_IMPORT)·열린 수집 요청 닫기(CLOSE_REASON=NEWS)·조회 응답에 사번 없음. 기관 jongno, ADMIN 8203417(자기신고). */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionNewsServiceTest {

    private static final String ADMIN = "8203417";
    private static final String INST = "jongno";
    private static final String HDR = "기관ID,분야,제목,언론사,보도일,출처URL,요약,확인일,수집자";
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired private InstitutionNewsService news;
    @Autowired private JdbcTemplate jdbc;

    private static Actor admin() { return Actor.claimed(ADMIN); }
    private static BoardUiIds.Ui ui() { return PlanUiIds.newsUpload(); }
    private static LocalDate daysAgo(int n) { return LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(n); }
    private static String name(LocalDate d) { return INST + "_" + d.format(YMD) + "_news.csv"; }
    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }
    private static String q(String s) { return "\"" + s.replace("\"", "\"\"") + "\""; }

    private static byte[] file(LocalDate checked, String... titles) {
        StringBuilder sb = new StringBuilder(HDR);
        for (String t : titles) {
            sb.append('\n').append(String.join(",", INST, "TREASURY", q(t), "가상일보", checked.minusDays(3).toString(),
                    "https://example.org/n/" + Math.abs(t.hashCode()), q("가상 요약 문장이다.\n두 번째 줄이다."), checked.toString(), "news-collector/1.0"));
        }
        return sb.append('\n').toString().getBytes(StandardCharsets.UTF_8);
    }

    private Map<String, Object> imp(LocalDate d, String... titles) {
        return news.importFile(name(d), file(d, titles), null, admin(), ui());
    }

    private static int status(ApiException e) { return e.getStatus(); }

    @Test
    public void 반입하면_판과_항목과_감사_1행이_생기고_자기신고는_검증됨이_아니다() {
        LocalDate d = daysAgo(1);
        Map<String, Object> out = imp(d, "가상구 금고 지정 심의 공개", "가상구 예산안 발표");
        assertEquals(2, out.get("item_count"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT WHERE INSTITUTION_ID=? AND IMPORTED_BY=? AND IMPORTED_VERIFIED=0", INST, ADMIN));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_NEWS_ITEM WHERE INSTITUTION_ID=?", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='NEWS_IMPORT' AND OUTCOME='OK' AND INSTITUTION_ID=? AND ITEM_COUNT=2"
                + " AND SCREEN_ID='news_import' AND BUTTON_ID='news_upload' AND ACTOR_EMP_NO=?", INST, ADMIN));
        assertEquals("사업계획 판은 건드리지 않는다", 0, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
    }

    @Test
    public void 같은_파일은_409_MSG_SAME_이른_날짜는_409_MSG_OLDER_같은_날짜_다른_내용은_새_판() {
        LocalDate d = daysAgo(1);
        imp(d, "가상 첫째 소식");
        try { imp(d, "가상 첫째 소식"); fail(); }
        catch (ApiException e) { assertEquals(409, status(e)); assertEquals(InstitutionPlanService.MSG_SAME, e.getMessage()); }
        try { imp(daysAgo(2), "가상 이른 소식"); fail(); }
        catch (ApiException e) { assertEquals(409, status(e)); assertEquals(InstitutionPlanService.MSG_OLDER, e.getMessage()); }
        imp(d, "가상 둘째 소식");   // 같은 날짜·다른 내용 = 새 판
        assertEquals(2, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT WHERE INSTITUTION_ID=?", INST));
        try { imp(d, "가상 첫째 소식"); fail(); }   // 예전 판 내용으로 되돌리지 않는다
        catch (ApiException e) { assertEquals(InstitutionPlanService.MSG_SAME, e.getMessage()); }
        assertEquals(2, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT WHERE INSTITUTION_ID=?", INST));
        // HeadAudit.outcomeOf(409) = BLOCKED — 409 세 번(같은 파일·이른 날짜·예전 판 내용)이 모두 남는다
        assertEquals(3, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='NEWS_IMPORT' AND OUTCOME='BLOCKED' AND INSTITUTION_ID=?", INST));
    }

    @Test
    public void 검증_실패는_400이고_감사에_남고_문구에_칸_원문이_없다() {
        LocalDate d = daysAgo(1);
        byte[] bad = (HDR + "\n" + String.join(",", INST, "TREASURY", q("가상 제목"), "가상일보",
                d.minusDays(3).toString(), "https://example.org/a", q("연락처 010-9999-8888 입니다"), d.toString(), "news-collector/1.0") + "\n")
                .getBytes(StandardCharsets.UTF_8);
        try { news.importFile(name(d), bad, null, admin(), ui()); fail(); }
        catch (ApiException e) {
            assertEquals(400, status(e));
            assertTrue(e.getMessage(), e.getMessage().startsWith("row 1"));
            assertFalse(e.getMessage().contains("9999"));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='NEWS_IMPORT' AND OUTCOME='INVALID' AND INSTITUTION_ID=?", INST));
    }

    @Test
    public void 없는_기관은_404이고_감사_기관ID는_NONE() {
        LocalDate d = daysAgo(1);
        try { news.importFile("nosuch-x_" + d.format(YMD) + "_news.csv", file(d, "가상 제목"), null, admin(), ui()); fail(); }
        catch (ApiException e) { assertEquals(404, status(e)); }
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='NEWS_IMPORT' AND OUTCOME='HIDDEN' AND INSTITUTION_ID='NONE'"));
    }

    @Test
    public void 파일_이름의_기관ID가_대상과_다르면_400() {
        LocalDate d = daysAgo(1);
        try { news.importUpload(INST, new MockMultipartFile("file", "dobong_" + d.format(YMD) + "_news.csv", "text/csv", file(d, "가상 제목")), null, admin()); fail(); }
        catch (ApiException e) { assertEquals(400, status(e)); }
        assertEquals(0, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT"));
    }

    @Test
    public void 올리기_경로도_같은_결과를_낸다() {
        LocalDate d = daysAgo(1);
        Map<String, Object> out = news.importUpload(INST, new MockMultipartFile("file", name(d), "text/csv", file(d, "가상 제목 하나")), "b-1", admin());
        assertEquals(1, out.get("item_count"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT WHERE BATCH_ID='b-1'"));
    }

    @Test
    public void 뉴스_반입은_열린_수집_요청을_NEWS로_닫는다() {
        jdbc.update("INSERT INTO PLAN_COLLECT_REQ (INSTITUTION_ID, REQ_SEQ, REQ_KEY, STATUS_CD, OPEN_INST_ID, REQUESTED_BY, REQUESTED_AT)"
                + " VALUES (?, 1, ?, 'REQUESTED', ?, ?, '2026-11-20T09:00:00+09:00')", INST, "11111111-1111-1111-1111-111111111111", INST, ADMIN);
        jdbc.update("INSERT INTO PLAN_COLLECT_REQUESTER (INSTITUTION_ID, REQ_SEQ, EMP_NO, REQUESTED_AT) VALUES (?, 1, ?, '2026-11-20T09:00:00+09:00')", INST, ADMIN);
        LocalDate d = daysAgo(1);
        imp(d, "가상 대체 소식");
        Map<String, Object> row = jdbc.queryForMap("SELECT STATUS_CD, OPEN_INST_ID, APPLIED_IMPORT_ID, CLOSE_REASON FROM PLAN_COLLECT_REQ WHERE REQ_KEY='11111111-1111-1111-1111-111111111111'");
        assertEquals("APPLIED", row.get("STATUS_CD"));
        assertNull(row.get("OPEN_INST_ID"));
        assertNull("뉴스 판 번호를 사업계획 판 칸에 넣지 않는다", row.get("APPLIED_IMPORT_ID"));
        assertEquals("NEWS", row.get("CLOSE_REASON"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_APPLY' AND OUTCOME='NEWS' AND INSTITUTION_ID=?", INST));
        assertEquals("사업계획 반입 코드로 남지 않는다", 0, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='COLLECT_APPLY' AND OUTCOME='OK'"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 조회는_판이_없으면_200_has_news_false_있으면_항목과_창을_주고_사번을_싣지_않는다() {
        Map<String, Object> none = news.detail(INST);
        assertEquals(false, none.get("has_news"));
        assertEquals("NOT_FOUND", none.get("plan_state"));
        assertTrue(((List<?>) none.get("items")).isEmpty());

        LocalDate d = daysAgo(1);
        imp(d, "가상 하나 소식", "가상 둘 소식");
        Map<String, Object> got = news.detail("JONGNO");   // 대소문자는 정식 표기로
        assertEquals(INST, got.get("institution_id"));
        assertEquals(true, got.get("has_news"));
        assertEquals("NEWS_ONLY", got.get("plan_state"));
        assertEquals(d.toString(), got.get("checked_on"));
        assertEquals(d.minusYears(1).toString(), got.get("window_from"));
        assertEquals(false, got.get("stale"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) got.get("items");
        assertEquals(2, items.size());
        assertEquals("가상 하나 소식", items.get(0).get("title"));
        assertEquals("금고", items.get(0).get("field_name"));
        String all = String.valueOf(got);
        assertFalse(all, all.contains(ADMIN));
        assertFalse(all, all.contains("imported_by"));
        assertFalse(all, all.contains("file_sha256"));
    }

    @Test
    public void 조회는_없는_기관이면_404() {
        try { news.detail("nosuch-x"); fail(); } catch (ApiException e) { assertEquals(404, status(e)); }
    }
}
