package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.LegacyFlowSwitch;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 64② 1단계 — 공고 상세·담당자 목록(열림·닫힘)·생성(닫힘)의 가드와 BID_PREP_ACT·ACCESS_LOG 기록.
 * 시드: 영업팀 김영업 3918264, 영업팀장 이영업 5047192, 영업부장 박영업 2674805, 예산팀 1857403, 예산팀장 9026715,
 * 전산팀장 6295038, 관리자 8203417, 디자이너 7130526.
 * ⚠️ X-Emp-No 는 자기신고다 — 여기서 고정하는 것은 업무 규칙이지 사칭 방지가 아니다.
 * 열림 상태의 공고 생성 무가드는 2단계에서 닫는다(Prep* 시험이 사번 없이 건을 만든다) — 여기서는 닫힘일 때만 시험한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BidCaseReadGuardApiTest {

    private static final String SALES = "3918264";
    private static final String SALES_LEAD = "5047192";
    private static final String HEAD = "2674805";
    private static final String BUDGET = "1857403";
    private static final String BUDGET_LEAD = "9026715";
    private static final String IT_LEAD = "6295038";
    private static final String ADMIN = "8203417";
    private static final String DESIGNER = "7130526";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private LegacyFlowSwitch legacy;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private int status(MockHttpServletRequestBuilder b, String emp) throws Exception {
        return mockMvc.perform(as(b, emp)).andReturn().getResponse().getStatus();
    }

    private int detail(String id, String emp) throws Exception {
        return status(get("/bidcases/{id}", id), emp);
    }

    private int list(String team, String assignee, String emp) throws Exception {
        return status(get("/bidcases").param("team", team).param("assignee", assignee), emp);
    }

    private MockHttpServletRequestBuilder createReq() {
        return post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                .content("{\"institution_id\":\"nowon\",\"title\":\"읽기 가드 시험\"}");
    }

    /** 열림 상태에서 시험용 건을 만든다(열림은 무가드). */
    private String newCase() throws Exception {
        MockHttpServletResponse res = mockMvc.perform(createReq().header("X-User-Id", "dave")).andReturn().getResponse();
        assertEquals(200, res.getStatus());
        JsonNode n = om.readTree(res.getContentAsString(StandardCharsets.UTF_8));
        return n.path("bid_case_id").asText();
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private int act(String bid, String action, String outcome, String emp) {
        return emp == null
                ? count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME=? AND ACTOR_EMP_NO IS NULL",
                        bid, action, outcome)
                : count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTION_CD=? AND OUTCOME=? AND ACTOR_EMP_NO=?",
                        bid, action, outcome, emp);
    }

    private int actAny(String action) {
        return count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD=?", action);
    }

    private int denied403(String emp, String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND EMP_NO=? AND REQ_PATH=? AND STATUS_CODE=403",
                emp, path);
    }

    // ── 상세 ─────────────────────────────────────────────────────────

    @Test
    public void 상세는_사번이_없으면_401이고_그_건의_사번_없는_감사_줄이_없다() throws Exception {
        String bc = newCase();
        assertEquals(401, detail(bc, null));
        assertEquals(0, act(bc, "CASE_VIEW", "DENIED", null));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=? AND ACTOR_EMP_NO IS NULL", bc));
    }

    @Test
    public void 상세는_워크플로_권한이_없는_디자이너가_403이고_ACT와_접근이력_DENIED가_한_줄씩() throws Exception {
        String bc = newCase();
        assertEquals(403, detail(bc, DESIGNER));
        assertEquals(1, act(bc, "CASE_VIEW", "DENIED", DESIGNER));
        assertEquals(1, denied403(DESIGNER, "/bidcases/" + bc));
    }

    @Test
    public void 상세는_워크플로_열람_역할이면_200이고_CASE_VIEW_OK가_한_줄씩() throws Exception {
        String bc = newCase();
        for (String emp : new String[]{SALES, SALES_LEAD, HEAD, BUDGET, ADMIN}) {
            assertEquals(emp, 200, detail(bc, emp));
            assertEquals(emp, 1, act(bc, "CASE_VIEW", "OK", emp));
        }
    }

    @Test
    public void 없는_건_상세는_404이고_HIDDEN_한_줄() throws Exception {
        assertEquals(404, detail("bc-00000000", SALES));
        assertEquals(1, act("bc-00000000", "CASE_VIEW", "HIDDEN", SALES));
    }

    @Test
    public void 형식_밖_건_번호는_NONE으로_남고_원문은_저장하지_않는다() throws Exception {
        int before = act("NONE", "CASE_VIEW", "HIDDEN", SALES);
        assertEquals(404, detail("bad id!", SALES));
        assertEquals(before + 1, act("NONE", "CASE_VIEW", "HIDDEN", SALES));
        assertEquals(0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE BID_CASE_ID=?", "bad id!"));
    }

    // ── 담당자 목록 — 열림 ───────────────────────────────────────────

    @Test
    public void 목록은_사번이_없으면_401이다() throws Exception {
        assertEquals(401, list("영업", "dave", null));
    }

    @Test
    public void 열림_상태_남의_이름_목록은_영업팀원이_403이고_ACT와_접근이력에_남는다() throws Exception {
        assertEquals(true, legacy.isOpen());
        int act0 = act("NONE", "CASE_LIST", "DENIED", SALES);
        int log0 = denied403(SALES, "/bidcases");
        assertEquals(403, list("영업", "dave", SALES));
        assertEquals(act0 + 1, act("NONE", "CASE_LIST", "DENIED", SALES));
        assertEquals(log0 + 1, denied403(SALES, "/bidcases"));
    }

    @Test
    public void 열림_상태_팀장은_영업_영업팀_둘_다_영업부장은_모든_팀을_본다() throws Exception {
        assertEquals(200, list("영업", "dave", SALES_LEAD));
        assertEquals(200, list("영업팀", "dave", SALES_LEAD));
        assertEquals(200, list("영업", "dave", HEAD));
        assertEquals(200, list("예산", "dave", HEAD));
    }

    @Test
    public void 열림_상태_다른_팀_팀장은_자기_팀만_본다() throws Exception {
        assertEquals(403, list("영업", "dave", BUDGET_LEAD));
        assertEquals(200, list("예산", "dave", BUDGET_LEAD));
    }

    @Test
    public void 열림_상태_본인_이름이면_200_아니면_403() throws Exception {
        assertEquals(200, list("영업", "김영업", SALES));
        assertEquals(403, list("영업", "dave", DESIGNER));
    }

    // ── 담당자 목록 — 닫힘 ───────────────────────────────────────────

    @Test
    public void 닫힘_상태_목록은_본인_이름만_팀장도_남의_이름은_403() throws Exception {
        legacy.setOpenForTest(false);
        try {
            assertEquals(403, list("영업", "dave", SALES_LEAD));
            assertEquals(403, list("영업", "dave", HEAD));
            assertEquals(200, list("영업", "김영업", SALES));
        } finally {
            legacy.setOpenForTest(true);
        }
    }

    // ── 생성 — 닫힘 ──────────────────────────────────────────────────

    @Test
    public void 닫힘_상태_생성은_관리자만_401_403은_사번이_있을_때만_ACT에_남는다() throws Exception {
        legacy.setOpenForTest(false);
        try {
            int nullActor0 = count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='CASE_CREATE' AND ACTOR_EMP_NO IS NULL");
            assertEquals(401, status(createReq(), null));
            assertEquals(nullActor0, count("SELECT COUNT(*) FROM BID_PREP_ACT WHERE ACTION_CD='CASE_CREATE' AND ACTOR_EMP_NO IS NULL"));

            int denied0 = act("NONE", "CASE_CREATE", "DENIED", SALES_LEAD);
            assertEquals(403, status(createReq(), SALES_LEAD));
            assertEquals(denied0 + 1, act("NONE", "CASE_CREATE", "DENIED", SALES_LEAD));

            MockHttpServletResponse res = mockMvc.perform(as(createReq(), ADMIN)).andReturn().getResponse();
            assertEquals(200, res.getStatus());
            String bc = om.readTree(res.getContentAsString(StandardCharsets.UTF_8)).path("bid_case_id").asText();
            assertEquals(1, act(bc, "CASE_CREATE", "OK", ADMIN));
        } finally {
            legacy.setOpenForTest(true);
        }
    }

    @Test
    public void 전산팀장은_관리자_기본값이_아니라_닫힘_상태_생성이_403이다() throws Exception {
        // 관리자 메뉴 기본값은 '전산팀'(팀원) 역할에만 켜져 있고 '전산팀장'은 별도 역할이다(Menus.java ADMIN_MENU) — 현재 동작을 고정한다.
        // 팀장이 관리자가 아닌 것이 의도인지는 기획 확인 대기(NEXT 64②, 2026-11-15 메인 실측).
        legacy.setOpenForTest(false);
        try {
            assertEquals(403, status(createReq(), IT_LEAD));
        } finally {
            legacy.setOpenForTest(true);
        }
    }

    @Test
    public void 감사_행위_코드는_새_CASE_코드만_쓴다() throws Exception {
        String bc = newCase();
        int before = actAny("CASE_VIEW");
        assertEquals(200, detail(bc, SALES));
        assertEquals(before + 1, actAny("CASE_VIEW"));
    }
}
