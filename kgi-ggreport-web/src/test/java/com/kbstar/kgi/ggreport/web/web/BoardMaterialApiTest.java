package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 020a 이사회 자료 저장 — 만들기·열람 범위·값 검증·버전·인계·확정 건 감사 기록.
 * ⚠️ X-Emp-No·X-Screen-Id·X-Button-Id 는 자기신고다 — 여기서 고정하는 것은 업무 규칙·기록 형식이지 사칭 방지가 아니다.
 * 테스트 하네스가 외부 트랜잭션이라 "실패한 승인이 되돌아가는지"는 상태가 아니라 응답(409·code)으로만 확인한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BoardMaterialApiTest {

    private static final String LEAD = "5047192";
    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String M3 = "7742059";
    private static final String M4 = "2189346";
    private static final String HEAD = "2674805";
    private static final String DESIGNER = "7130526";
    private static final String ADMIN = "8203417";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper om = new ObjectMapper();

    // ── 도우미 ───────────────────────────────────────────────────────

    private String newCase() throws Exception {
        String res = mockMvc.perform(post("/bidcases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"institution_id\":\"nowon\"}").header("X-User-Id", "dave"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = om.readTree(res).path("bid_case_id").asText();
        assertFalse(id.isEmpty());
        return id;
    }

    /** MyBatis 쓰기 한 번으로 1차 캐시를 비운다(JdbcTemplate 으로 행을 바꾼 뒤 호출). */
    private void flushCache() throws Exception {
        newCase();
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String emp) {
        return emp == null ? b : b.header("X-Emp-No", emp);
    }

    private static MockHttpServletRequestBuilder ui(MockHttpServletRequestBuilder b) {
        return b.header("X-Screen-Id", "board_write").header("X-Button-Id", "save_version");
    }

    /** 화면·버튼 식별자를 단 POST. */
    private MvcResult send(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(ui(post(path).contentType(MediaType.APPLICATION_JSON).content(body)), emp)).andReturn();
    }

    private MvcResult sendNoUi(String path, String emp, String body) throws Exception {
        return mockMvc.perform(as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), emp)).andReturn();
    }

    /** 화면·버튼 식별자를 단 GET. */
    private MvcResult read(String path, String emp) throws Exception {
        // URI 로 넘긴다 — 문자열 템플릿은 이미 인코딩된 검색어(%EB…)를 한 번 더 인코딩한다.
        return mockMvc.perform(as(get(java.net.URI.create(path)).header("X-Screen-Id", "board_list").header("X-Button-Id", "open"), emp)).andReturn();
    }

    private MvcResult readNoUi(String path, String emp) throws Exception {
        return mockMvc.perform(as(get(path), emp)).andReturn();
    }

    private String text(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(text(r));
    }

    private static String arr(String... x) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < x.length; i++) {
            sb.append(i == 0 ? "" : ",").append('"').append(x[i]).append('"');
        }
        return sb.append("]").toString();
    }

    private void assign(String bc, String... emps) throws Exception {
        MvcResult r = sendNoUi("/bidcases/" + bc + "/assignments", LEAD, "{\"emp_nos\":" + arr(emps) + "}");
        assertEquals(201, r.getResponse().getStatus());
    }

    private long create(String emp, String bc, int year) throws Exception {
        MvcResult r = send("/board-materials", emp, "{\"bid_case_id\":\"" + bc + "\",\"year\":" + year + "}");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("material_id").asLong();
    }

    /** 값 칸 하나를 담은 버전 저장 본문. */
    private static String body(int base, String ref, String key, String val) {
        return "{\"base_snap_no\":" + base + ",\"tables\":[{\"ref\":\"" + ref + "\",\"cells\":{\"" + key + "\":\"" + val + "\"}}]}";
    }

    /** 표 A 의 값 칸 하나({ref,key}) — mapped 이면 엑셀 연결 칸(숫자 검증), 아니면 직접 입력 칸. 없으면 null. */
    private static String[] cell(boolean mapped) {
        BoardDocSpec.Table t = BoardDocSpec.catalogTable("A", true);
        for (java.util.List<BoardDocSpec.Cell> row : t.getRows()) {
            for (BoardDocSpec.Cell c : row) {
                if (mapped ? c.isMapped() : (c.isInput() && !c.isMapped())) {
                    return new String[]{t.getId(), c.getKey()};
                }
            }
        }
        return null;
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private String save(long id, String emp, String json, int expect) throws Exception {
        MvcResult r = send("/board-materials/" + id + "/snapshots", emp, json);
        assertEquals(text(r), expect, r.getResponse().getStatus());
        return text(r);
    }

    private long requestChange(String emp, String bc, String[] add, String[] remove) throws Exception {
        MvcResult r = sendNoUi("/approval-requests/assignee-change", emp, "{\"bid_case_id\":\"" + bc + "\",\"add_emp_nos\":"
                + arr(add) + ",\"remove_emp_nos\":" + arr(remove) + ",\"reason\":\"인력 조정\"}");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("req_id").asLong();
    }

    private MvcResult decide(String emp, long reqId) throws Exception {
        return sendNoUi("/approval-requests/" + reqId + "/decide", emp, "{\"decision\":\"APPROVE\",\"comment\":null}");
    }

    // ── 만들기 ───────────────────────────────────────────────────────

    @Test
    public void 담당자_만들기는_201_준비중_작성자_이력() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        JsonNode j = json(read("/board-materials/" + id, MEMBER));
        assertEquals("PREP", j.path("status_cd").asText());
        assertEquals(2026, j.path("year").asInt());
        assertEquals(MEMBER, j.path("created_by").asText());
        assertEquals(0, j.path("current_snap").asInt());
        assertTrue(j.path("viewer").path("can_write").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_LOG WHERE MATERIAL_ID=? AND EVENT_CD='CREATE'", id));
        assertEquals(0, count("SELECT EMP_VERIFIED FROM BOARD_MATERIAL_LOG WHERE MATERIAL_ID=?", id));   // 자기신고
        // 같은 기관·같은 연도로 한 건 더 — UNIQUE 없음
        create(MEMBER, bc, 2026);
        assertEquals(2, count("SELECT COUNT(*) FROM BOARD_MATERIAL WHERE BID_CASE_ID=? AND BOARD_YEAR=2026", bc));
    }

    @Test
    public void 비담당은_만들기_403_입찰건_존재_여부도_숨기고_DENIED로_남는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        for (String emp : new String[]{MEMBER2, LEAD, HEAD, ADMIN, DESIGNER}) {
            assertEquals(emp, 403, send("/board-materials", emp, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}")
                    .getResponse().getStatus());
            assertEquals(emp, 403, send("/board-materials", emp, "{\"bid_case_id\":\"no-such-case\",\"year\":2026}")
                    .getResponse().getStatus());   // 없는 입찰 건도 같은 403
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL"));
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH='/board-materials'") >= 10);
    }

    @Test
    public void 화면_버튼_식별자가_없거나_목록_밖이면_POST는_400_UI_ID_REQUIRED_원문_비노출() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        MvcResult none = sendNoUi("/board-materials", MEMBER, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}");
        assertEquals(400, none.getResponse().getStatus());
        assertEquals("UI_ID_REQUIRED", json(none).path("detail").path("code").asText());
        MvcResult bad = mockMvc.perform(as(post("/board-materials").contentType(MediaType.APPLICATION_JSON)
                .content("{\"bid_case_id\":\"" + bc + "\",\"year\":2026}")
                .header("X-Screen-Id", "<script>alert(1)</script>").header("X-Button-Id", "x"), MEMBER)).andReturn();
        assertEquals(400, bad.getResponse().getStatus());
        assertFalse(text(bad).contains("script"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL"));
    }

    // ── 열람 범위 ────────────────────────────────────────────────────

    @Test
    public void 비담당_영업팀원_영업팀장_관리자_디자이너는_목록이_비고_상세는_없는_번호와_같은_404() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        for (String emp : new String[]{MEMBER2, LEAD, ADMIN, DESIGNER}) {
            assertEquals(emp, 0, json(read("/board-materials", emp)).path("items").size());
            MvcResult hidden = read("/board-materials/" + id, emp);
            MvcResult missing = read("/board-materials/999999", emp);
            assertEquals(emp, 404, hidden.getResponse().getStatus());
            assertEquals(emp, text(missing), text(hidden));   // 본문이 바이트까지 같다
            for (String sub : new String[]{"/snapshots", "/snapshots/1", "/history", "/acts"}) {
                assertEquals(emp + sub, 404, read("/board-materials/" + id + sub, emp).getResponse().getStatus());
            }
        }
    }

    @Test
    public void 영업부장은_모든_상태를_읽기_전용으로_본다_목록도_전체() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);          // PREP — 부장도 본다(사용자 확정 2026-11-10)
        boolean found = false;
        for (JsonNode n : json(read("/board-materials", HEAD)).path("items")) {
            if (n.path("material_id").asLong() == id) {
                found = true;
                assertFalse(n.path("can_write").asBoolean());
            }
        }
        assertTrue("영업부장 목록에 자료가 없다", found);
        JsonNode d = json(read("/board-materials/" + id, HEAD));
        assertEquals("PREP", d.path("status_cd").asText());
        assertFalse(d.path("viewer").path("can_write").asBoolean());
        assertEquals(200, read("/board-materials/" + id + "/snapshots", HEAD).getResponse().getStatus());
        assertEquals(200, read("/board-materials/" + id + "/history", HEAD).getResponse().getStatus());
        // 쓰기는 부장도 403 + DENIED
        assertEquals(403, send("/board-materials/" + id + "/snapshots", HEAD, "{\"base_snap_no\":0,\"tables\":[]}")
                .getResponse().getStatus());
        assertTrue(count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?",
                "/board-materials/" + id + "/snapshots") >= 1);
        assertEquals(403, send("/board-materials", HEAD, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}")
                .getResponse().getStatus());
    }

    @Test
    public void 담당이_해제되면_바로_보이지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = create(MEMBER, bc, 2026);
        long req = requestChange(LEAD, bc, new String[]{M3}, new String[]{MEMBER});
        assertEquals(200, decide(HEAD, req).getResponse().getStatus());
        assertEquals(404, read("/board-materials/" + id, MEMBER).getResponse().getStatus());
        assertEquals(200, read("/board-materials/" + id, M3).getResponse().getStatus());
        assertEquals(200, read("/board-materials/" + id, MEMBER2).getResponse().getStatus());
    }

    // ── 버전 저장·값 검증 ───────────────────────────────────────────

    @Test
    public void 버전_저장은_201_첫_저장에_작성중_같은_값은_200_changed_false_낡은_base는_409() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull("표 A 에 엑셀 연결 칸이 없다", c);
        String saved = save(id, MEMBER, body(0, c[0], c[1], "1,234"), 201);
        assertEquals(1, om.readTree(saved).path("snap_no").asInt());
        assertEquals("DRAFT", json(read("/board-materials/" + id, MEMBER)).path("status_cd").asText());
        String stored = jdbc.queryForObject("SELECT VALUES_JSON FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=? AND SNAP_NO=1",
                String.class, id);
        assertTrue(stored, stored.contains("\"1234\""));          // 쉼표 제거된 표준형
        assertFalse(stored.contains("1,234"));
        JsonNode same = om.readTree(save(id, MEMBER, body(1, c[0], c[1], "1234"), 200));
        assertFalse(same.path("changed").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
        String stale = save(id, MEMBER, body(0, c[0], c[1], "5"), 409);
        assertEquals("CONFLICT", om.readTree(stale).path("detail").path("code").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 숫자_칸은_숫자만_정수부_13자리_소수_2자리() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        for (String bad : new String[]{"12a", "1,23", "12345678901234", "1.234", "1e5", "+5", "- 5", "1,2345", "--1"}) {
            String r = save(id, MEMBER, body(0, c[0], c[1], bad), 400);
            assertEquals(bad, "BAD_VALUE", om.readTree(r).path("detail").path("code").asText());
            assertFalse(bad, r.contains(bad.trim()) && !bad.isEmpty() && r.contains("\"" + bad + "\""));   // 입력값 비노출
        }
        save(id, MEMBER, body(0, c[0], c[1], "-9999999999999"), 201);            // 부호 포함 13자리
        assertTrue(jdbc.queryForObject("SELECT VALUES_JSON FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=? AND SNAP_NO=1",
                String.class, id).contains("-9999999999999"));
        save(id, MEMBER, body(1, c[0], c[1], "0.50"), 201);
        assertTrue(jdbc.queryForObject("SELECT VALUES_JSON FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=? AND SNAP_NO=2",
                String.class, id).contains("\"0.5\""));
        assertEquals(2, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 입력_칸_텍스트는_100자_구조_위반과_모르는_표는_400() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        String[] in = cell(false);
        if (in != null) {
            StringBuilder s101 = new StringBuilder();
            for (int i = 0; i < 101; i++) {
                s101.append('가');
            }
            assertEquals("BAD_VALUE", om.readTree(save(id, MEMBER, body(0, in[0], in[1], s101.toString()), 400))
                    .path("detail").path("code").asText());
            save(id, MEMBER, body(0, in[0], in[1], "메모"), 201);
        }
        assertEquals(400, send("/board-materials/" + id + "/snapshots", MEMBER, body(in == null ? 0 : 1, "ZZ", "r1_c2", "1"))
                .getResponse().getStatus());                                   // 모르는 표
        assertEquals(400, send("/board-materials/" + id + "/snapshots", MEMBER, body(in == null ? 0 : 1, c[0], "r0_c0", "1"))
                .getResponse().getStatus());                                   // 값 칸이 아닌 키
        assertEquals(400, send("/board-materials/" + id + "/snapshots", MEMBER, "{\"base_snap_no\":0,\"tables\":null}")
                .getResponse().getStatus());
        assertEquals(400, send("/board-materials/" + id + "/snapshots", MEMBER, "{\"tables\":[]}")
                .getResponse().getStatus());                                   // base_snap_no 누락
    }

    @Test
    public void 개인정보는_422_종류만_전각_숫자도_잡고_아무것도_저장되지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        String phone = save(id, MEMBER, body(0, c[0], c[1], "010-0000-0000"), 422);
        assertEquals("PII_DETECTED", om.readTree(phone).path("detail").path("code").asText());
        assertFalse(phone.contains("010-0000-0000"));
        String fullwidth = "９００１０１-１２３４５６７";   // ９００１０１-１２３４５６７
        String fw = save(id, MEMBER, body(0, c[0], c[1], fullwidth), 422);
        assertEquals("PII_DETECTED", om.readTree(fw).path("detail").path("code").asText());
        assertFalse(fw.contains(fullwidth));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 메모는_서식_문자와_개인정보를_거부한다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        String base = body(0, c[0], c[1], "7");
        String zw = base.replace("\"tables\"", "\"note\":\"900101\\u200B-1234567\",\"tables\"");   // 폭 없는 공백으로 피하기
        assertEquals(400, send("/board-materials/" + id + "/snapshots", MEMBER, zw).getResponse().getStatus());
        String bidi = base.replace("\"tables\"", "\"note\":\"x\\u202Ey\",\"tables\"");
        assertEquals(400, send("/board-materials/" + id + "/snapshots", MEMBER, bidi).getResponse().getStatus());
        String pii = base.replace("\"tables\"", "\"note\":\"010-0000-0000\",\"tables\"");
        assertEquals(422, send("/board-materials/" + id + "/snapshots", MEMBER, pii).getResponse().getStatus());
        String ok = base.replace("\"tables\"", "\"note\":\"1차 정리\",\"tables\"");
        assertEquals(201, send("/board-materials/" + id + "/snapshots", MEMBER, ok).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=? AND SNAP_NO>1", id));
    }

    @Test
    public void 제출했거나_확정된_자료는_값을_못_고친다_409_MATERIAL_LOCKED() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        save(id, MEMBER, body(0, c[0], c[1], "5"), 201);
        for (String st : new String[]{"SUBMITTED", "CONFIRMED"}) {
            jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD=? WHERE MATERIAL_ID=?", st, id);
            flushCache();
            String r = save(id, MEMBER, body(1, c[0], c[1], "6"), 409);
            assertEquals(st, "MATERIAL_LOCKED", om.readTree(r).path("detail").path("code").asText());
        }
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 깨진_JSON은_400_detail_객체이고_파서_문구가_없다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        MvcResult r = send("/board-materials/" + id + "/snapshots", MEMBER, "{\"base_snap_no\":\"abc\"");
        assertEquals(400, r.getResponse().getStatus());
        assertEquals("BAD_REQUEST", json(r).path("detail").path("code").asText());
        for (String parser : new String[]{"Unexpected", "line:", "JsonParse", "com.fasterxml"}) {
            assertFalse(parser, text(r).contains(parser));
        }
    }

    @Test
    public void 접근이력에는_자료번호_코드_버전만_남는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        save(id, MEMBER, body(0, c[0], c[1], "123456"), 201);
        String detail = jdbc.queryForList(
                "SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND HTTP_METHOD='POST' AND REQ_PATH=? ORDER BY LOG_ID DESC",
                String.class, "/board-materials/" + id + "/snapshots").get(0);
        assertEquals("board-material id=" + id + " code=SNAP snap=1", detail);
        assertFalse(detail.contains("123456"));
        assertFalse(detail.contains(MEMBER));
    }

    @Test
    public void 목록_검색_기관명_상태_연도_담당자_특수문자는_문자로() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        JsonNode first = json(read("/board-materials", MEMBER)).path("items").get(0);
        String inst = first.path("institution_name").asText();
        String who = first.path("assignees").get(0).path("name").asText();
        assertFalse(inst.isEmpty());
        assertEquals(1, json(read("/board-materials?q=" + java.net.URLEncoder.encode(inst.substring(0, 1), "UTF-8"), MEMBER))
                .path("items").size());
        assertEquals(0, json(read("/board-materials?q=%25", MEMBER)).path("items").size());      // '%' 는 문자 그대로
        assertEquals(0, json(read("/board-materials?q=_", MEMBER)).path("items").size());
        assertEquals(1, json(read("/board-materials?status=PREP&year=2026", MEMBER)).path("items").size());
        assertEquals(0, json(read("/board-materials?status=DRAFT", MEMBER)).path("items").size());
        assertEquals(0, json(read("/board-materials?year=2025", MEMBER)).path("items").size());
        assertEquals(1, json(read("/board-materials?assignee=" + java.net.URLEncoder.encode(who.substring(0, 1), "UTF-8"), MEMBER))
                .path("items").size());
        assertEquals(400, read("/board-materials?status=BOGUS", MEMBER).getResponse().getStatus());
        StringBuilder q81 = new StringBuilder();
        for (int i = 0; i < 81; i++) {
            q81.append('a');
        }
        assertEquals(400, read("/board-materials?q=" + q81, MEMBER).getResponse().getStatus());
        assertEquals(id, json(read("/board-materials", MEMBER)).path("items").get(0).path("material_id").asLong());
    }

    // ── 인계(담당 변경) ─────────────────────────────────────────────

    @Test
    public void 담당에서_빠진_사람의_작성본은_추가된_담당자에게_인계_이력이_남는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long m1 = create(MEMBER, bc, 2026);
        long m2 = create(MEMBER, bc, 2025);
        String[] c = cell(true);
        assertNotNull(c);
        save(m1, MEMBER, body(0, c[0], c[1], "10"), 201);
        long req = requestChange(LEAD, bc, new String[]{M3}, new String[]{MEMBER});
        assertEquals(200, decide(HEAD, req).getResponse().getStatus());
        // 배정 이력: 해제된 사람→받은 사람 1행, 자료 번호 없음
        List<Map<String, Object>> h = jdbc.queryForList(
                "SELECT TARGET_EMP_NO, FROM_EMP_NO, REQ_ID FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='HANDOVER'", bc);
        assertEquals(1, h.size());
        assertEquals(M3, h.get(0).get("TARGET_EMP_NO"));
        assertEquals(MEMBER, h.get(0).get("FROM_EMP_NO"));
        assertEquals(req, ((Number) h.get(0).get("REQ_ID")).longValue());
        // 자료 이력: 자료마다 1행
        assertEquals(2, count("SELECT COUNT(*) FROM BOARD_MATERIAL_LOG WHERE EVENT_CD='HANDOVER' AND TO_EMP_NO=? AND FROM_EMP_NO=?", M3, MEMBER));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_LOG WHERE MATERIAL_ID=? AND EVENT_CD='HANDOVER'", m1));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_LOG WHERE MATERIAL_ID=? AND EVENT_CD='HANDOVER'", m2));
        // 새 담당자·남은 담당자는 값을 보고 이어서 쓴다
        JsonNode seen = json(read("/board-materials/" + m1, M3));
        assertEquals(1, seen.path("snapshot").path("snap_no").asInt());
        save(m1, M3, body(1, c[0], c[1], "11"), 201);
        assertEquals(200, read("/board-materials/" + m1, MEMBER2).getResponse().getStatus());
        assertEquals(404, read("/board-materials/" + m1, MEMBER).getResponse().getStatus());
        // 배정 이력 응답: from_* 는 있고 material_id 는 없다(존재 은닉)
        MvcResult hist = read("/bidcases/" + bc + "/assignments/history", MEMBER2);
        assertEquals(200, hist.getResponse().getStatus());
        boolean seenRow = false;
        for (JsonNode n : json(hist)) {
            if ("HANDOVER".equals(n.path("action_cd").asText())) {
                seenRow = true;
                assertEquals(MEMBER, n.path("from_emp_no").asText());
                assertFalse(n.has("material_id"));
            }
        }
        assertTrue(seenRow);
    }

    @Test
    public void 추가된_담당자가_여럿이면_받는_사람_전원에게_쌍마다_기록한다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        create(MEMBER, bc, 2026);
        long req = requestChange(LEAD, bc, new String[]{M3, M4}, new String[]{MEMBER});
        assertEquals(200, decide(HEAD, req).getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='HANDOVER'", bc));
        assertEquals(2, count("SELECT COUNT(*) FROM BOARD_MATERIAL_LOG WHERE EVENT_CD='HANDOVER' AND FROM_EMP_NO=?", MEMBER));
    }

    @Test
    public void 추가가_없으면_남은_담당자가_받는다_작성하지_않은_사람의_해제는_인계_행이_없다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        create(MEMBER, bc, 2026);
        long req = requestChange(LEAD, bc, new String[]{}, new String[]{MEMBER});
        assertEquals(200, decide(HEAD, req).getResponse().getStatus());
        List<Map<String, Object>> h = jdbc.queryForList(
                "SELECT TARGET_EMP_NO, FROM_EMP_NO FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='HANDOVER'", bc);
        assertEquals(1, h.size());
        assertEquals(MEMBER2, h.get(0).get("TARGET_EMP_NO"));

        String bc2 = newCase();
        assign(bc2, MEMBER, MEMBER2);
        create(MEMBER, bc2, 2026);                              // MEMBER2 는 만들지도 저장하지도 않았다
        long req2 = requestChange(LEAD, bc2, new String[]{}, new String[]{MEMBER2});
        assertEquals(200, decide(HEAD, req2).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='HANDOVER'", bc2));
    }

    @Test
    public void 받을_사용_중인_담당자가_없으면_409_NO_HANDOVER_TARGET() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        create(MEMBER, bc, 2026);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", MEMBER2);   // 남은 담당자가 사용 중이 아니다
        flushCache();
        long req = requestChange(LEAD, bc, new String[]{}, new String[]{MEMBER});
        MvcResult r = decide(HEAD, req);
        assertEquals(text(r), 409, r.getResponse().getStatus());
        assertEquals("NO_HANDOVER_TARGET", json(r).path("detail").path("code").asText());
    }

    // ── 확정 건 감사 기록 ───────────────────────────────────────────

    @Test
    public void 확정_건의_모든_호출은_누가_어느_화면_버튼으로_어떤_결과였는지_남는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        save(id, MEMBER, body(0, c[0], c[1], "5"), 201);
        long draftOther = create(MEMBER, bc, 2025);                       // 확정이 아닌 자료 — 기록 대상 아님
        jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD='CONFIRMED', CONFIRMED_SNAP=1, CONFIRMED_BY=?, CONFIRMED_AT=? WHERE MATERIAL_ID=?",
                LEAD, "2026-11-10T09:00:00+09:00", id);
        flushCache();
        assertEquals(200, read("/board-materials/" + id, MEMBER).getResponse().getStatus());           // 담당자 열람(OK)
        assertEquals(200, readNoUi("/board-materials/" + id, HEAD).getResponse().getStatus());          // 부장 열람, 식별자 없음
        assertEquals(404, read("/board-materials/" + id, MEMBER2).getResponse().getStatus());           // 비담당 — 404 이지만 기록
        assertEquals(409, send("/board-materials/" + id + "/snapshots", MEMBER, body(1, c[0], c[1], "6")).getResponse().getStatus());
        assertEquals(401, read("/board-materials/" + id, null).getResponse().getStatus());              // 사번 없음
        assertEquals(200, read("/board-materials/" + draftOther, MEMBER).getResponse().getStatus());   // 확정 아님
        List<Map<String, Object>> acts = jdbc.queryForList(
                "SELECT ACTION_CD, OUTCOME, STATUS_CD, SNAP_NO, ACTOR_EMP_NO, EMP_VERIFIED, SCREEN_ID, BUTTON_ID, UI_VALID "
                        + "FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? ORDER BY ACT_ID", id);
        assertEquals(5, acts.size());
        assertEquals("VIEW", acts.get(0).get("ACTION_CD"));
        assertEquals("OK", acts.get(0).get("OUTCOME"));
        assertEquals("CONFIRMED", acts.get(0).get("STATUS_CD"));
        assertEquals(1, ((Number) acts.get(0).get("SNAP_NO")).intValue());
        assertEquals(MEMBER, acts.get(0).get("ACTOR_EMP_NO"));
        assertEquals(0, ((Number) acts.get(0).get("EMP_VERIFIED")).intValue());              // 자기신고
        assertEquals("board_list", acts.get(0).get("SCREEN_ID"));
        assertEquals("open", acts.get(0).get("BUTTON_ID"));
        assertEquals(1, ((Number) acts.get(0).get("UI_VALID")).intValue());
        assertEquals("OK", acts.get(1).get("OUTCOME"));                                      // 부장
        assertEquals("UNKNOWN", acts.get(1).get("SCREEN_ID"));                               // 허용 목록 밖/없음 → UNKNOWN
        assertEquals("UNKNOWN", acts.get(1).get("BUTTON_ID"));
        assertEquals(0, ((Number) acts.get(1).get("UI_VALID")).intValue());
        assertEquals("HIDDEN", acts.get(2).get("OUTCOME"));
        assertEquals(MEMBER2, acts.get(2).get("ACTOR_EMP_NO"));
        assertEquals("SAVE", acts.get(3).get("ACTION_CD"));
        assertEquals("BLOCKED", acts.get(3).get("OUTCOME"));
        assertEquals("DENIED", acts.get(4).get("OUTCOME"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", draftOther));
        // 값·본문은 기록하지 않는다 — 열 목록에 값 칸이 없다
        assertFalse(acts.get(3).toString().contains("\"6\""));
    }

    @Test
    public void 확정_건_허용_목록_밖_헤더는_원문이_기록되지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD='CONFIRMED', CONFIRMED_SNAP=1, CONFIRMED_BY=?, CONFIRMED_AT=? WHERE MATERIAL_ID=?",
                LEAD, "2026-11-10T09:00:00+09:00", id);
        flushCache();
        MvcResult r = mockMvc.perform(as(get("/board-materials/" + id)
                .header("X-Screen-Id", "<img src=x onerror=1>").header("X-Button-Id", "정체불명"), MEMBER)).andReturn();
        assertEquals(200, r.getResponse().getStatus());
        Map<String, Object> row = jdbc.queryForList("SELECT SCREEN_ID, BUTTON_ID, UI_VALID FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", id).get(0);
        assertEquals("UNKNOWN", row.get("SCREEN_ID"));
        assertEquals("UNKNOWN", row.get("BUTTON_ID"));
        assertEquals(0, ((Number) row.get("UI_VALID")).intValue());
    }

    // ── 보안 규칙 단위 ──────────────────────────────────────────────

    @Test
    public void 담당자의_역할이_바뀌거나_비활성이면_쓰기_열람이_바로_막힌다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        jdbc.update("UPDATE USERS SET ROLE='디자이너' WHERE EMP_NO=?", MEMBER);
        flushCache();
        assertEquals(0, json(read("/board-materials", MEMBER)).path("items").size());
        assertEquals(404, read("/board-materials/" + id, MEMBER).getResponse().getStatus());
        assertEquals(403, send("/board-materials", MEMBER, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}").getResponse().getStatus());
    }

    @Test
    public void 연도와_입찰건_입력_검증() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        for (String body : new String[]{"{\"bid_case_id\":\"" + bc + "\"}", "{\"bid_case_id\":\"" + bc + "\",\"year\":1999}",
                "{\"bid_case_id\":\"" + bc + "\",\"year\":2101}", "{\"year\":2026}", "{\"bid_case_id\":\"\",\"year\":2026}"}) {
            int s = send("/board-materials", MEMBER, body).getResponse().getStatus();
            assertTrue(body, s == 400 || s == 403);   // 입찰 건이 없으면 자격 확인 앞이라 403, 그 외 400
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL"));
        fail_if_missing_year_accepted(bc);
    }

    private void fail_if_missing_year_accepted(String bc) throws Exception {
        assertEquals(400, send("/board-materials", MEMBER, "{\"bid_case_id\":\"" + bc + "\"}").getResponse().getStatus());
    }
}
