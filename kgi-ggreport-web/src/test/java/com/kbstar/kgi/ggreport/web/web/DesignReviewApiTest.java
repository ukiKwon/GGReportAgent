package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 디자인 검토 흐름(051, NEXT 100 ⑥ S6-a·S6-b) — 회차·받는 사람·의견·확인함·결재 훅·잠금·감사, security 필수 M1~M5·L1.
 * 시드 사번: 영업팀 3918264 · 영업팀장 5047192·5640327 · 전산팀장 6295038·8892046 · 예산팀장 9026715 · 영업부장 2674805·1473958 · 디자이너 7130526(최디자이너)·1625983(신유나) · 전산팀 8203417.
 * 건마다 입찰 건·팀 작업 3건(2차완료)·디자이너 작업을 직접 넣는다(롤백). 동시 경합(M1)은 트랜잭션 없이 도는 {@code DesignReviewTxTest}.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class DesignReviewApiTest {

    private static final String DESIGNER = "7130526";
    private static final String DESIGNER2 = "1625983";
    private static final String SALES = "3918264";
    private static final String LEAD = "5047192";
    private static final String LEAD2 = "5640327";
    private static final String IT_LEAD = "6295038";
    private static final String BUD_LEAD = "9026715";
    private static final String HEAD = "2674805";
    private static final String HEAD2 = "1473958";
    private static final String IT_MEMBER = "8203417";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ConfigurableEnvironment env;
    private final ObjectMapper json = new ObjectMapper();

    private String bid;
    private String tid;   // 디자이너 작업

    @Before
    public void caseWithDesignerTask() {
        newCase(true);
    }

    // ── 준비·호출 도우미 ─────────────────────────────────────────────────────

    private void newCase(boolean withDesignerTask) {
        String k = UUID.randomUUID().toString().substring(0, 8);
        bid = "bc-dsn-" + k;
        jdbc.update("INSERT INTO BID_CASES (BID_CASE_ID, INSTITUTION_ID) VALUES (?, ?)", bid, "nowon");
        task("task-dsn-s-" + k, "영업", "2차완료", "김영업");
        task("task-dsn-i-" + k, "전산", "2차완료", "오전산");
        task("task-dsn-b-" + k, "예산", "2차완료", "한예산");
        jdbc.update("INSERT INTO BID_ASSIGNMENT (BID_CASE_ID, EMP_NO, ACTIVE_YN, ASSIGNED_BY, ASSIGNED_AT) VALUES (?,?,1,?,?)",
                bid, SALES, LEAD, "2026-11-19T00:00:00.000000+00:00");
        if (withDesignerTask) {
            tid = "task-dsn-d-" + k;
            task(tid, "디자이너", "작성중", "최디자이너");
        }
    }

    private void task(String id, String team, String status, String assignee) {
        jdbc.update("INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES (?,?,?,?,?)",
                id, bid, team, status, assignee);
    }

    private int count(String sql, Object... a) {
        return jdbc.queryForObject(sql, Integer.class, a);
    }

    private String status(String taskId) {
        return jdbc.queryForObject("SELECT STATUS FROM TASKS WHERE TASK_ID=?", String.class, taskId);
    }

    private MockHttpServletResponse call(String path, String emp, String body, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.post(path).header("X-User-Id", "web-user")
                .contentType(MediaType.APPLICATION_JSON).content(body == null ? "" : body);
        if (emp != null) {
            b.header("X-Emp-No", emp);
        }
        if (screen != null) {
            b.header("X-Screen-Id", screen);
        }
        if (button != null) {
            b.header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn().getResponse();
    }

    private MockHttpServletResponse call(String path, String emp, String body) throws Exception {
        return call(path, emp, body, null, null);
    }

    private MockHttpServletResponse get(String path, String emp) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.get(path);
        if (emp != null) {
            b.header("X-Emp-No", emp);
        }
        return mockMvc.perform(b).andReturn().getResponse();
    }

    private JsonNode body(MockHttpServletResponse r) throws Exception {
        return json.readTree(r.getContentAsString(StandardCharsets.UTF_8));
    }

    private String code(MockHttpServletResponse r) throws Exception {
        return body(r).path("detail").path("code").asText();
    }

    private MockHttpServletResponse complete(String emp) throws Exception {
        return call("/tasks/" + tid + "/design/complete", emp, null);
    }

    private MockHttpServletResponse revise(String emp) throws Exception {
        return call("/tasks/" + tid + "/design/revise", emp, null);
    }

    private MockHttpServletResponse comment(String emp, int round, String text) throws Exception {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<String, Object>();
        m.put("round_no", round);
        m.put("body", text);
        return call("/tasks/" + tid + "/design/comments", emp, json.writeValueAsString(m));
    }

    private MockHttpServletResponse approve(String emp, boolean approved, String why) throws Exception {
        String b = "{\"approved\":" + approved + (why == null ? "" : ",\"comment\":\"" + why + "\"") + "}";
        return call("/tasks/" + tid + "/approve", emp, b);
    }

    private int denied(String emp, String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403", emp, path);
    }

    private int recipCount(MockHttpServletResponse r) throws Exception {
        return body(r).path("recipients_count").asInt();
    }

    // ── 열기 ────────────────────────────────────────────────────────────────

    @Test
    public void 세_팀이_모두_2차완료면_디자이너가_자리를_열고_두_번째는_200이다() throws Exception {
        newCase(false);
        String path = "/bidcases/" + bid + "/design-task";
        assertTrue("열기 전에는 후보에 있다", get("/design-tasks/ready", DESIGNER).getContentAsString(StandardCharsets.UTF_8).contains(bid));
        MockHttpServletResponse first = call(path, DESIGNER, null);
        assertEquals(201, first.getStatus());
        assertEquals(true, body(first).path("created").asBoolean());
        String id = body(first).path("task_id").asText();
        assertEquals("대기", status(id));
        MockHttpServletResponse again = call(path, DESIGNER, null);
        assertEquals(200, again.getStatus());
        assertEquals(false, body(again).path("created").asBoolean());
        assertEquals(id, body(again).path("task_id").asText());
        assertFalse("연 뒤에는 후보에서 빠진다", get("/design-tasks/ready", LEAD).getContentAsString(StandardCharsets.UTF_8).contains(bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_OPEN' AND OUTCOME='OK'", bid));
    }

    @Test
    public void 한_팀이라도_2차완료가_아니면_409이고_팀_이름만_싣는다() throws Exception {
        newCase(false);
        jdbc.update("UPDATE TASKS SET STATUS='1차완료' WHERE BID_CASE_ID=? AND TEAM='전산'", bid);
        MockHttpServletResponse r = call("/bidcases/" + bid + "/design-task", DESIGNER, null);
        assertEquals(409, r.getStatus());
        assertEquals("TEAMS_NOT_DONE", code(r));
        String text = r.getContentAsString(StandardCharsets.UTF_8);
        assertTrue(text.contains("전산"));
        assertFalse("담당 이름은 싣지 않는다", text.contains("오전산"));
        assertEquals(0, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=? AND TEAM='디자이너'", bid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_OPEN' AND OUTCOME='BLOCKED'", bid));
    }

    @Test
    public void 디자이너가_아니면_열_수_없고_사번이_없으면_401이다() throws Exception {
        newCase(false);
        String path = "/bidcases/" + bid + "/design-task";
        int before = denied(SALES, path);
        assertEquals(403, call(path, SALES, null).getStatus());
        assertEquals(before + 1, denied(SALES, path));
        assertEquals(401, call(path, null, null).getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=? AND TEAM='디자이너'", bid));
    }

    // ── 완료 · 받는 사람 · 쪽지 ───────────────────────────────────────────────

    @Test
    public void 완료하면_회차가_열리고_받는_사람마다_사번_쪽지_한_줄이_시스템_이름으로_간다() throws Exception {
        MockHttpServletResponse r = call("/tasks/" + tid + "/design/complete", DESIGNER, null, "design_work", "design_complete");
        assertEquals(200, r.getStatus());
        assertEquals("1차완료", body(r).path("status").asText());
        assertEquals(1, body(r).path("round_no").asInt());
        assertEquals("1차완료", status(tid));
        int n = recipCount(r);
        assertTrue(n >= 6);   // 영업 담당 + 전산·예산 담당(팀장과 겹친다) + 팀장 전원 — 겹치면 한 번
        assertEquals(n, count("SELECT COUNT(*) FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND ROUND_NO=1", tid));
        assertEquals(n, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND KIND='쪽지' AND SENDER='시스템'", tid));
        for (String emp : new String[]{SALES, LEAD, LEAD2, IT_LEAD, "8892046", BUD_LEAD}) {
            assertEquals(emp, 1, count("SELECT COUNT(*) FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND EMP_NO=?", tid, emp));
            assertEquals(emp, 1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=? AND KIND='쪽지'", tid, emp));
        }
        for (String emp : new String[]{DESIGNER, HEAD, HEAD2}) {   // 디자이너 본인·영업부장은 받지 않는다
            assertEquals(emp, 0, count("SELECT COUNT(*) FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND EMP_NO=?", tid, emp));
        }
        assertEquals("영업 담당이 먼저 들어온 사유", "ASSIGNEE_SALES",
                jdbc.queryForObject("SELECT REASON_CD FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND EMP_NO=?", String.class, tid, SALES));
        assertEquals("팀장이면서 전산 담당이면 담당 사유", "ASSIGNEE_IT",
                jdbc.queryForObject("SELECT REASON_CD FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND EMP_NO=?", String.class, tid, IT_LEAD));
        assertEquals("팀 쪽지함은 늘지 않는다", 0, count(
                "SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT IN ('영업팀','전산팀','예산팀')", tid));
        assertEquals("영업팀장 역할 쪽지함에 결재 신호 1건", 1, count(
                "SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT='영업팀장' AND KIND='결재요청'", tid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_COMPLETE' AND OUTCOME='OK' "
                + "AND TASK_CD='DSN_R1' AND STATE_CD='DESIGNING' AND ACTOR_EMP_NO=? AND SCREEN_ID='design_work' "
                + "AND BUTTON_ID='design_complete' AND UI_VALID=1 AND EMP_VERIFIED=0", bid, DESIGNER));
    }

    @Test
    public void 화면_버튼_이름이_허용_목록_밖이면_UNKNOWN_ui_valid_0이다() throws Exception {
        assertEquals(200, call("/tasks/" + tid + "/design/complete", DESIGNER, null, "evil<script>", "x").getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_COMPLETE' "
                + "AND SCREEN_ID='UNKNOWN' AND BUTTON_ID='UNKNOWN' AND UI_VALID=0", bid));
    }

    @Test
    public void 사람마다_따로_읽고_남의_쪽지함은_못_연다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        env.getPropertySources().addFirst(new MapPropertySource("design-guard-test",
                Collections.<String, Object>singletonMap(NotificationGuard.PROP, "true")));   // 시험 전역은 꺼져 있다(L1)
        try {
            String idA = jdbc.queryForObject("SELECT NOTIFICATION_ID FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=?", String.class, tid, LEAD);
            String idB = jdbc.queryForObject("SELECT NOTIFICATION_ID FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=?", String.class, tid, LEAD2);
            assertTrue(get("/notifications?recipient=" + LEAD, LEAD).getContentAsString(StandardCharsets.UTF_8).contains(tid));
            assertEquals(403, get("/notifications?recipient=" + LEAD, LEAD2).getStatus());   // 같은 영업팀장이라도 남의 사번 쪽지함은 못 연다
            assertEquals(200, call("/notifications/" + idA + "/read", LEAD, null).getStatus());
            assertEquals(403, call("/notifications/" + idA + "/read", LEAD2, null).getStatus());
            assertNotNull(jdbc.queryForObject("SELECT READ_AT FROM NOTIFICATIONS WHERE NOTIFICATION_ID=?", String.class, idA));
            assertEquals("다른 사람 몫은 읽지 않은 채", 0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE NOTIFICATION_ID=? AND READ_AT IS NOT NULL", idB));
        } finally {
            env.getPropertySources().remove("design-guard-test");
        }
    }

    @Test
    public void 시스템_이름_쪽지는_공개_발송_경로에서_400이다() throws Exception {
        String ok = "{\"recipient\":\"3918264\",\"content\":\"안녕\",\"sender\":\"김영업\"}";
        assertEquals(201, call("/notifications", null, ok).getStatus());
        // 보이지 않는 글자는 소스에 리터럴로 두지 않고 코드값으로 만든다(security N2).
        String zwsp = "시" + (char) 0x200B + "스템";
        String ideographic = "시" + (char) 0x3000 + "스템";
        String nbsp = "시" + (char) 0x00A0 + "스템";
        String bell = "시" + (char) 0x0007 + "스템";   // JSON 문자열에 넣을 때 \\u 로 이스케이프된다
        String nfd = java.text.Normalizer.normalize("시스템", java.text.Normalizer.Form.NFD);
        assertFalse("NFD 는 NFC 와 다른 글자열이어야 시험이 된다", nfd.equals("시스템"));
        for (String sender : new String[]{"시스템", " 시스템 ", "시 스 템", "시 스템", zwsp, ideographic, nbsp, bell, nfd}) {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<String, Object>();
            m.put("recipient", "3918264");
            m.put("content", "디자인 작업 완료(2차본)");
            m.put("sender", sender);
            assertEquals("sender 코드=" + sender.length(), 400, call("/notifications", null, json.writeValueAsString(m)).getStatus());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE SENDER='시스템' AND CONTENT='디자인 작업 완료(2차본)' AND KIND='쪽지' AND TASK_ID IS NULL"));
    }

    @Test
    public void 보낸_사람이_없거나_공백뿐이면_보낸_사람_미상으로_저장된다() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String[] senders = new String[]{null, "", "   ", "" + (char) 0x3000 + (char) 0x200B};
        for (int i = 0; i < senders.length; i++) {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<String, Object>();
            m.put("recipient", "3918264");
            m.put("content", "미상 시험 " + tag + " " + i);
            if (senders[i] != null || i == 0) {
                m.put("sender", senders[i]);
            }
            MockHttpServletResponse r = call("/notifications", null, json.writeValueAsString(m));
            assertEquals("i=" + i, 201, r.getStatus());
            assertEquals("보낸 사람 미상", body(r).path("sender").asText());
            assertEquals("보낸 사람 미상", jdbc.queryForObject(
                    "SELECT SENDER FROM NOTIFICATIONS WHERE CONTENT=?", String.class, "미상 시험 " + tag + " " + i));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE CONTENT LIKE ? AND SENDER='시스템'", "미상 시험 " + tag + "%"));
    }

    @Test
    public void 영업팀장_1차_반려_사유도_검사하고_빈_사유는_허용한다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 501; i++) {
            big.append('가');
        }
        assertEquals("500자 초과", 400, approve(LEAD, false, big.toString()).getStatus());
        assertEquals("제어문자", 400, call("/tasks/" + tid + "/approve", LEAD,
                "{\"approved\":false,\"comment\":\"경고음\\u0007문자\"}").getStatus());
        assertEquals("개인정보 의심", 422, approve(LEAD, false, "연락처 010-1234-5678").getStatus());
        assertEquals("거절된 뒤 상태는 그대로", "1차완료", status(tid));
        assertEquals("빈 사유는 허용", 200, approve(LEAD, false, null).getStatus());
        assertEquals("작성중", status(tid));
    }

    @Test
    public void 디자이너_작업_자리가_열려_있어도_세_팀이_2차완료면_최종_반려_확정_판단은_409가_아니다() throws Exception {
        // 디자이너 작업(@Before)이 이미 있다. 예전에는 TASKS 행이 4건이라 409 였다(security N4).
        MockHttpServletResponse r = call("/bidcases/" + bid + "/finalize", HEAD, "{\"approved\":false}");
        assertEquals(200, r.getStatus());
        assertEquals("세 팀 작업은 작성중으로 돌아간다", 3, count(
                "SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID=? AND TEAM IN ('영업','전산','예산') AND STATUS='작성중'", bid));
        assertEquals("디자이너 작업은 건드리지 않는다", "작성중", status(tid));
        // 세 팀 중 하나가 2차완료가 아니면 여전히 409
        jdbc.update("UPDATE TASKS SET STATUS='1차완료' WHERE BID_CASE_ID=? AND TEAM='전산'", bid);
        jdbc.update("UPDATE TASKS SET STATUS='2차완료' WHERE BID_CASE_ID=? AND TEAM IN ('영업','예산')", bid);
        assertEquals(409, call("/bidcases/" + bid + "/finalize", HEAD, "{\"approved\":false}").getStatus());
    }

    @Test
    public void 담당_이름이_동명이인이면_사람으로_못_바꾸고_그_팀은_unresolved에_이름_없이_든다() throws Exception {
        jdbc.update("INSERT INTO USERS (EMP_NO, NAME, ROLE, POSITION_TITLE, APPROVAL_GRADE, STATUS, FAILED_LOGINS, CREATED_AT, UPDATED_AT) "
                + "VALUES ('9999991', '오전산', '전산팀', '사원', 'NONE', 'ACTIVE', 0, '2026-11-19T00:00:00.000000+00:00', '2026-11-19T00:00:00.000000+00:00')");
        MockHttpServletResponse r = complete(DESIGNER);
        assertEquals(200, r.getStatus());
        JsonNode un = body(r).path("unresolved_teams");
        assertEquals(1, un.size());
        assertEquals("전산", un.get(0).asText());
        assertFalse(r.getContentAsString(StandardCharsets.UTF_8).contains("오전산"));
        assertEquals("동명이인은 받지 않는다", 0, count("SELECT COUNT(*) FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND EMP_NO='9999991'", tid));
        assertEquals("그래도 팀장은 팀장 사유로 받는다", "LEAD",
                jdbc.queryForObject("SELECT REASON_CD FROM DESIGN_ROUND_RECIP WHERE TASK_ID=? AND EMP_NO=?", String.class, tid, IT_LEAD));
    }

    // ── 완료 거부 · 담당 판정(M5) ─────────────────────────────────────────────

    @Test
    public void 남이_담당한_디자이너_작업과_다른_역할은_완료할_수_없다() throws Exception {
        int before = denied(DESIGNER2, "/tasks/" + tid + "/design/complete");
        assertEquals(403, complete(DESIGNER2).getStatus());   // 신유나 ≠ 최디자이너
        assertEquals(before + 1, denied(DESIGNER2, "/tasks/" + tid + "/design/complete"));
        assertEquals(403, complete(SALES).getStatus());
        assertEquals(401, complete(null).getStatus());
        assertEquals("작성중", status(tid));
        assertEquals(0, count("SELECT COUNT(*) FROM DESIGN_ROUND WHERE TASK_ID=?", tid));
    }

    @Test
    public void 이미_1차완료인_작업을_다시_완료하면_409_STATE_CHANGED다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        MockHttpServletResponse again = complete(DESIGNER);
        assertEquals(409, again.getStatus());
        assertEquals("STATE_CHANGED", code(again));
        assertEquals(1, count("SELECT COUNT(*) FROM DESIGN_ROUND WHERE TASK_ID=?", tid));
    }

    @Test
    public void 동명이인_디자이너는_이름_담당을_본인으로_인정받지_못하고_사번_담당은_통과한다() throws Exception {
        jdbc.update("INSERT INTO USERS (EMP_NO, NAME, ROLE, POSITION_TITLE, APPROVAL_GRADE, STATUS, FAILED_LOGINS, CREATED_AT, UPDATED_AT) "
                + "VALUES ('9999992', '최디자이너', '디자이너', '사원', 'NONE', 'ACTIVE', 0, '2026-11-19T00:00:00.000000+00:00', '2026-11-19T00:00:00.000000+00:00')");
        assertEquals("이름이 둘이면 본인도 403", 403, complete(DESIGNER).getStatus());
        assertEquals(403, complete("9999992").getStatus());
        assertEquals("작성중", status(tid));
        jdbc.update("UPDATE TASKS SET ASSIGNEE=? WHERE TASK_ID=?", DESIGNER, tid);
        assertEquals("담당이 사번이면 통과", 200, complete(DESIGNER).getStatus());
        assertEquals("같은 이름의 다른 사람은 여전히 막힌다", 403, revise("9999992").getStatus());
    }

    @Test
    public void 디자이너_작업의_임시저장과_파일은_디자이너_본인만_하고_세_팀_경로는_그대로다() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "a.pptx", MediaType.APPLICATION_OCTET_STREAM_VALUE, new byte[]{1});
        String draftBody = "{\"by\":\"아무개\",\"content\":\"x\"}";
        assertEquals("사번 없이는 401(예전엔 by 만으로 통과)", 401, mockMvc.perform(MockMvcRequestBuilders
                .patch("/tasks/" + tid + "/draft").header("X-User-Id", "web-user").contentType(MediaType.APPLICATION_JSON)
                .content(draftBody)).andReturn().getResponse().getStatus());
        assertEquals(403, mockMvc.perform(MockMvcRequestBuilders.patch("/tasks/" + tid + "/draft").header("X-User-Id", "web-user")
                .header("X-Emp-No", SALES).contentType(MediaType.APPLICATION_JSON).content(draftBody)).andReturn().getResponse().getStatus());
        assertEquals(403, mockMvc.perform(MockMvcRequestBuilders.multipart("/tasks/" + tid + "/files").file(file)
                .header("X-User-Id", "web-user").header("X-Emp-No", DESIGNER2)).andReturn().getResponse().getStatus());
        assertEquals(401, mockMvc.perform(MockMvcRequestBuilders.delete("/tasks/" + tid + "/files/a.pptx")
                .header("X-User-Id", "web-user")).andReturn().getResponse().getStatus());
        assertEquals("본인은 by 가 달라도 서버가 정한 신원으로 통과한다", 200, mockMvc.perform(MockMvcRequestBuilders
                .patch("/tasks/" + tid + "/draft").header("X-User-Id", "web-user").header("X-Emp-No", DESIGNER)
                .contentType(MediaType.APPLICATION_JSON).content(draftBody)).andReturn().getResponse().getStatus());
        // 세 팀 작업은 사번 없이도 예전처럼(by 가 담당과 같으면) 저장된다 — 이 흐름의 무인증은 NEXT 35 몫(security R1)
        String salesTask = jdbc.queryForObject("SELECT TASK_ID FROM TASKS WHERE BID_CASE_ID=? AND TEAM='영업'", String.class, bid);
        assertEquals(200, mockMvc.perform(MockMvcRequestBuilders.patch("/tasks/" + salesTask + "/draft").header("X-User-Id", "web-user")
                .contentType(MediaType.APPLICATION_JSON).content("{\"by\":\"김영업\",\"content\":\"x\"}")).andReturn().getResponse().getStatus());
    }

    @Test
    public void 의견을_받는_중이거나_확정된_뒤에는_파일을_바꿀_수_없다_409_TASK_LOCKED() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        MockMultipartFile file = new MockMultipartFile("file", "a.pptx", MediaType.APPLICATION_OCTET_STREAM_VALUE, new byte[]{1});
        MockHttpServletResponse up = mockMvc.perform(MockMvcRequestBuilders.multipart("/tasks/" + tid + "/files").file(file)
                .header("X-User-Id", "web-user").header("X-Emp-No", DESIGNER)).andReturn().getResponse();
        assertEquals(409, up.getStatus());
        assertEquals("TASK_LOCKED", code(up));
        MockHttpServletResponse del = mockMvc.perform(MockMvcRequestBuilders.delete("/tasks/" + tid + "/files/a.pptx")
                .header("X-User-Id", "web-user").header("X-Emp-No", DESIGNER)).andReturn().getResponse();
        assertEquals(409, del.getStatus());
        assertEquals("임시저장도 같이 잠긴다", 409, mockMvc.perform(MockMvcRequestBuilders.patch("/tasks/" + tid + "/draft")
                .header("X-User-Id", "web-user").header("X-Emp-No", DESIGNER).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"x\"}")).andReturn().getResponse().getStatus());
    }

    // ── 의견 · 확인함 ────────────────────────────────────────────────────────

    @Test
    public void 받는_사람은_의견을_남기고_디자이너는_본문_없는_쪽지를_사번으로_받는다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        int notesBefore = count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=?", tid, DESIGNER);
        MockHttpServletResponse r = comment(LEAD, 1, "표지 색을 조금 어둡게 해 주세요.");
        assertEquals(201, r.getStatus());
        assertEquals(1, body(r).path("seq_no").asInt());
        assertEquals(notesBefore + 1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=?", tid, DESIGNER));
        assertEquals("쪽지에 본문을 싣지 않는다", 0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND CONTENT LIKE '%어둡게%'", tid));
        assertEquals("보낸 사람은 시스템", "시스템", jdbc.queryForObject(
                "SELECT SENDER FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=?", String.class, tid, DESIGNER));
        assertEquals("감사에도 본문이 없다 — 행위 줄만", 1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_COMMENT' AND OUTCOME='OK' AND TASK_CD='DSN_R1' AND STATE_CD='IN_REVIEW'", bid));
        assertEquals(2, body(comment(LEAD, 1, "하나 더")).path("seq_no").asInt());
    }

    @Test
    public void 받는_사람이_아니면_의견도_확인함도_403이다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        assertEquals("영업부장은 받는 사람이 아니다", 403, comment(HEAD, 1, "의견").getStatus());
        assertEquals(403, comment(IT_MEMBER, 1, "의견").getStatus());
        assertEquals(403, comment(DESIGNER, 1, "본인 의견").getStatus());
        assertEquals(403, call("/tasks/" + tid + "/design/ack", HEAD, "{\"round_no\":1}").getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM DESIGN_COMMENT WHERE TASK_ID=?", tid));
        assertEquals(401, comment(null, 1, "의견").getStatus());
    }

    @Test
    public void 의견_입력_검사는_400_422_409로_갈린다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        assertEquals(400, comment(LEAD, 1, "").getStatus());
        assertEquals(400, comment(LEAD, 1, "   ").getStatus());
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 1001; i++) {
            big.append('가');
        }
        assertEquals(400, comment(LEAD, 1, big.toString()).getStatus());
        assertEquals("1000자는 통과", 201, comment(LEAD, 1, big.substring(0, 1000)).getStatus());
        assertEquals(400, comment(LEAD, 1, "경고음\u0007문자").getStatus());
        assertEquals(400, comment(LEAD, 0, "회차 0").getStatus());
        MockHttpServletResponse pii = comment(LEAD, 1, "연락처 010-1234-5678 입니다");
        assertEquals(422, pii.getStatus());
        assertEquals("PII_DETECTED", code(pii));
        assertFalse("검출된 값은 응답에 없다", pii.getContentAsString(StandardCharsets.UTF_8).contains("1234"));
        MockHttpServletResponse mismatch = comment(LEAD, 99, "없는 회차");
        assertEquals(409, mismatch.getStatus());
        assertEquals("ROUND_MISMATCH", code(mismatch));
        assertEquals(1, count("SELECT COUNT(*) FROM DESIGN_COMMENT WHERE TASK_ID=?", tid));
    }

    @Test
    public void 한_사람이_한_회차에_남기는_의견은_30건까지다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        for (int i = 1; i <= 30; i++) {
            assertEquals("의견 " + i, 201, comment(LEAD, 1, "의견 " + i).getStatus());
        }
        MockHttpServletResponse over = comment(LEAD, 1, "서른한 번째");
        assertEquals(409, over.getStatus());
        assertEquals("TOO_MANY_COMMENTS", code(over));
        assertEquals(201, comment(LEAD2, 1, "다른 사람은 따로 센다").getStatus());
        assertEquals(30, count("SELECT COUNT(*) FROM DESIGN_COMMENT WHERE TASK_ID=? AND EMP_NO=?", tid, LEAD));
    }

    @Test
    public void 확인함은_처음만_저장된다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        MockHttpServletResponse first = call("/tasks/" + tid + "/design/ack", LEAD, "{\"round_no\":1}");
        assertEquals(200, first.getStatus());
        assertEquals(true, body(first).path("saved").asBoolean());
        MockHttpServletResponse second = call("/tasks/" + tid + "/design/ack", LEAD, "{\"round_no\":1}");
        assertEquals(false, body(second).path("saved").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM DESIGN_ACK WHERE TASK_ID=? AND EMP_NO=?", tid, LEAD));
        assertEquals("두 번째는 감사 줄도 남기지 않는다", 1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_ACK'", bid));
    }

    // ── 다시 수정 · 올림 · 반려 · 최종 ─────────────────────────────────────────

    @Test
    public void 다시_수정하면_회차가_닫히고_닫힌_회차에는_의견이_안_붙고_다시_완료하면_새_회차다() throws Exception {
        MockHttpServletResponse c1 = complete(DESIGNER);
        int n = recipCount(c1);
        MockHttpServletResponse r = revise(DESIGNER);
        assertEquals(200, r.getStatus());
        assertEquals("작성중", body(r).path("status").asText());
        assertEquals(1, body(r).path("closed_round").asInt());
        assertEquals("REVISE", jdbc.queryForObject("SELECT CLOSE_CD FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid));
        MockHttpServletResponse closed = comment(LEAD, 1, "늦은 의견");
        assertEquals(409, closed.getStatus());
        assertEquals("ROUND_CLOSED", code(closed));
        assertEquals(409, call("/tasks/" + tid + "/design/ack", LEAD, "{\"round_no\":1}").getStatus());
        MockHttpServletResponse c2 = complete(DESIGNER);
        assertEquals(2, body(c2).path("round_no").asInt());
        assertEquals("쪽지가 수신자 수만큼 다시 간다", n, count(
                "SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND SENDER='시스템' AND CONTENT LIKE '%(2차본)%'", tid));
        assertEquals(201, comment(LEAD, 2, "2차본 의견").getStatus());
    }

    @Test
    public void 영업팀장_승인은_부장께_올리는_것이고_그_뒤로는_다시_수정도_의견도_안_된다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        MockHttpServletResponse ok = approve(LEAD, true, null);
        assertEquals(200, ok.getStatus());
        assertEquals("2차완료", status(tid));
        assertEquals("FORWARD", jdbc.queryForObject("SELECT CLOSE_CD FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_FORWARD' AND OUTCOME='OK' "
                + "AND STATE_CD='IN_REVIEW' AND TASK_CD='DSN_R1' AND ACTOR_EMP_NO=?", bid, LEAD));
        assertEquals("부장 앞 결재 신호의 보낸 사람은 시스템", 1, count(
                "SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT='영업부장' AND KIND='결재요청' AND SENDER='시스템'", tid));
        MockHttpServletResponse rev = revise(DESIGNER);
        assertEquals(409, rev.getStatus());
        assertEquals("ALREADY_FORWARDED", code(rev));
        assertEquals("ROUND_CLOSED", code(comment(LEAD2, 1, "너무 늦다")));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_REVISE' AND OUTCOME='BLOCKED'", bid));
    }

    @Test
    public void 영업팀장_반려는_회차를_닫고_디자이너에게_사번으로_사유를_알린다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        MockHttpServletResponse r = approve(LEAD, false, "구성을 다시 잡아 주세요");
        assertEquals(200, r.getStatus());
        assertEquals("작성중", status(tid));
        assertEquals("LEAD_RETURN", jdbc.queryForObject("SELECT CLOSE_CD FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=1", String.class, tid));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=? AND SENDER='시스템' AND CONTENT LIKE '%구성을 다시%'", tid, DESIGNER));
        assertEquals("이름 수신 쪽지는 없다(동명이인이 읽는다)", 0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT='최디자이너'", tid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_LEAD_RETURN' AND OUTCOME='OK'", bid));
        assertEquals(200, complete(DESIGNER).getStatus());   // 다시 완료 → 회차 2
        assertEquals(2, count("SELECT COUNT(*) FROM DESIGN_ROUND WHERE TASK_ID=?", tid));
    }

    @Test
    public void 영업부장_돌려보내기는_사유가_필수이고_확정은_회차를_더_바꾸지_않는다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        assertEquals(200, approve(LEAD, true, null).getStatus());
        MockHttpServletResponse noWhy = approve(HEAD, false, null);
        assertEquals(400, noWhy.getStatus());
        assertEquals("REASON_REQUIRED", code(noWhy));
        assertEquals("상태는 그대로", "2차완료", status(tid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_RETURN' AND OUTCOME='INVALID'", bid));
        assertEquals(400, approve(HEAD, false, "   ").getStatus());
        assertEquals(422, approve(HEAD, false, "연락처 010-1234-5678").getStatus());
        assertEquals("2차완료", status(tid));
        MockHttpServletResponse back = approve(HEAD, false, "표지를 다시 만들어 주세요");
        assertEquals(200, back.getStatus());
        assertEquals("작성중", status(tid));
        assertEquals(1, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT=? AND SENDER='시스템' AND CONTENT LIKE '%표지를 다시%'", tid, DESIGNER));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_RETURN' AND OUTCOME='OK' AND STATE_CD='HEAD_REVIEW'", bid));
        assertEquals("제출본 확정까지", 200, complete(DESIGNER).getStatus());
        assertEquals("회차 2 가 열려 있다", true, body(call("/tasks/" + tid + "/design/ack", LEAD, "{\"round_no\":2}")).path("saved").asBoolean());
        assertEquals(200, approve(LEAD, true, null).getStatus());
        MockHttpServletResponse fin = approve(HEAD, true, null);
        assertEquals(200, fin.getStatus());
        assertEquals("최종완료", status(tid));
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_FINAL' AND OUTCOME='OK' AND TASK_CD='DSN_R2'", bid));
        assertEquals("DESIGN_ROUND 는 부장 단계에서 바뀌지 않는다", "FORWARD",
                jdbc.queryForObject("SELECT CLOSE_CD FROM DESIGN_ROUND WHERE TASK_ID=? AND ROUND_NO=2", String.class, tid));
    }

    @Test
    public void 그_사이_상태가_바뀐_결재는_거절된다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        jdbc.update("UPDATE TASKS SET STATUS='작성중' WHERE TASK_ID=?", tid);   // 다시 수정이 먼저 끝난 것처럼
        MockHttpServletResponse r = approve(LEAD, true, null);
        assertEquals(409, r.getStatus());
        assertEquals("작성중", status(tid));
    }

    @Test
    public void 예전_제출_경로는_디자인_흐름으로_위임되고_팀_쪽지함에는_안_간다() throws Exception {
        MockHttpServletResponse noEmp = call("/tasks/" + tid + "/submit", null, "{\"by\":\"최디자이너\"}");
        assertEquals("사번이 필수가 된다", 401, noEmp.getStatus());
        MockHttpServletResponse r = call("/tasks/" + tid + "/submit", DESIGNER, "{\"by\":\"최디자이너\"}");
        assertEquals(200, r.getStatus());
        assertEquals("예전과 같은 작업 행 모양", "1차완료", body(r).path("status").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM DESIGN_ROUND WHERE TASK_ID=?", tid));
        assertEquals(0, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND RECIPIENT IN ('영업팀','전산팀','예산팀')", tid));
        assertTrue(count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE TASK_ID=? AND SENDER='시스템' AND KIND='쪽지'", tid) >= 6);
    }

    // ── 열람 ────────────────────────────────────────────────────────────────

    @Test
    public void 검토_화면은_담당_디자이너_받는_사람_영업팀장_영업부장만_열고_응답에_사번이_없다() throws Exception {
        assertEquals(200, complete(DESIGNER).getStatus());
        assertEquals(201, comment(LEAD, 1, "의견 하나").getStatus());
        String path = "/tasks/" + tid + "/design-review";
        for (String emp : new String[]{DESIGNER, LEAD, SALES, IT_LEAD, HEAD}) {
            assertEquals(emp, 200, get(path, emp).getStatus());
        }
        assertEquals("받는 사람이 아닌 전산팀원", 403, get(path, IT_MEMBER).getStatus());
        assertEquals(403, get(path, DESIGNER2).getStatus());
        assertEquals(401, get(path, null).getStatus());
        MockHttpServletResponse r = get(path, LEAD);
        String text = r.getContentAsString(StandardCharsets.UTF_8);
        JsonNode v = json.readTree(text);
        assertEquals("IN_REVIEW", v.path("phase_cd").asText());
        assertEquals(1, v.path("current_round").asInt());
        assertEquals(true, v.path("round_open").asBoolean());
        assertEquals(true, v.path("viewer").path("can_forward").asBoolean());
        assertEquals(true, v.path("viewer").path("can_comment").asBoolean());
        assertEquals(false, v.path("viewer").path("can_finalize").asBoolean());
        assertEquals(1, v.path("rounds").get(0).path("comments").size());
        assertEquals(true, v.path("rounds").get(0).path("comments").get(0).path("is_me").asBoolean());
        assertFalse("사번을 싣지 않는다(security L6)", text.contains("emp_no") || text.contains(LEAD) || text.contains(DESIGNER));
        assertTrue(count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_VIEW' AND OUTCOME='OK'", bid) >= 5);
        assertEquals(1, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD='DSN_VIEW' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", bid, IT_MEMBER));
        assertEquals("디자이너 작업이 아니면 404", 404, get("/tasks/" + jdbc.queryForObject(
                "SELECT TASK_ID FROM TASKS WHERE BID_CASE_ID=? AND TEAM='영업'", String.class, bid) + "/design-review", LEAD).getStatus());
    }

    @Test
    public void 준비_목록은_디자이너_영업팀장_영업부장만_본다() throws Exception {
        assertEquals(200, get("/design-tasks/ready", DESIGNER).getStatus());
        assertEquals(200, get("/design-tasks/ready", HEAD).getStatus());
        assertEquals(403, get("/design-tasks/ready", SALES).getStatus());
        assertEquals(401, get("/design-tasks/ready", null).getStatus());
    }
}
