package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 사업계획 서버 폴더 반입(NEXT 56) — 꺼짐·설정 오류·확인 분류·반입·멱등(ALREADY)·이전 날짜(OLDER)·같은 날짜 예전 판·이름 검사·크기·INVALID 문구·링크·동시 실행·시간 상한·감사 기관ID.
 * 폴더는 TemporaryFolder, 서비스는 손으로 조립(설정 빈 값인 스프링 빈과 별개). 기관 jongno, ADMIN 8203417(자기신고 actor).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class PlanInboxServiceTest {

    private static final String ADMIN = "8203417";
    private static final String INST = "jongno";
    private static final String HDR = "기관ID,문서명,원천종류,대상기간시작,대상기간끝,출처URL,확인일,수집자,분야번호,분야명,사업번호,상위사업번호,"
            + "사업명,내용,예산상태,예산금액,예산단위,연차예산,원문쪽,확인상태,진행상태,이행률";
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    @Autowired private InstitutionPlanService plans;
    @Autowired private PlanAudit audit;
    @Autowired private JdbcTemplate jdbc;

    private PlanInboxService svc() { return new PlanInboxService(plans, audit, tmp.getRoot().getAbsolutePath()); }
    private static Actor admin() { return Actor.claimed(ADMIN); }
    private static BoardUiIds.Ui ui() { return PlanUiIds.inboxImport(); }
    private static LocalDate daysAgo(int n) { return LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(n); }
    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }
    private static String code(ApiException e) { return String.valueOf(((Map<?, ?>) e.getDetailObject()).get("code")); }

    private static String row(LocalDate d, String itemName, String budgetState) {
        return String.join(",", INST, "종로 시험 계획(가상)", "4개년계획", "2023", "2030", "https://www.Example.kr/plan.pdf", d.toString(),
                "plan-collector/1.0", "1", "시험 분야", "1", "", itemName, "", budgetState, "", "", "", "", "", "", "");
    }
    private Path write(String fileName, String body) throws IOException {
        Path p = tmp.getRoot().toPath().resolve(fileName);
        Files.write(p, body.getBytes(StandardCharsets.UTF_8));
        return p;
    }
    private String plan(LocalDate d, String itemName) throws IOException {
        String n = INST + "_" + d.format(YMD) + "_plan.csv";
        write(n, HDR + "\n" + row(d, itemName, "원문에 없음") + "\n");
        return n;
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> item(Map<String, Object> scan, String file) {
        for (Map<String, Object> m : (List<Map<String, Object>>) scan.get("items")) if (file.equals(m.get("file_name"))) return m;
        return null;
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> result(Map<String, Object> out, String file) {
        for (Map<String, Object> m : (List<Map<String, Object>>) out.get("results")) if (file.equals(m.get("file_name"))) return m;
        return null;
    }
    private Map<String, Object> importOne(PlanInboxService s, String n) {
        return result(s.importFiles(Collections.singletonList(n), admin(), ui()), n);
    }

    @Test
    public void 설정이_비면_503_OFF이고_반입_시도는_감사된다() {
        PlanInboxService s = new PlanInboxService(plans, audit, "");
        assertFalse(s.enabled());
        try { s.scan(); fail(); } catch (ApiException e) { assertEquals(503, e.getStatus()); assertEquals(PlanInboxService.OFF, code(e)); }
        try { s.importFiles(Collections.singletonList("jongno_20261118_plan.csv"), admin(), ui()); fail(); }
        catch (ApiException e) { assertEquals(503, e.getStatus()); }
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='INBOX_OFF' AND BUTTON_ID='plan_inbox_import'"));
    }

    @Test
    public void 없는_폴더는_503_BAD_CONFIG이고_문구에_경로가_없다() {
        PlanInboxService s = new PlanInboxService(plans, audit, tmp.getRoot().toPath().resolve("nope-folder").toString());
        try { s.scan(); fail(); } catch (ApiException e) {
            assertEquals(503, e.getStatus());
            assertEquals(PlanInboxService.BAD_CONFIG, code(e));
            assertFalse(String.valueOf(e.getDetailObject()).contains("nope-folder"));
        }
    }

    @Test
    public void 확인은_DB와_파일을_바꾸지_않고_상태를_가른다() throws Exception {
        String ok = plan(daysAgo(1), "시험 사업");
        write("readme.txt", "x");
        write(INST + "_20261301_plan.csv", "x");
        write("nosuch-x_" + daysAgo(1).format(YMD) + "_plan.csv", "x");
        int before = count("SELECT COUNT(*) FROM INST_PLAN_IMPORT");
        Map<String, Object> s = svc().scan();
        assertEquals("READY", item(s, ok).get("status_cd"));
        assertEquals(INST, item(s, ok).get("institution_id"));
        assertEquals("BAD_DATE", item(s, INST + "_20261301_plan.csv").get("status_cd"));
        assertEquals("NO_INSTITUTION", item(s, "nosuch-x_" + daysAgo(1).format(YMD) + "_plan.csv").get("status_cd"));
        assertEquals(1, s.get("ignored_count"));
        assertEquals(before, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT"));
    }

    @Test
    public void 반입하면_IMPORTED이고_파일은_남고_다시_하면_ALREADY() throws Exception {
        String n = plan(daysAgo(1), "시험 사업");
        Map<String, Object> r = importOne(svc(), n);
        assertEquals(String.valueOf(r), "IMPORTED", r.get("result_cd"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=? AND BATCH_ID LIKE 'inbox-%'", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='OK' AND INSTITUTION_ID=?"
                + " AND SCREEN_ID='plan_collect_admin' AND BUTTON_ID='plan_inbox_import'", INST));
        assertTrue("폴더 파일을 옮기지 않는다", Files.exists(tmp.getRoot().toPath().resolve(n)));
        assertEquals("IMPORTED", item(svc().scan(), n).get("status_cd"));
        assertEquals("ALREADY", importOne(svc(), n).get("result_cd"));   // S1 회귀 — getMessage() 로 분류
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=? AND BATCH_ID LIKE 'inbox-%'", INST));
    }

    @Test
    public void 현재_판보다_이른_날짜는_OLDER이고_함께_보내면_이른_것부터() throws Exception {
        String d2 = plan(daysAgo(1), "시험 사업");
        assertEquals("IMPORTED", importOne(svc(), d2).get("result_cd"));
        String d1 = plan(daysAgo(2), "시험 사업");
        assertEquals("OLDER", item(svc().scan(), d1).get("status_cd"));
        assertEquals("OLDER", importOne(svc(), d1).get("result_cd"));   // S1 회귀
    }

    @Test
    public void 여러_날짜를_함께_보내면_이른_날짜부터_반입한다() throws Exception {
        String d1 = plan(daysAgo(2), "시험 사업");
        String d2 = plan(daysAgo(1), "시험 사업 2");
        Map<String, Object> out = svc().importFiles(Arrays.asList(d2, d1), admin(), ui());
        assertEquals("IMPORTED", result(out, d1).get("result_cd"));
        assertEquals("IMPORTED", result(out, d2).get("result_cd"));
    }

    @Test
    public void 같은_날짜_예전_판은_다시_들어오지_않는다() throws Exception {
        LocalDate d = daysAgo(1);
        String n = plan(d, "첫 판 사업");
        assertEquals("IMPORTED", importOne(svc(), n).get("result_cd"));
        plan(d, "둘째 판 사업");
        assertEquals("IMPORTED", importOne(svc(), n).get("result_cd"));
        plan(d, "첫 판 사업");   // 예전 판 내용 그대로
        assertEquals("IMPORTED", item(svc().scan(), n).get("status_cd"));
        assertEquals("ALREADY", importOne(svc(), n).get("result_cd"));   // S1 회귀
        assertEquals(2, count("SELECT COUNT(*) FROM INST_PLAN_IMPORT WHERE INSTITUTION_ID=? AND BATCH_ID LIKE 'inbox-%'", INST));
    }

    @Test
    public void 요청_이름이_형식_밖이거나_개수가_틀리면_400() {
        for (List<String> bad : Arrays.asList(Collections.singletonList("../a_20261118_plan.csv"),
                Collections.singletonList("a_20261118_plan.csv:x"), Collections.<String>singletonList(null),
                Collections.<String>emptyList(), Collections.nCopies(51, "a_20261118_plan.csv"))) {
            try { svc().importFiles(bad, admin(), ui()); fail(String.valueOf(bad)); }
            catch (ApiException e) { assertEquals(400, e.getStatus()); assertEquals("BAD_FILES", code(e)); }
        }
        assertEquals(5, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='IMPORT' AND OUTCOME='INVALID' AND BUTTON_ID='plan_inbox_import'"));
    }

    @Test
    public void 큰_파일은_TOO_LARGE이고_감사_기관ID는_정식표기_또는_NONE() throws Exception {
        byte[] big = new byte[(int) (5L * 1024 * 1024) + 1];
        String mine = INST + "_" + daysAgo(1).format(YMD) + "_plan.csv";
        String ghost = "nosuch-x_" + daysAgo(1).format(YMD) + "_plan.csv";
        Files.write(tmp.getRoot().toPath().resolve(mine), big);
        Files.write(tmp.getRoot().toPath().resolve(ghost), big);
        assertEquals("TOO_LARGE", item(svc().scan(), mine).get("status_cd"));
        Map<String, Object> out = svc().importFiles(Arrays.asList(mine, ghost), admin(), ui());
        assertEquals("TOO_LARGE", result(out, mine).get("result_cd"));
        assertEquals("TOO_LARGE", result(out, ghost).get("result_cd"));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE OUTCOME='TOO_LARGE' AND INSTITUTION_ID=? AND BUTTON_ID='plan_inbox_import'", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE OUTCOME='TOO_LARGE' AND INSTITUTION_ID='NONE' AND BUTTON_ID='plan_inbox_import'"));   // S9
    }

    @Test
    public void 형식_오류는_INVALID이고_문구에_칸_원문이_없다() throws Exception {
        String n = INST + "_" + daysAgo(1).format(YMD) + "_plan.csv";
        write(n, HDR + "\n" + row(daysAgo(1), "시험 사업", "가상비밀값XYZ") + "\n");
        Map<String, Object> it = item(svc().scan(), n);
        assertEquals("INVALID", it.get("status_cd"));
        assertTrue(String.valueOf(it.get("message")), String.valueOf(it.get("message")).startsWith("row "));
        Map<String, Object> r = importOne(svc(), n);
        assertEquals("INVALID", r.get("result_cd"));
        String msg = String.valueOf(r.get("message"));
        assertTrue(msg, msg.startsWith("row "));   // S1 회귀 — "null" 이 아니다
        assertFalse(msg.contains("가상비밀값XYZ"));
    }

    @Test
    public void 폴더_밖을_가리키는_링크는_UNSAFE() throws Exception {
        Path outside = tmp.newFolder("outside").toPath().resolve("x.csv");
        Files.write(outside, (HDR + "\n" + row(daysAgo(1), "시험 사업", "원문에 없음") + "\n").getBytes(StandardCharsets.UTF_8));
        String n = INST + "_" + daysAgo(1).format(YMD) + "_plan.csv";
        try {
            Files.createSymbolicLink(tmp.getRoot().toPath().resolve(n), outside);
        } catch (IOException | UnsupportedOperationException | SecurityException e) {
            Assume.assumeNoException("이 PC 는 심볼릭 링크를 만들 수 없다", e);
        }
        assertEquals("UNSAFE", item(svc().scan(), n).get("status_cd"));
        assertEquals("UNSAFE", importOne(svc(), n).get("result_cd"));
    }

    @Test
    public void 다른_확인이나_반입이_돌면_409_BUSY() throws Exception {
        PlanInboxService s = svc();
        Field f = PlanInboxService.class.getDeclaredField("busy");
        f.setAccessible(true);
        ((AtomicBoolean) f.get(s)).set(true);
        try { s.scan(); fail(); } catch (ApiException e) { assertEquals(409, e.getStatus()); assertEquals("BUSY", code(e)); }
        try { s.importFiles(Collections.singletonList(plan(daysAgo(1), "시험 사업")), admin(), ui()); fail(); }
        catch (ApiException e) { assertEquals(409, e.getStatus()); }
    }

    @Test
    public void 시간_상한을_넘으면_남은_파일은_NOT_CHECKED() throws Exception {
        String n = plan(daysAgo(1), "시험 사업");
        PlanInboxService s = new PlanInboxService(plans, audit, tmp.getRoot().getAbsolutePath(), Duration.ofSeconds(-1));
        assertEquals("NOT_CHECKED", item(s.scan(), n).get("status_cd"));
    }
}
