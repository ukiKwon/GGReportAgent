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
import java.util.ArrayList;
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
        // 같은 기관·같은 연도로 한 건 더 — 409 ALREADY_EXISTS(P1-3), 다른 연도는 된다
        MvcResult dup = send("/board-materials", MEMBER, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}");
        assertEquals(409, dup.getResponse().getStatus());
        assertEquals("ALREADY_EXISTS", json(dup).path("detail").path("code").asText());
        assertEquals(id, json(dup).path("detail").path("material_id").asLong());
        create(MEMBER, bc, 2025);
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL WHERE BID_CASE_ID=? AND BOARD_YEAR=2026", bc));
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
        assertEquals(4, acts.size());   // 사번 없는 401 은 ACT 에 남기지 않는다(ACCESS_LOG 에만)
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

    // ── 020a 후속 도우미 ────────────────────────────────────────────

    /** 기본 양식의 엑셀 연결 칸 전부({ref,key}). */
    private static List<String[]> allMapped() {
        List<String[]> out = new ArrayList<String[]>();
        for (BoardDocSpec.Table t : BoardDocSpec.find(BoardDocSpec.DEFAULT_ID, true).getTables()) {
            for (List<BoardDocSpec.Cell> row : t.getRows()) {
                for (BoardDocSpec.Cell c : row) {
                    if (c.isMapped()) {
                        out.add(new String[]{t.getId(), c.getKey()});
                    }
                }
            }
        }
        return out;
    }

    /** 지정한 칸들에 같은 값을 넣은 저장 본문(표별로 묶는다). */
    private static String multi(int base, List<String[]> cells, String val) {
        java.util.Map<String, StringBuilder> byRef = new java.util.LinkedHashMap<String, StringBuilder>();
        for (String[] c : cells) {
            StringBuilder sb = byRef.get(c[0]);
            if (sb == null) {
                sb = new StringBuilder();
                byRef.put(c[0], sb);
            } else {
                sb.append(',');
            }
            sb.append('"').append(c[1]).append("\":\"").append(val).append('"');
        }
        StringBuilder out = new StringBuilder("{\"base_snap_no\":").append(base).append(",\"tables\":[");
        boolean first = true;
        for (Map.Entry<String, StringBuilder> e : byRef.entrySet()) {
            out.append(first ? "" : ",").append("{\"ref\":\"").append(e.getKey()).append("\",\"cells\":{").append(e.getValue()).append("}}");
            first = false;
        }
        return out.append("]}").toString();
    }

    private static String rep(char ch, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append(ch);
        }
        return sb.toString();
    }

    private void confirm(long... ids) throws Exception {
        for (long id : ids) {
            jdbc.update("UPDATE BOARD_MATERIAL SET STATUS_CD='CONFIRMED', CONFIRMED_SNAP=1, CONFIRMED_BY=?, CONFIRMED_AT=? WHERE MATERIAL_ID=?",
                    LEAD, "2026-11-10T09:00:00+09:00", id);
        }
        flushCache();
    }

    private static boolean hasAction(JsonNode rows, String action) {
        for (JsonNode n : rows) {
            if (action.equals(n.path("action_cd").asText())) {
                return true;
            }
        }
        return false;
    }

    // ── 020a 후속: 양식 구조·중복·숫자 문법·칸 위치·우회 검출·감사 ──────────

    @Test
    public void 담당자와_영업부장은_자료_응답의_form으로_양식_구조를_받는다_비담당은_404() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        save(id, MEMBER, body(0, c[0], c[1], "5"), 201);
        for (String emp : new String[]{MEMBER, HEAD}) {
            JsonNode d = json(read("/board-materials/" + id, emp));
            JsonNode f = d.path("form");
            assertEquals(emp, BoardDocSpec.DEFAULT_ID, f.path("form_id").asText());
            assertTrue(emp, f.path("version").isNull());                         // 기본 양식은 버전 없음
            assertTrue(emp, f.path("tables").size() > 0);
            assertFalse(emp, f.path("tables").get(0).path("rows").get(0).get(0).path("editable").asBoolean());   // 양식 편집이 아니다
            JsonNode s = json(read("/board-materials/" + id + "/snapshots/1", emp));
            assertEquals(emp, BoardDocSpec.DEFAULT_ID, s.path("form").path("form_id").asText());
            assertTrue(emp, s.path("tables").size() > 0);
            assertFalse(emp, json(read("/board-materials/" + id + "/snapshots", emp)).has("form"));   // 목록 응답에는 없다
        }
        assertEquals(404, read("/board-materials/" + id, MEMBER2).getResponse().getStatus());
        assertEquals(404, read("/board-materials/" + id + "/snapshots/1", MEMBER2).getResponse().getStatus());
        // 만들기 응답(201)에도 form
        String bc2 = newCase();
        assign(bc2, MEMBER);
        MvcResult made = send("/board-materials", MEMBER, "{\"bid_case_id\":\"" + bc2 + "\",\"year\":2026}");
        assertTrue(json(made).path("form").path("tables").size() > 0);
    }

    @Test
    public void 같은_입찰건_같은_연도는_409_ALREADY_EXISTS_기존_번호만_알린다_비담당은_403() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = create(MEMBER, bc, 2026);
        MvcResult dup = send("/board-materials", MEMBER2, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}");
        assertEquals(text(dup), 409, dup.getResponse().getStatus());
        JsonNode d = json(dup).path("detail");
        assertEquals("ALREADY_EXISTS", d.path("code").asText());
        assertEquals(id, d.path("material_id").asLong());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL WHERE BID_CASE_ID=? AND BOARD_YEAR=2026", bc));
        create(MEMBER2, bc, 2025);                                            // 다른 연도는 된다
        String bc2 = newCase();
        assign(bc2, MEMBER);
        create(MEMBER, bc2, 2026);                                            // 다른 입찰 건은 된다
        // 존재 은닉: 비담당·부장은 중복 여부와 무관하게 403
        for (String emp : new String[]{LEAD, HEAD, DESIGNER}) {
            assertEquals(emp, 403, send("/board-materials", emp, "{\"bid_case_id\":\"" + bc + "\",\"year\":2026}")
                    .getResponse().getStatus());
        }
    }

    @Test
    public void 숫자_칸은_쉼표가_있어도_정수부_13자리까지() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        for (String bad : new String[]{"12,345,678,901,234", "99,999,999,999,999", "-12,345,678,901,234", "1,2345", "1,23"}) {
            assertEquals(bad, "BAD_VALUE", om.readTree(save(id, MEMBER, body(0, c[0], c[1], bad), 400))
                    .path("detail").path("code").asText());
        }
        save(id, MEMBER, body(0, c[0], c[1], "1,234,567,890,123"), 201);       // 13자리
        assertTrue(jdbc.queryForObject("SELECT VALUES_JSON FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=? AND SNAP_NO=1",
                String.class, id).contains("\"1234567890123\""));
    }

    // ── 020a: 괄호 칸(B 출연금 key_p)·단위 칸(C-4 년·%)·직접 입력 기관명(A r1_c0) ──

    /** 한 표에 여러 칸을 담은 저장 본문. kv 는 key, value 쌍. */
    private static String bodyOf(int base, String ref, String... kv) {
        StringBuilder sb = new StringBuilder("{\"base_snap_no\":" + base + ",\"tables\":[{\"ref\":\"" + ref + "\",\"cells\":{");
        for (int i = 0; i < kv.length; i += 2) {
            sb.append(i == 0 ? "" : ",").append('"').append(kv[i]).append("\":\"").append(kv[i + 1]).append('"');
        }
        return sb.append("}}]}").toString();
    }

    private String stored(long id, int snap) {
        return jdbc.queryForObject("SELECT VALUES_JSON FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=? AND SNAP_NO=?",
                String.class, id, snap);
    }

    private long assignedMaterial() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        return create(MEMBER, bc, 2026);
    }

    @Test
    public void 괄호_칸은_앞_값과_key_p_값을_각각_숫자로_받아_정규형으로_저장한다() throws Exception {
        long id = assignedMaterial();
        save(id, MEMBER, bodyOf(0, "B", "r1_c5", "5.00", "r1_c5_p", "1.00"), 201);
        String s = stored(id, 1);
        assertTrue(s, s.contains("\"r1_c5\":\"5\""));
        assertTrue(s, s.contains("\"r1_c5_p\":\"1\""));
    }

    @Test
    public void 괄호_값만_있거나_괄호_글자를_통째로_보내면_400_문제_칸_위치만() throws Exception {
        long id = assignedMaterial();
        JsonNode only = om.readTree(save(id, MEMBER, bodyOf(0, "B", "r1_c5_p", "1"), 400)).path("detail");
        assertEquals("BAD_VALUE", only.path("code").asText());
        assertEquals(1, only.path("count").asInt());
        assertEquals("B", only.path("cells").get(0).path("ref").asText());
        assertEquals("r1_c5_p", only.path("cells").get(0).path("key").asText());
        JsonNode whole = om.readTree(save(id, MEMBER, bodyOf(0, "B", "r1_c5", "5.00 (1.00)"), 400)).path("detail");
        assertEquals("BAD_VALUE", whole.path("code").asText());
        assertEquals(1, whole.path("count").asInt());
        assertEquals("r1_c5", whole.path("cells").get(0).path("key").asText());
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 괄호_칸이_아닌_칸의_p_키는_구조_오류_400_BAD_VALUE() throws Exception {
        long id = assignedMaterial();
        JsonNode d = om.readTree(save(id, MEMBER, bodyOf(0, "B", "r1_c4_p", "1"), 400)).path("detail");
        assertEquals("BAD_VALUE", d.path("code").asText());
        assertEquals(0, d.path("cells").size());                                  // 구조 오류는 단일 메시지(칸 목록 없음)
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 단위_칸은_숫자만_받는다_년_퍼센트_글자가_붙으면_400() throws Exception {
        long id = assignedMaterial();
        JsonNode d = om.readTree(save(id, MEMBER, bodyOf(0, "C-4", "r1_c1", "3.4년"), 400)).path("detail");
        assertEquals("BAD_VALUE", d.path("code").asText());
        assertEquals("C-4", d.path("cells").get(0).path("ref").asText());
        assertEquals("r1_c1", d.path("cells").get(0).path("key").asText());
        JsonNode p = om.readTree(save(id, MEMBER, bodyOf(0, "C-4", "r3_c1", "0.74%"), 400)).path("detail");
        assertEquals("r3_c1", p.path("cells").get(0).path("key").asText());
        save(id, MEMBER, bodyOf(0, "C-4", "r1_c1", "3.4", "r3_c1", "0.74"), 201);
        String s = stored(id, 1);
        assertTrue(s, s.contains("\"r1_c1\":\"3.4\""));
        assertTrue(s, s.contains("\"r3_c1\":\"0.74\""));
    }

    @Test
    public void 기관명_r1_c0은_직접_입력_칸_텍스트는_저장되고_개인정보는_422() throws Exception {
        long id = assignedMaterial();
        save(id, MEMBER, bodyOf(0, "A", "r1_c0", "노원구"), 201);
        assertTrue(stored(id, 1), stored(id, 1).contains("\"r1_c0\":\"노원구\""));
        String pii = save(id, MEMBER, bodyOf(1, "A", "r1_c0", "담당 900101-1234567"), 422);
        JsonNode d = om.readTree(pii).path("detail");
        assertEquals("PII_DETECTED", d.path("code").asText());
        assertEquals("A", d.path("cells").get(0).path("ref").asText());
        assertEquals("r1_c0", d.path("cells").get(0).path("key").asText());
        assertFalse(pii.contains("900101-1234567"));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 옛_스냅샷처럼_key_p_없는_괄호_칸_값도_열리고_같은_값으로_다시_저장된다() throws Exception {
        long id = assignedMaterial();
        save(id, MEMBER, bodyOf(0, "B", "r2_c5", "4.4"), 201);                  // 괄호 값 없음(옛 저장 모양)
        assertFalse(stored(id, 1), stored(id, 1).contains("_p"));
        assertEquals(200, read("/board-materials/" + id + "/snapshots/1", MEMBER).getResponse().getStatus());
        JsonNode again = om.readTree(save(id, MEMBER, bodyOf(1, "B", "r2_c5", "4.40"), 200));
        assertFalse(again.path("changed").asBoolean());
    }

    @Test
    public void 숫자_400_100자_400_칸_422는_문제_칸_위치만_알린다_값은_싣지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        List<String[]> mapped = allMapped();
        assertTrue("기본 양식에 연결 칸이 2개 미만", mapped.size() >= 2);
        List<String[]> two = mapped.subList(0, 2);
        // 숫자 형식 위반 2칸
        String numText = save(id, MEMBER, multi(0, two, "12a"), 400);
        JsonNode nd = om.readTree(numText).path("detail");
        assertEquals("BAD_VALUE", nd.path("code").asText());
        assertEquals(2, nd.path("count").asInt());
        assertEquals(2, nd.path("cells").size());
        assertEquals(two.get(0)[0], nd.path("cells").get(0).path("ref").asText());
        assertEquals(two.get(0)[1], nd.path("cells").get(0).path("key").asText());
        assertFalse(numText.contains("12a"));
        // 개인정보 2칸 — 종류·건수·칸 위치, 값 없음
        String piiText = save(id, MEMBER, multi(0, two, "010-0000-0000"), 422);
        JsonNode pd = om.readTree(piiText).path("detail");
        assertEquals("PII_DETECTED", pd.path("code").asText());
        assertEquals(2, pd.path("count").asInt());
        assertEquals(2, pd.path("cells").size());
        assertEquals(two.get(1)[1], pd.path("cells").get(1).path("key").asText());
        assertEquals(2, pd.path("kinds").get(0).path("count").asInt());
        assertFalse(piiText.contains("010-0000-0000"));
        // 100자 초과 1칸
        String[] c = two.get(0);
        JsonNode ld = om.readTree(save(id, MEMBER, body(0, c[0], c[1], rep('1', 101)), 400)).path("detail");
        assertEquals("BAD_VALUE", ld.path("code").asText());
        assertEquals(1, ld.path("count").asInt());
        assertEquals(c[1], ld.path("cells").get(0).path("key").asText());
        // 목록은 최대 50개, count 는 전체(양식 구조 대조 전에 걸리므로 가짜 키로 충분)
        StringBuilder many = new StringBuilder("{\"base_snap_no\":0,\"tables\":[{\"ref\":\"A\",\"cells\":{");
        String longVal = rep('1', 101);
        for (int i = 1; i <= 60; i++) {
            many.append(i == 1 ? "" : ",").append("\"k").append(i).append("\":\"").append(longVal).append('"');
        }
        JsonNode md = om.readTree(save(id, MEMBER, many.append("}}]}").toString(), 400)).path("detail");
        assertEquals(60, md.path("count").asInt());
        assertEquals(50, md.path("cells").size());
        // 안전하지 않은 키는 세기만 하고 되돌려 싣지 않는다
        String evil = save(id, MEMBER, body(0, "A", "<img src=x onerror=1>", longVal), 400);
        assertEquals(1, om.readTree(evil).path("detail").path("count").asInt());
        assertEquals(0, om.readTree(evil).path("detail").path("cells").size());
        assertFalse(evil.contains("<img"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 숫자_정규화_뒤에_주민번호_모양이_되는_쉼표_묶음은_422() throws Exception {      // security 하-1
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        String r = save(id, MEMBER, body(0, c[0], c[1], "9,001,011,234,567"), 422);
        JsonNode d = om.readTree(r).path("detail");
        assertEquals("PII_DETECTED", d.path("code").asText());
        assertEquals(c[1], d.path("cells").get(0).path("key").asText());
        assertFalse(r.contains("9001011234567"));
        assertFalse(r.contains("9,001"));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 구분자_우회_en_dash_가운뎃점_점_폭없는_공백_비ASCII_숫자도_422() throws Exception {      // security 하-2
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        for (String v : new String[]{"900101–1234567", "900101·1234567", "900101.1234567", "900101​-1234567",
                "٩٠٠١٠١-1234567", "010–1234–5678"}) {
            assertEquals(v, "PII_DETECTED", om.readTree(save(id, MEMBER, body(0, c[0], c[1], v), 422))
                    .path("detail").path("code").asText());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 정상_금액_소수는_개인정보로_오탐하지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        int base = 0;
        for (String v : new String[]{"9.5", "1,234.56", "123456.78", "0.12", "9001.01", "900101.12", "-1,234.5"}) {
            save(id, MEMBER, body(base++, c[0], c[1], v), 201);
        }
        assertEquals(7, count("SELECT COUNT(*) FROM BOARD_MATERIAL_SNAP WHERE MATERIAL_ID=?", id));
    }

    @Test
    public void 목록은_확정_건_행마다_LIST로_남고_확정이_아닌_행과_401은_남지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long a = create(MEMBER, bc, 2026);
        long b = create(MEMBER, bc, 2025);
        long d = create(MEMBER, bc, 2024);                                     // 확정 아님
        confirm(a, b);
        assertEquals(200, read("/board-materials", MEMBER).getResponse().getStatus());
        for (long id : new long[]{a, b}) {
            assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='LIST' AND OUTCOME='OK'", id));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", d));
        Map<String, Object> row = jdbc.queryForList(
                "SELECT ACTOR_EMP_NO, STATUS_CD, SCREEN_ID, BUTTON_ID, UI_VALID, EMP_VERIFIED FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", a).get(0);
        assertEquals(MEMBER, row.get("ACTOR_EMP_NO"));
        assertEquals("CONFIRMED", row.get("STATUS_CD"));
        assertEquals("board_list", row.get("SCREEN_ID"));
        assertEquals(0, ((Number) row.get("EMP_VERIFIED")).intValue());        // 자기신고
        assertEquals(401, read("/board-materials", null).getResponse().getStatus());
        assertEquals(200, read("/board-materials", MEMBER2).getResponse().getStatus());   // 비담당 — 빈 목록, 기록 없음
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='LIST'", a));
        assertEquals(200, read("/board-materials", HEAD).getResponse().getStatus());      // 부장 — 전체
        assertEquals(2, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='LIST'", a));
        assertEquals(0, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", d));
    }

    @Test
    public void 확정_건에_비활성_계정은_DENIED로_남고_사번_없는_401은_ACT에_남지_않는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        confirm(id);
        jdbc.update("UPDATE USERS SET STATUS='LOCKED' WHERE EMP_NO=?", DESIGNER);
        flushCache();
        assertEquals(403, read("/board-materials/" + id, DESIGNER).getResponse().getStatus());
        assertEquals(401, read("/board-materials/" + id, null).getResponse().getStatus());
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT OUTCOME, ACTOR_EMP_NO FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", id);
        assertEquals(1, rows.size());
        assertEquals("DENIED", rows.get(0).get("OUTCOME"));
        assertEquals(DESIGNER, rows.get(0).get("ACTOR_EMP_NO"));
    }

    @Test
    public void 확정_건에서_예상하지_못한_예외가_나도_ACT에_ERROR가_남는다() throws Exception {      // security 하-4①
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertNotNull(c);
        save(id, MEMBER, body(0, c[0], c[1], "5"), 201);
        confirm(id);
        jdbc.update("UPDATE BOARD_MATERIAL_SNAP SET VALUES_JSON='not-json' WHERE MATERIAL_ID=?", id);   // 저장 JSON 결함 → tablesOf ISE
        flushCache();
        MvcResult r = read("/board-materials/" + id, MEMBER);
        assertEquals(500, r.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='VIEW' AND OUTCOME='ERROR'", id));
        assertFalse(text(r).contains("not-json"));
    }

    @Test
    public void 배정_이력의_인계_행은_담당자_영업팀장_영업부장에게만_보이고_비담당_영업팀원에게는_빠진다() throws Exception {   // security 하-3
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        create(MEMBER, bc, 2026);
        long req = requestChange(LEAD, bc, new String[]{M3}, new String[]{MEMBER});
        assertEquals(200, decide(HEAD, req).getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM BID_ASSIGN_LOG WHERE BID_CASE_ID=? AND ACTION_CD='HANDOVER'", bc));
        // 보이는 사람: 현재 담당자(남은·새로 추가된), 영업팀장, 영업부장
        for (String emp : new String[]{MEMBER2, M3, LEAD, HEAD}) {
            MvcResult r = read("/bidcases/" + bc + "/assignments/history", emp);
            if (r.getResponse().getStatus() != 200) {
                continue;   // 부장이 이 API 의 영업팀 한정에 걸리면 403 — 그 판정은 이번 변경이 아니다
            }
            assertTrue(emp, hasAction(json(r), "HANDOVER"));
        }
        assertTrue(hasAction(json(read("/bidcases/" + bc + "/assignments/history", MEMBER2)), "HANDOVER"));
        assertTrue(hasAction(json(read("/bidcases/" + bc + "/assignments/history", LEAD)), "HANDOVER"));
        // 안 보이는 사람: 이 건의 담당이 아닌 영업팀원(M4), 담당에서 빠진 사람(MEMBER)
        for (String emp : new String[]{M4, MEMBER}) {
            MvcResult r = read("/bidcases/" + bc + "/assignments/history", emp);
            assertEquals(emp, 200, r.getResponse().getStatus());
            assertFalse(emp, hasAction(json(r), "HANDOVER"));
            assertTrue(emp, hasAction(json(r), "ASSIGN"));   // 다른 행은 그대로
            assertFalse(emp, text(r).contains(M3 + "\",\"from"));   // 인수자·해제자가 다른 경로로 새지 않는다(HANDOVER 행째 없음)
        }
    }

    // ── 020b 도우미 ──────────────────────────────────────────────────

    private MvcResult act(String path, String emp, String body, String screen, String button) throws Exception {
        return mockMvc.perform(as(post(path).contentType(MediaType.APPLICATION_JSON).content(body)
                .header("X-Screen-Id", screen).header("X-Button-Id", button), emp)).andReturn();
    }

    private MvcResult actGet(String path, String emp, String screen, String button) throws Exception {
        return mockMvc.perform(as(get(path).header("X-Screen-Id", screen).header("X-Button-Id", button), emp)).andReturn();
    }

    private MvcResult review(long id, String emp) throws Exception {
        return actGet("/board-materials/" + id + "/review", emp, "board_review", "review_open");
    }

    private long draftWithSnap(String emp, String bc, int year) throws Exception {
        long id = create(emp, bc, year);
        String[] c = cell(true);
        save(id, emp, body(0, c[0], c[1], "5"), 201);
        return id;
    }

    private long submit(long id, String emp) throws Exception {
        MvcResult r = act("/board-materials/" + id + "/submit", emp, "{}", "board_write", "submit");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        return json(r).path("req_id").asLong();
    }

    private MvcResult approveAs(long req, String emp) throws Exception {
        return act("/approval-requests/" + req + "/decide", emp, "{\"decision\":\"APPROVE\"}", "approvals_inbox", "approve");
    }

    private MvcResult reject(String emp, long req, String comment) throws Exception {
        return act("/approval-requests/" + req + "/decide", emp,
                "{\"decision\":\"REJECT\",\"comment\":\"" + comment + "\"}", "approvals_inbox", "reject");
    }

    private MvcResult rework(long id, String emp, String reason) throws Exception {
        return act("/board-materials/" + id + "/rework", emp, "{\"reason\":\"" + reason + "\"}", "board_review", "rework");
    }

    private MvcResult withdraw(long id, String emp) throws Exception {
        return act("/board-materials/" + id + "/withdraw", emp, "{}", "board_write", "withdraw");
    }

    private MvcResult setResult(long id, String emp, String json) throws Exception {
        return act("/board-materials/" + id + "/result", emp, json, "board_write", "result_save");
    }

    /** 제출(담당자) → 결재자 승인까지 마쳐 확정된 자료 번호. 호출 전에 담당 배정이 끝나 있어야 한다. */
    private long confirmedMaterial(String bc, int year, String submitter, String approver) throws Exception {
        long id = draftWithSnap(submitter, bc, year);
        long req = submit(id, submitter);
        MvcResult r = approveAs(req, approver);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("CONFIRMED", statusOf(id));
        return id;
    }

    private String statusOf(long id) {
        return jdbc.queryForObject("SELECT STATUS_CD FROM BOARD_MATERIAL WHERE MATERIAL_ID=?", String.class, id);
    }

    private String reqStatus(long req) {
        return jdbc.queryForObject("SELECT STATUS FROM APPROVAL_REQUEST WHERE REQ_ID=?", String.class, req);
    }

    private int logCount(long id, String event) {
        return count("SELECT COUNT(*) FROM BOARD_MATERIAL_LOG WHERE MATERIAL_ID=? AND EVENT_CD=?", id, event);
    }

    private JsonNode detailJson(long id, String emp) throws Exception {
        return json(read("/board-materials/" + id, emp));
    }

    private String codeOf(MvcResult r) throws Exception {
        return om.readTree(text(r)).path("detail").path("code").asText();
    }

    // ── 020b: 제출·결재·회수·반려·재작성·결과 ─────────────────────────

    @Test
    public void 제출_승인_확정_결과변경_전체_흐름() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        String[] c = cell(true);
        assertTrue(detailJson(id, MEMBER).path("viewer").path("can_submit").asBoolean());
        long req = submit(id, MEMBER);
        assertEquals("SUBMITTED", statusOf(id));
        assertEquals(1, count("SELECT COUNT(*) FROM APPROVAL_REQUEST WHERE REQ_ID=? AND REQ_TYPE='BOARD_SUBMIT'", req));
        assertEquals(1, count("SELECT COUNT(*) FROM APPROVAL_STEP WHERE REQ_ID=?", req));
        assertEquals(LEAD, jdbc.queryForObject("SELECT APPROVER_EMP_NO FROM APPROVAL_STEP WHERE REQ_ID=?", String.class, req));
        assertEquals(1, logCount(id, "SUBMIT"));
        assertEquals(1, count("SELECT SUBMIT_SNAP FROM BOARD_MATERIAL WHERE MATERIAL_ID=?", id));
        MvcResult again = act("/board-materials/" + id + "/submit", MEMBER, "{}", "board_write", "submit");
        assertEquals(409, again.getResponse().getStatus());
        assertEquals("ALREADY_SUBMITTED", codeOf(again));
        MvcResult locked = send("/board-materials/" + id + "/snapshots", MEMBER, body(1, c[0], c[1], "6"));
        assertEquals(409, locked.getResponse().getStatus());
        assertEquals("MATERIAL_LOCKED", codeOf(locked));
        MvcResult rv = review(id, LEAD);                                     // 결재선 팀장 열람(읽기 전용)
        assertEquals(text(rv), 200, rv.getResponse().getStatus());
        assertTrue(json(rv).path("snapshot").path("tables").size() > 0);
        assertFalse(json(rv).path("viewer").path("can_rework").asBoolean());
        assertEquals(req, json(rv).path("viewer").path("pending_req_id").asLong());
        assertEquals(404, read("/board-materials/" + id, LEAD).getResponse().getStatus());   // 담당이 아니므로 detail 은 404
        MvcResult ok = approveAs(req, LEAD);
        assertEquals(text(ok), 200, ok.getResponse().getStatus());
        assertEquals("CONFIRMED", statusOf(id));
        assertEquals(1, count("SELECT CONFIRMED_SNAP FROM BOARD_MATERIAL WHERE MATERIAL_ID=?", id));
        Map<String, Object> confirm = jdbc.queryForMap(
                "SELECT OUTCOME, STATUS_CD, SCREEN_ID, BUTTON_ID, UI_VALID, ACTOR_EMP_NO FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='CONFIRM'", id);
        assertEquals("OK", confirm.get("OUTCOME"));
        assertEquals("SUBMITTED", confirm.get("STATUS_CD"));                // 행위 직전 상태(security S9)
        assertEquals("approvals_inbox", confirm.get("SCREEN_ID"));
        assertEquals("approve", confirm.get("BUTTON_ID"));
        assertEquals(1, ((Number) confirm.get("UI_VALID")).intValue());
        assertEquals(LEAD, confirm.get("ACTOR_EMP_NO"));
        assertEquals(200, review(id, LEAD).getResponse().getStatus());       // 확정한 사람은 확정 뒤에도 열람
        assertEquals("MATERIAL_LOCKED", codeOf(send("/board-materials/" + id + "/snapshots", MEMBER, body(1, c[0], c[1], "6"))));
        assertEquals("BLOCKED", jdbc.queryForObject(
                "SELECT OUTCOME FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='SAVE'", String.class, id));
        MvcResult res1 = setResult(id, MEMBER, "{\"result\":\"PASSED\",\"meeting_date\":\"2026-12-01\"}");
        assertEquals(text(res1), 200, res1.getResponse().getStatus());
        assertEquals("PASSED", json(res1).path("result_cd").asText());
        assertEquals(1, logCount(id, "RESULT"));
        MvcResult res2 = setResult(id, MEMBER, "{\"result\":\"REJECTED\",\"meeting_date\":\"2026-12-02\"}");
        assertEquals(text(res2), 200, res2.getResponse().getStatus());
        assertEquals("REJECTED", json(res2).path("result_cd").asText());
        assertEquals(2, logCount(id, "RESULT"));
        Map<String, Object> rvAct = jdbc.queryForMap(
                "SELECT OUTCOME, SCREEN_ID, BUTTON_ID, ACTOR_EMP_NO FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='REVIEW'", id);
        assertEquals("OK", rvAct.get("OUTCOME"));
        assertEquals("board_review", rvAct.get("SCREEN_ID"));
        assertEquals("review_open", rvAct.get("BUTTON_ID"));
        assertEquals(LEAD, rvAct.get("ACTOR_EMP_NO"));
    }

    @Test
    public void 회수는_담당자_누구나_결재중에만_회수하면_다시_작성() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = draftWithSnap(MEMBER, bc, 2026);
        String[] c = cell(true);
        long req = submit(id, MEMBER);
        MvcResult w = withdraw(id, MEMBER2);                                 // 다른 담당자도 회수 가능
        assertEquals(text(w), 200, w.getResponse().getStatus());
        assertEquals("DRAFT", json(w).path("status_cd").asText());
        assertEquals("CANCELLED", reqStatus(req));
        assertEquals(1, logCount(id, "WITHDRAW"));
        save(id, MEMBER2, body(1, c[0], c[1], "6"), 201);
        assertEquals(404, review(id, LEAD).getResponse().getStatus());       // DRAFT 는 결재선 팀장도 못 본다
        MvcResult w2 = withdraw(id, MEMBER);
        assertEquals(409, w2.getResponse().getStatus());
        assertEquals("NOT_SUBMITTED", codeOf(w2));
        assertEquals(409, approveAs(req, LEAD).getResponse().getStatus());   // 회수된 요청은 결재할 수 없다
        submit(id, MEMBER);
        assertEquals(404, withdraw(id, M4).getResponse().getStatus());       // 담당이 아닌 영업팀원
        assertEquals(404, withdraw(id, LEAD).getResponse().getStatus());     // 담당이 아닌 영업팀장
        assertEquals("SUBMITTED", statusOf(id));
    }

    @Test
    public void 팀장_반려는_작성중으로_사유가_보이고_고쳐_다시_제출() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        String[] c = cell(true);
        long req = submit(id, MEMBER);
        assertEquals(400, reject(LEAD, req, "").getResponse().getStatus());   // 반려는 의견 필수
        MvcResult rj = reject(LEAD, req, "수치 재확인");
        assertEquals(text(rj), 200, rj.getResponse().getStatus());
        assertEquals("REJECTED", reqStatus(req));
        assertEquals("DRAFT", statusOf(id));
        assertEquals(1, logCount(id, "REJECT"));
        JsonNode lr = detailJson(id, MEMBER).path("last_return");
        assertEquals("REJECT", lr.path("event_cd").asText());
        assertEquals("수치 재확인", lr.path("reason").asText());
        save(id, MEMBER, body(1, c[0], c[1], "6"), 201);
        long req2 = submit(id, MEMBER);
        assertTrue(req2 != req);
        JsonNode during = detailJson(id, MEMBER).path("last_return");        // 결재 중에는 항목 자체가 없다
        assertTrue(during.isMissingNode() || during.isNull());
        MvcResult w = withdraw(id, MEMBER);
        assertEquals(200, w.getResponse().getStatus());
        assertTrue(detailJson(id, MEMBER).path("last_return").isNull());     // 다시 제출한 뒤의 회수는 되돌림이 아니다
        long req3 = submit(id, MEMBER);
        assertEquals(200, approveAs(req3, LEAD).getResponse().getStatus());
        assertEquals("CONFIRMED", statusOf(id));
    }

    @Test
    public void 영업부장_재작성_요구는_결재중_확정_모두_가능_준비중_작성중은_409() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        String[] c = cell(true);
        long req = submit(id, MEMBER);
        // ⓔ 사유 검증(결재 중일 때)
        assertEquals(400, rework(id, HEAD, "").getResponse().getStatus());
        assertEquals(400, rework(id, HEAD, rep('가', 201)).getResponse().getStatus());
        assertEquals(422, rework(id, HEAD, "010-0000-0000").getResponse().getStatus());
        assertEquals("SUBMITTED", statusOf(id));
        // ⓓ 영업부장이 아니면 403
        for (String emp : new String[]{LEAD, MEMBER, ADMIN}) {
            assertEquals(emp, 403, rework(id, emp, "수치 재확인").getResponse().getStatus());
        }
        // ⓐ 결재 중 재작성 요구
        MvcResult rw = rework(id, HEAD, "수치 재확인");
        assertEquals(text(rw), 200, rw.getResponse().getStatus());
        assertEquals("DRAFT", json(rw).path("status_cd").asText());
        assertEquals("REJECTED", reqStatus(req));
        assertEquals(HEAD, jdbc.queryForObject("SELECT ACTED_BY FROM APPROVAL_STEP WHERE REQ_ID=? AND STATUS='REJECTED'", String.class, req));
        assertEquals(1, logCount(id, "REWORK"));
        assertEquals("수치 재확인", jdbc.queryForObject(
                "SELECT REASON FROM BOARD_MATERIAL_LOG WHERE MATERIAL_ID=? AND EVENT_CD='REWORK'", String.class, id));
        JsonNode lr = detailJson(id, MEMBER).path("last_return");
        assertEquals("REWORK", lr.path("event_cd").asText());
        assertEquals("수치 재확인", lr.path("reason").asText());
        // ⓕ 재작성 요구로 끝난 요청은 더 결재할 수 없다
        assertEquals(409, approveAs(req, LEAD).getResponse().getStatus());
        // ⓒ 작성 중(DRAFT)에는 요구할 것이 없다
        MvcResult na = rework(id, HEAD, "수치 재확인");
        assertEquals(409, na.getResponse().getStatus());
        assertEquals("NOT_APPLICABLE", codeOf(na));
        // ⓑ 확정(결과·개최일 입력 뒤)에서도 가능 — 결과·개최일·확정 정보는 비워진다
        save(id, MEMBER, body(1, c[0], c[1], "7"), 201);
        long req2 = submit(id, MEMBER);
        assertEquals(200, approveAs(req2, LEAD).getResponse().getStatus());
        assertEquals(200, setResult(id, MEMBER, "{\"result\":\"PASSED\",\"meeting_date\":\"2026-12-01\"}").getResponse().getStatus());
        MvcResult rw2 = rework(id, HEAD, "확정 뒤 재확인");
        assertEquals(text(rw2), 200, rw2.getResponse().getStatus());
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT STATUS_CD, RESULT_CD, MEETING_DATE, CONFIRMED_SNAP FROM BOARD_MATERIAL WHERE MATERIAL_ID=?", id);
        assertEquals("DRAFT", row.get("STATUS_CD"));
        assertEquals(null, row.get("RESULT_CD"));
        assertEquals(null, row.get("MEETING_DATE"));
        assertEquals(null, row.get("CONFIRMED_SNAP"));
        Map<String, Object> act = jdbc.queryForMap(
                "SELECT OUTCOME, STATUS_CD FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='REWORK'", id);
        assertEquals("OK", act.get("OUTCOME"));
        assertEquals("CONFIRMED", act.get("STATUS_CD"));                     // 행위 직전 상태
        boolean sawFromResult = false;
        for (JsonNode h : json(read("/board-materials/" + id + "/history", MEMBER))) {
            if ("REWORK".equals(h.path("event_cd").asText()) && !h.path("from_result_name").isNull()) {
                sawFromResult = true;                                         // 지워진 결과는 이력에 남는다
            }
        }
        assertTrue(sawFromResult);
    }

    @Test
    public void 결과_변경은_확정_뒤_담당자만_감사에_남는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        String json = "{\"result\":\"PASSED\",\"meeting_date\":\"2026-12-01\"}";
        MvcResult prep = setResult(id, MEMBER, json);                         // PREP
        assertEquals(409, prep.getResponse().getStatus());
        assertEquals("NOT_CONFIRMED", codeOf(prep));
        String[] c = cell(true);
        save(id, MEMBER, body(0, c[0], c[1], "5"), 201);
        assertEquals("NOT_CONFIRMED", codeOf(setResult(id, MEMBER, json)));   // DRAFT
        long req = submit(id, MEMBER);
        assertEquals("NOT_CONFIRMED", codeOf(setResult(id, MEMBER, json)));   // SUBMITTED
        assertEquals(200, approveAs(req, LEAD).getResponse().getStatus());
        MvcResult noDate = setResult(id, MEMBER, "{\"result\":\"SCHEDULED\"}");
        assertEquals(400, noDate.getResponse().getStatus());
        assertEquals("MEETING_DATE_REQUIRED", codeOf(noDate));
        assertEquals(400, setResult(id, MEMBER, "{\"result\":\"XX\"}").getResponse().getStatus());
        assertEquals(400, setResult(id, MEMBER, "{\"result\":\"PASSED\",\"meeting_date\":\"2026-13-45\"}").getResponse().getStatus());
        assertEquals(404, setResult(id, M4, json).getResponse().getStatus());   // 담당이 아닌 영업팀원
        assertEquals(403, setResult(id, HEAD, json).getResponse().getStatus()); // 부장은 읽기 전용
        assertEquals("DENIED", jdbc.queryForObject(
                "SELECT OUTCOME FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='RESULT' AND ACTOR_EMP_NO=?", String.class, id, HEAD));
        MvcResult noUi = sendNoUi("/board-materials/" + id + "/result", MEMBER, json);
        assertEquals(400, noUi.getResponse().getStatus());
        assertEquals("UI_ID_REQUIRED", codeOf(noUi));
        assertEquals(null, jdbc.queryForMap("SELECT RESULT_CD FROM BOARD_MATERIAL WHERE MATERIAL_ID=?", id).get("RESULT_CD"));
        assertEquals(200, setResult(id, MEMBER, json).getResponse().getStatus());
        Map<String, Object> ok = jdbc.queryForMap(
                "SELECT OUTCOME, SCREEN_ID, BUTTON_ID FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='RESULT' AND ACTOR_EMP_NO=? AND OUTCOME='OK'", id, MEMBER);
        assertEquals("OK", ok.get("OUTCOME"));
        assertEquals("board_write", ok.get("SCREEN_ID"));
        assertEquals("result_save", ok.get("BUTTON_ID"));
    }

    // ── 확정본 워드·개최일 필수·반려/재작성 쪽지(2026-11-11) ──────────

    private static final String DOCX_PATH = "/confirmed-docx";

    private MvcResult downloadDocx(long id, String emp) throws Exception {
        return actGet("/board-materials/" + id + DOCX_PATH, emp, "board_write", "confirmed_docx");
    }

    private int newNotes(String recipient, String marker) {
        return count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE RECIPIENT=? AND CONTENT LIKE ?", recipient, "%" + marker + "%");
    }

    @Test
    public void 확정본_워드는_확정_뒤_담당자_부장_확정자만_받고_ACT_DOWNLOAD가_남는다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = create(MEMBER, bc, 2026);
        String[] c = cell(true);
        save(id, MEMBER, body(0, c[0], c[1], "7777"), 201);
        long req = submit(id, MEMBER);
        assertEquals(200, approveAs(req, LEAD).getResponse().getStatus());
        MvcResult ok = downloadDocx(id, MEMBER);
        assertEquals(text(ok), 200, ok.getResponse().getStatus());
        byte[] bytes = ok.getResponse().getContentAsByteArray();
        assertTrue(bytes.length > 2 && bytes[0] == 'P' && bytes[1] == 'K');
        assertTrue(ok.getResponse().getContentType().startsWith(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
        assertTrue(ok.getResponse().getHeader("Cache-Control").contains("no-store"));
        String cd = ok.getResponse().getHeader("Content-Disposition");
        assertTrue(cd, cd.contains("filename*=UTF-8''"));
        String fname = java.net.URLDecoder.decode(cd.substring(cd.indexOf("UTF-8''") + 7), "UTF-8");
        assertTrue(fname, fname.contains("노원"));
        assertTrue(fname, fname.contains("-2026-이사회자료-확정본-v1.docx"));
        StringBuilder xml = new StringBuilder();
        try (java.util.zip.ZipInputStream zin = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(bytes))) {
            java.util.zip.ZipEntry e;
            while ((e = zin.getNextEntry()) != null) {
                if ("word/document.xml".equals(e.getName())) {
                    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = zin.read(buf)) > 0) {
                        bo.write(buf, 0, n);
                    }
                    xml.append(new String(bo.toByteArray(), StandardCharsets.UTF_8));
                }
            }
        }
        assertTrue(xml.toString().replace(",", "").contains("7777"));
        for (String emp : new String[]{MEMBER2, HEAD, LEAD}) {   // 두 번째 담당자·영업부장·확정한 팀장
            assertEquals(emp, 200, downloadDocx(id, emp).getResponse().getStatus());
        }
        for (String emp : new String[]{M4, ADMIN, DESIGNER}) {   // 그 외는 없는 번호처럼 404
            assertEquals(emp, 404, downloadDocx(id, emp).getResponse().getStatus());
        }
        assertEquals(404, actGet("/board-materials/999999" + DOCX_PATH, MEMBER, "board_write", "confirmed_docx")
                .getResponse().getStatus());
        assertEquals(401, actGet("/board-materials/" + id + DOCX_PATH, null, "board_write", "confirmed_docx")
                .getResponse().getStatus());
        assertEquals(4, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='DOWNLOAD' AND OUTCOME='OK'", id));
        assertEquals(3, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='DOWNLOAD' AND OUTCOME='HIDDEN'", id));
        Map<String, Object> act = jdbc.queryForMap(
                "SELECT SCREEN_ID, BUTTON_ID, UI_VALID, SNAP_NO FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='DOWNLOAD' AND OUTCOME='OK' AND ACTOR_EMP_NO=?",
                id, MEMBER);
        assertEquals("board_write", act.get("SCREEN_ID"));
        assertEquals("confirmed_docx", act.get("BUTTON_ID"));
        assertEquals(1, ((Number) act.get("UI_VALID")).intValue());
        assertEquals(1, ((Number) act.get("SNAP_NO")).intValue());
        List<String> details = jdbc.queryForList(
                "SELECT DETAIL FROM ACCESS_LOG WHERE EVENT_TYPE='API' AND REQ_PATH LIKE '%confirmed-docx' AND DETAIL LIKE '%code=DOWNLOAD%' ORDER BY LOG_ID DESC",
                String.class);
        assertFalse(details.isEmpty());
        assertEquals("board-material id=" + id + " code=DOWNLOAD snap=1", details.get(0));   // 값·기관명 없음
    }

    @Test
    public void 확정본_워드는_확정이_아니면_409_NOT_CONFIRMED_식별자_없으면_400() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = create(MEMBER, bc, 2026);
        MvcResult prep = downloadDocx(id, MEMBER);
        assertEquals(409, prep.getResponse().getStatus());
        assertEquals("NOT_CONFIRMED", codeOf(prep));
        String[] c = cell(true);
        save(id, MEMBER, body(0, c[0], c[1], "5"), 201);
        assertEquals("NOT_CONFIRMED", codeOf(downloadDocx(id, MEMBER)));   // DRAFT
        long req = submit(id, MEMBER);
        assertEquals("NOT_CONFIRMED", codeOf(downloadDocx(id, MEMBER)));   // SUBMITTED
        assertEquals(200, approveAs(req, LEAD).getResponse().getStatus());
        MvcResult noUi = readNoUi("/board-materials/" + id + DOCX_PATH, MEMBER);
        assertEquals(400, noUi.getResponse().getStatus());
        assertEquals("UI_ID_REQUIRED", codeOf(noUi));
        assertEquals(1, count("SELECT COUNT(*) FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='DOWNLOAD' AND OUTCOME='INVALID'", id));
        assertEquals(400, actGet("/board-materials/" + id + DOCX_PATH, MEMBER, "board_write", "x").getResponse().getStatus());
        assertEquals(200, downloadDocx(id, MEMBER).getResponse().getStatus());
        assertEquals(200, rework(id, HEAD, "재확인").getResponse().getStatus());   // DRAFT 로 돌아가면 다시 409
        assertEquals("NOT_CONFIRMED", codeOf(downloadDocx(id, MEMBER)));
    }

    @Test
    public void 결과_개최일은_가결_부결_의결예정_모두_필수() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = confirmedMaterial(bc, 2026, MEMBER, LEAD);
        String[] bad = {"{\"result\":\"PASSED\"}", "{\"result\":\"REJECTED\"}", "{\"result\":\"SCHEDULED\"}",
                "{\"result\":\"PASSED\",\"meeting_date\":\"\"}"};
        for (String b : bad) {
            MvcResult r = setResult(id, MEMBER, b);
            assertEquals(b, 400, r.getResponse().getStatus());
            assertEquals(b, "MEETING_DATE_REQUIRED", codeOf(r));
        }
        assertEquals(null, jdbc.queryForMap("SELECT RESULT_CD FROM BOARD_MATERIAL WHERE MATERIAL_ID=?", id).get("RESULT_CD"));
        assertEquals(0, logCount(id, "RESULT"));
        assertEquals(400, setResult(id, MEMBER, "{\"result\":\"PASSED\",\"meeting_date\":\"2026-13-45\"}").getResponse().getStatus());
        for (String r : new String[]{"PASSED", "REJECTED", "SCHEDULED"}) {
            MvcResult ok = setResult(id, MEMBER, "{\"result\":\"" + r + "\",\"meeting_date\":\"2026-12-02\"}");
            assertEquals(text(ok), 200, ok.getResponse().getStatus());
        }
    }

    @Test
    public void 반려하면_현재_담당자_전원에게_쪽지_신청자_중복없음_행한_사람_제외() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = draftWithSnap(MEMBER, bc, 2026);
        long req = submit(id, MEMBER);
        MvcResult rj = reject(LEAD, req, "보완 필요");
        assertEquals(text(rj), 200, rj.getResponse().getStatus());
        String marker = "이사회 자료가 반려되어";
        assertEquals(0, newNotes(MEMBER, marker));    // 신청자는 기존 결재결과(사유 포함)만
        assertEquals(1, newNotes(MEMBER, "반려되었습니다"));
        assertEquals(1, newNotes(MEMBER2, marker));
        assertEquals(0, newNotes(LEAD, marker));
        assertEquals(0, newNotes(M4, marker));
        Map<String, Object> n = jdbc.queryForMap(
                "SELECT KIND, CONTENT, LINK FROM NOTIFICATIONS WHERE RECIPIENT=? AND CONTENT LIKE ?", MEMBER2, "%" + marker + "%");
        assertEquals("결재결과", n.get("KIND"));
        assertEquals(null, n.get("LINK"));
        String content = String.valueOf(n.get("CONTENT"));
        assertFalse(content.contains("보완 필요"));      // 사유는 쪽지에 싣지 않는다
        assertTrue(content.contains("2026년"));
    }

    @Test
    public void 반려_담당이_신청자_한명뿐이면_새_쪽지_없음() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        long req = submit(id, MEMBER);
        assertEquals(200, reject(LEAD, req, "보완 필요").getResponse().getStatus());
        assertEquals(0, newNotes(MEMBER, "이사회 자료가 반려되어"));
        assertEquals(1, newNotes(MEMBER, "반려되었습니다"));
    }

    @Test
    public void 재작성_요구는_결재중이면_신청자_제외_확정이면_담당자_전원에게_쪽지() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = draftWithSnap(MEMBER, bc, 2026);
        String[] c = cell(true);
        submit(id, MEMBER);
        assertEquals(200, rework(id, HEAD, "수치 재확인").getResponse().getStatus());   // SUBMITTED
        String marker = "이사회 자료가 재작성 요구로";
        assertEquals(0, newNotes(MEMBER, marker));
        assertEquals(1, newNotes(MEMBER, "재작성을 요구했습니다"));   // 신청자는 기존 알림(사유 포함)
        assertEquals(1, newNotes(MEMBER2, marker));
        assertEquals(0, newNotes(HEAD, marker));
        save(id, MEMBER, body(1, c[0], c[1], "7"), 201);
        long req2 = submit(id, MEMBER);
        assertEquals(200, approveAs(req2, LEAD).getResponse().getStatus());
        assertEquals(200, rework(id, HEAD, "확정 뒤 재확인").getResponse().getStatus());   // CONFIRMED — 신청자 알림 없는 경로
        assertEquals(1, newNotes(MEMBER, marker));
        assertEquals(2, newNotes(MEMBER2, marker));
        assertEquals(0, newNotes(HEAD, marker));
        save(id, MEMBER, body(2, c[0], c[1], "8"), 201);
        submit(id, MEMBER);
        int before = count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE CONTENT LIKE '%이사회 자료가 %'");
        assertEquals(200, withdraw(id, MEMBER).getResponse().getStatus());   // 회수는 쪽지를 늘리지 않는다
        assertEquals(before, count("SELECT COUNT(*) FROM NOTIFICATIONS WHERE CONTENT LIKE '%이사회 자료가 %'"));
    }

    @Test
    public void 제출_검증_버전없음_확정_PREP() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long prep = create(MEMBER, bc, 2026);
        MvcResult np = act("/board-materials/" + prep + "/submit", MEMBER, "{}", "board_write", "submit");
        assertEquals(409, np.getResponse().getStatus());
        assertEquals("NO_SNAPSHOT", codeOf(np));
        long done = confirmedMaterial(bc, 2025, MEMBER, LEAD);
        MvcResult locked = act("/board-materials/" + done + "/submit", MEMBER, "{}", "board_write", "submit");
        assertEquals(409, locked.getResponse().getStatus());
        assertEquals("MATERIAL_LOCKED", codeOf(locked));
        long draft = draftWithSnap(MEMBER, bc, 2024);
        assertEquals(403, act("/board-materials/" + draft + "/submit", HEAD, "{}", "board_write", "submit").getResponse().getStatus());
        assertEquals(404, act("/board-materials/" + draft + "/submit", M4, "{}", "board_write", "submit").getResponse().getStatus());
        MvcResult noUi = sendNoUi("/board-materials/" + draft + "/submit", MEMBER, "{}");
        assertEquals(400, noUi.getResponse().getStatus());
        assertEquals("UI_ID_REQUIRED", codeOf(noUi));
        assertEquals("DRAFT", statusOf(draft));
    }

    @Test
    public void 본인_결재_금지와_팀장_관련은_부장_결재() throws Exception {
        String bc = newCase();
        assign(bc, LEAD);                                                    // 영업팀장 단독 담당
        long id = draftWithSnap(LEAD, bc, 2026);
        long req = submit(id, LEAD);
        assertEquals(HEAD, jdbc.queryForObject("SELECT APPROVER_EMP_NO FROM APPROVAL_STEP WHERE REQ_ID=?", String.class, req));
        assertEquals(403, approveAs(req, LEAD).getResponse().getStatus());   // 본인 요청 금지
        assertEquals(200, approveAs(req, HEAD).getResponse().getStatus());
        assertEquals("CONFIRMED", statusOf(id));
        String bc2 = newCase();
        assign(bc2, MEMBER, LEAD);                                           // 팀장이 담당에 끼면 부장이 결재
        long id2 = draftWithSnap(MEMBER, bc2, 2026);
        long req2 = submit(id2, MEMBER);
        assertEquals(HEAD, jdbc.queryForObject("SELECT APPROVER_EMP_NO FROM APPROVAL_STEP WHERE REQ_ID=?", String.class, req2));
        assertEquals(403, approveAs(req2, LEAD).getResponse().getStatus());
        MvcResult adminCancel = act("/approval-requests/" + req2 + "/cancel", ADMIN, "{}", "approvals_mine", "cancel_request");
        assertEquals(403, adminCancel.getResponse().getStatus());            // 관리자도 취소 불가
        MvcResult all = readNoUi("/approval-requests?box=all", ADMIN);
        assertEquals(200, all.getResponse().getStatus());
        assertFalse(text(all).contains("BOARD_SUBMIT"));                     // 관리자 전체 목록에서 제외
        MvcResult own = act("/approval-requests/" + req2 + "/cancel", MEMBER, "{}", "approvals_mine", "cancel_request");
        assertEquals(text(own), 200, own.getResponse().getStatus());
        assertEquals("DRAFT", statusOf(id2));
        assertEquals(1, logCount(id2, "WITHDRAW"));
    }

    @Test
    public void 결재선_팀장_열람은_결재중_확정에만_부장은_모든_상태_그_밖은_404() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        assertEquals(404, review(id, LEAD).getResponse().getStatus());       // DRAFT
        MvcResult headDraft = review(id, HEAD);                              // 부장은 모든 상태
        assertEquals(200, headDraft.getResponse().getStatus());
        assertFalse(json(headDraft).path("viewer").path("can_rework").asBoolean());
        long req1 = submit(id, MEMBER);
        assertEquals(200, review(id, LEAD).getResponse().getStatus());       // SUBMITTED, 현재 요청의 결재자
        assertTrue(json(review(id, HEAD)).path("viewer").path("can_rework").asBoolean());
        assertEquals(200, withdraw(id, MEMBER).getResponse().getStatus());
        assertEquals(404, review(id, LEAD).getResponse().getStatus());       // 회수로 DRAFT
        long req2 = submit(id, MEMBER);
        assertTrue(req2 != req1);
        jdbc.update("UPDATE APPROVAL_STEP SET APPROVER_EMP_NO=? WHERE REQ_ID=?", HEAD, req2);   // 이번 회차 결재자는 부장(LEAD 는 지난 회차 결재자)
        flushCache();
        assertEquals(404, review(id, LEAD).getResponse().getStatus());       // 과거 회차 결재자는 못 본다
        assertEquals(200, approveAs(req2, HEAD).getResponse().getStatus());
        assertEquals("CONFIRMED", statusOf(id));
        assertEquals(404, review(id, LEAD).getResponse().getStatus());       // 확정한 사람이 아니면 못 본다
        MvcResult headDone = review(id, HEAD);
        assertEquals(200, headDone.getResponse().getStatus());
        assertTrue(json(headDone).path("viewer").path("can_rework").asBoolean());
        assertEquals(404, review(id, DESIGNER).getResponse().getStatus());
        assertEquals(404, review(id, ADMIN).getResponse().getStatus());
        assertEquals(401, review(id, null).getResponse().getStatus());
    }

    @Test
    public void 확정_건_acts는_열람자별로_보이고_값은_없다() throws Exception {
        String bc = newCase();
        assign(bc, MEMBER);
        long id = confirmedMaterial(bc, 2026, MEMBER, LEAD);
        for (String emp : new String[]{MEMBER, HEAD, LEAD}) {
            MvcResult r = actGet("/board-materials/" + id + "/acts", emp, "board_review", "acts_open");
            assertEquals(emp, 200, r.getResponse().getStatus());
            assertFalse(emp, text(r).contains("snapshot"));
            assertFalse(emp, text(r).contains("reason"));
        }
        assertEquals(404, actGet("/board-materials/" + id + "/acts", M4, "board_review", "acts_open").getResponse().getStatus());
        for (String col : jdbc.queryForList("SELECT * FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=?", id).get(0).keySet()) {
            String u = col.toUpperCase();
            assertFalse(col, u.contains("VALUE") || u.contains("REASON") || u.contains("NOTE") || u.contains("BODY"));
        }
    }

    @Test
    public void 결재_유형_목록에_이사회_자료_제출이_있다() throws Exception {
        MvcResult r = readNoUi("/approval-requests/types", MEMBER);
        assertEquals(200, r.getResponse().getStatus());
        boolean found = false;
        for (JsonNode t : json(r).path("types")) {
            if ("BOARD_SUBMIT".equals(t.path("key").asText())) {
                found = true;
                assertTrue(t.path("submittable").asBoolean());
            }
        }
        assertTrue(found);
    }

    // ── 020b 보안 검토 반영(S1·S2·S4·S5②) ───────────────────────────

    @Test
    public void 반려_의견의_개인정보는_422_제어문자는_400_표시_때_옛_개인정보_사유는_가린다() throws Exception {   // security S2
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        long req = submit(id, MEMBER);
        assertEquals(422, reject(LEAD, req, "010-0000-0000").getResponse().getStatus());
        assertEquals(400, reject(LEAD, req, "x\\u0007y").getResponse().getStatus());
        MvcResult okPii = act("/approval-requests/" + req + "/decide", LEAD,
                "{\"decision\":\"APPROVE\",\"comment\":\"010-0000-0000\"}", "approvals_inbox", "approve");
        assertEquals(422, okPii.getResponse().getStatus());
        assertEquals("PENDING", reqStatus(req));
        assertEquals("SUBMITTED", statusOf(id));
        assertEquals(200, reject(LEAD, req, "수치 재확인").getResponse().getStatus());
        jdbc.update("UPDATE APPROVAL_STEP SET COMMENT_TEXT=? WHERE REQ_ID=? AND STATUS='REJECTED'", "010-0000-0000", req);   // 옛 데이터 가정
        flushCache();
        JsonNode lr = detailJson(id, MEMBER).path("last_return");
        assertEquals("REJECT", lr.path("event_cd").asText());
        assertTrue(lr.path("reason").isNull());
    }

    @Test
    public void 승인_순간의_감사_행은_같은_트랜잭션에_행위_직전_상태_화면_버튼과_함께_남는다_헤더가_없으면_UNKNOWN() throws Exception {   // security S1·S9
        String bc = newCase();
        assign(bc, MEMBER);
        long id = draftWithSnap(MEMBER, bc, 2026);
        long req = submit(id, MEMBER);
        MvcResult r = sendNoUi("/approval-requests/" + req + "/decide", LEAD, "{\"decision\":\"APPROVE\"}");
        assertEquals(text(r), 200, r.getResponse().getStatus());
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT OUTCOME, STATUS_CD, SCREEN_ID, BUTTON_ID, UI_VALID, ACTOR_EMP_NO FROM BOARD_MATERIAL_ACT WHERE MATERIAL_ID=? AND ACTION_CD='CONFIRM'", id);
        assertEquals("OK", row.get("OUTCOME"));
        assertEquals("SUBMITTED", row.get("STATUS_CD"));
        assertEquals("UNKNOWN", row.get("SCREEN_ID"));
        assertEquals("UNKNOWN", row.get("BUTTON_ID"));
        assertEquals(0, ((Number) row.get("UI_VALID")).intValue());
        assertEquals(LEAD, row.get("ACTOR_EMP_NO"));
    }

    @Test
    public void 담당에서_빠진_신청자의_결재_취소는_막힌다() throws Exception {   // security S5②
        String bc = newCase();
        assign(bc, MEMBER, MEMBER2);
        long id = draftWithSnap(MEMBER, bc, 2026);
        long req = submit(id, MEMBER);
        long change = requestChange(LEAD, bc, new String[]{M3}, new String[]{MEMBER});
        assertEquals(200, decide(HEAD, change).getResponse().getStatus());   // MEMBER 는 더 이상 담당이 아니다
        MvcResult c = act("/approval-requests/" + req + "/cancel", MEMBER, "{}", "approvals_mine", "cancel_request");
        int st = c.getResponse().getStatus();
        assertTrue(text(c), st == 403 || st == 404);
        assertEquals("PENDING", reqStatus(req));
        assertEquals("SUBMITTED", statusOf(id));
    }
}
