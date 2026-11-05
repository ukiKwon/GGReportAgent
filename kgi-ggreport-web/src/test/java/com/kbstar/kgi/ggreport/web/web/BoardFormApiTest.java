package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.AccessLogEntry;
import com.kbstar.kgi.ggreport.web.domain.BoardForm;
import com.kbstar.kgi.ggreport.web.domain.BoardFormVer;
import com.kbstar.kgi.ggreport.web.mapper.BoardFormMapper;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.PermissionService;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 양식 커스텀 API. 시드: 김영업 3918264(영업팀, tasks 조회·수정 없음), 윤서준 3361829(영업팀),
 * 이영업 5047192(영업팀장), 마스터 8203417(전산팀·관리자), 권전산 4482971(전산팀), 백수아 1473958(영업부장, tasks 꺼짐),
 * 최디자이너 7130526(디자이너, teamOf = "디자이너").
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BoardFormApiTest {

    private static final String MEMBER = "3918264";
    private static final String MEMBER2 = "3361829";
    private static final String LEAD = "5047192";
    private static final String ADMIN = "8203417";
    private static final String IT = "4482971";
    private static final String HEAD = "1473958";
    private static final String DESIGNER = "7130526";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String DEFAULT_A_TITLE = "재산상 이익제공 및 기부금(안)";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private PermissionService permissions;
    @Autowired
    private AccessLogService accessLog;
    @Autowired
    private BoardFormMapper forms;

    // ── 도우미 ──

    private JsonNode call(String emp, MockHttpServletRequestBuilder b, Object body, int expect) throws Exception {
        MockHttpServletRequestBuilder r = b;
        if (emp != null) {
            r = r.header(Actor.HEADER, emp);
        }
        if (body != null) {
            r = r.contentType(MediaType.APPLICATION_JSON).content(body.toString());
        }
        String text = mockMvc.perform(r).andExpect(status().is(expect)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return text.isEmpty() ? null : JSON.readTree(text);
    }

    private void grant(String emp) throws Exception {
        call(ADMIN, put("/sysadmin/perms/" + emp),
                "{\"changes\":[{\"menu\":\"tasks\",\"view\":true,\"write\":false,\"edit\":true,\"approve\":false}]}", 200);
    }

    private long copy(String emp, String name) throws Exception {
        ObjectNode b = JSON.createObjectNode();
        b.put("source", "default_doc");
        b.put("name", name);
        return call(emp, post("/board-forms/copy"), b, 200).get("form_id").asLong();
    }

    private static ObjectNode tbl(String ref) {
        ObjectNode n = JSON.createObjectNode();
        n.put("ref", ref);
        return n;
    }

    private static ObjectNode tbl(String ref, String title) {
        ObjectNode n = tbl(ref);
        n.put("title", title);
        return n;
    }

    private static ObjectNode cell(ObjectNode t, String key, String text) {
        JsonNode c = t.get("cells");
        ObjectNode cells = c == null ? t.putObject("cells") : (ObjectNode) c;
        cells.put(key, text);
        return t;
    }

    private static ObjectNode body(Integer base, String name, ObjectNode... tables) {
        ObjectNode b = JSON.createObjectNode();
        if (base != null) {
            b.put("base_version", base.intValue());
        }
        if (name != null) {
            b.put("name", name);
        }
        ArrayNode a = b.putArray("tables");
        for (ObjectNode t : tables) {
            a.add(t);
        }
        return b;
    }

    private static ObjectNode all(int base, String name) {
        return body(base, name, tbl("A"), tbl("B"), tbl("C-2"), tbl("C-3"), tbl("C-4"), tbl("C-5"));
    }

    private static JsonNode table(JsonNode doc, String id) {
        for (JsonNode t : doc.get("tables")) {
            if (id.equals(t.get("id").asText())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + id);
    }

    private static String rep(String s, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append(s);
        }
        return b.toString();
    }

    private JsonNode saved(String emp, long id, ObjectNode b, int expect) throws Exception {
        return call(emp, put("/board-forms/" + id), b, expect);
    }

    // ── 권한 ──

    @Test
    public void 조회는_tasks_조회_권한_부장_미등록_익명은_막힌다() throws Exception {
        JsonNode l = call(MEMBER, get("/board-forms"), null, 200);
        assertEquals("default_doc", l.get("base").get("id").asText());
        assertEquals(0, l.get("items").size());
        assertFalse(l.get("can_edit").asBoolean());
        assertEquals("영업", l.get("team_key").asText());
        call(null, get("/board-forms"), null, 401);
        call(HEAD, get("/board-forms"), null, 403);
        call("9999999", get("/board-forms"), null, 403);
        call(HEAD, get("/board-forms/catalog"), null, 403);
    }

    @Test
    public void 수정_권한_없는_팀원은_모든_쓰기가_403이고_문구가_고정이다() throws Exception {
        long id = copy(ADMIN, "전산 양식");
        String msg = "양식을 편집할 권한이 없습니다.";
        JsonNode r = call(MEMBER, post("/board-forms/copy"), "{\"name\":\"x\"}", 403);
        assertEquals(msg, r.get("detail").asText());
        assertEquals(msg, call(MEMBER, put("/board-forms/" + id), all(1, null), 403).get("detail").asText());
        call(MEMBER, post("/board-forms/" + id + "/archive"), null, 403);
        call(MEMBER, post("/board-forms/" + id + "/restore"), null, 403);
        call(null, post("/board-forms/copy"), "{\"name\":\"x\"}", 401);
        call(HEAD, post("/board-forms/copy"), "{\"name\":\"x\"}", 403);
    }

    @Test
    public void canEdit은_수정_예외_행이_켜진_활성_사용자와_관리자만() throws Exception {
        assertFalse(permissions.canEdit(MEMBER, "tasks"));
        assertFalse(permissions.canEdit(null, "tasks"));
        assertFalse(permissions.canEdit("9999999", "tasks"));
        assertTrue(permissions.canEdit(ADMIN, "tasks"));
        grant(MEMBER);
        assertTrue(permissions.canEdit(MEMBER, "tasks"));
        assertFalse(permissions.canEdit(MEMBER, "knowledge"));       // 다른 메뉴는 아니다
        call(ADMIN, put("/sysadmin/users/" + MEMBER + "/status"), "{\"status\":\"LOCKED\"}", 200);
        assertFalse(permissions.canEdit(MEMBER, "tasks"));            // 잠긴 사용자는 아니다
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"x\"}", 403);
    }

    @Test
    public void 거부는_접근_이력에_DENIED로_남고_본문은_없다() throws Exception {
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"비밀스러운이름\"}", 403);
        boolean found = false;
        for (AccessLogEntry e : accessLog.search(null, null, MEMBER, "DENIED", 0, 50).getItems()) {
            if ("/board-forms/copy".equals(e.getReqPath()) && Integer.valueOf(403).equals(e.getStatusCode())) {
                found = true;
                assertFalse(String.valueOf(e.getDetail()).contains("비밀스러운이름"));
            }
        }
        assertTrue("DENIED 이력이 없다", found);
    }

    // ── 복제·원본 ──

    @Test
    public void 권한이_있으면_복제되어_v1이_되고_기본_양식은_수정할_수_없다() throws Exception {
        grant(MEMBER);
        ObjectNode b = JSON.createObjectNode();
        b.put("source", "default_doc");
        b.put("name", "  우리 팀 양식  ");
        JsonNode d = call(MEMBER, post("/board-forms/copy"), b, 200);
        assertEquals("우리 팀 양식", d.get("name").asText());
        assertEquals(1, d.get("version").asInt());
        assertEquals(1, d.get("current_version").asInt());
        assertEquals("ACTIVE", d.get("status").asText());
        assertEquals("영업", d.get("team_key").asText());
        assertEquals("default_doc", d.get("base_doc").asText());
        assertTrue(d.get("editable").asBoolean());
        assertEquals(6, d.get("tables").size());
        assertEquals(DEFAULT_A_TITLE, table(d, "A").get("title").asText());
        JsonNode inst = table(d, "A").get("rows").get(1).get(0);
        assertEquals("r1_c0", inst.get("key").asText());
        assertEquals("r1", inst.get("row_id").asText());
        assertEquals("c0", inst.get("col_id").asText());
        assertTrue(inst.get("mapped").asBoolean());
        assertFalse(inst.get("input").asBoolean());
        assertTrue(inst.get("editable").asBoolean());                      // 잠김 폐지: 연결 칸도 편집 가능(구조 편집 계약)
        assertEquals("대한민국 기관", inst.get("text").asText());
        assertTrue(table(d, "A").get("rows").get(0).get(0).get("editable").asBoolean());
        // 원본은 DB 행이 아니라 PUT·GET 대상이 아니다
        call(MEMBER, put("/board-forms/default_doc"), all(1, null), 404);
        call(MEMBER, get("/board-forms/default_doc"), null, 404);
        // 목록에 나타난다
        assertEquals(1, call(MEMBER, get("/board-forms"), null, 200).get("items").size());
    }

    @Test
    public void 관리자는_권한_부여_없이_복제할_수_있고_전산_팀_소유가_된다() throws Exception {
        long id = copy(ADMIN, "전산 양식");
        assertEquals("전산", call(ADMIN, get("/board-forms/" + id), null, 200).get("team_key").asText());
    }

    @Test
    public void 복제_이름과_원본_검증() throws Exception {
        grant(MEMBER);
        call(MEMBER, post("/board-forms/copy"), "{}", 400);
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"   \"}", 400);
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"" + rep("가", 61) + "\"}", 400);
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"a\\u0007b\"}", 400);
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"x\",\"source\":\"other_doc\"}", 404);
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"x\",\"source_form_id\":999999}", 404);
        assertEquals(60, call(MEMBER, post("/board-forms/copy"),
                "{\"name\":\"" + rep("가", 60) + "\"}", 200).get("name").asText().length());
    }

    @Test
    public void 같은_팀_활성_이름은_중복_금지_다른_팀과_보관된_이름은_허용() throws Exception {
        grant(MEMBER);
        grant(IT);
        long first = copy(MEMBER, "공통 이름");
        JsonNode dup = call(MEMBER, post("/board-forms/copy"), "{\"name\":\"공통 이름\"}", 400);
        assertEquals("이미 같은 이름의 양식이 있습니다.", dup.get("detail").asText());
        copy(IT, "공통 이름");                                                   // 전산 팀은 별개
        call(MEMBER, post("/board-forms/" + first + "/archive"), null, 200);
        copy(MEMBER, "공통 이름");                                               // 보관본은 이름을 점유하지 않는다
        long other = copy(MEMBER, "다른 이름");
        call(MEMBER, put("/board-forms/" + other), all(1, "공통 이름"), 400);     // 이름 바꾸다 중복
    }

    @Test
    public void 기존_양식을_원본으로_복제하면_편집_내용을_이어받는다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "원본");
        saved(MEMBER, id, body(1, null, cell(tbl("A", "고친 제목"), "r0_c0", "고친 머리글")), 200);
        ObjectNode b = JSON.createObjectNode();
        b.put("source_form_id", id);
        b.put("name", "사본");
        JsonNode d = call(MEMBER, post("/board-forms/copy"), b, 200);
        assertEquals(1, d.get("version").asInt());
        assertEquals(1, d.get("tables").size());
        assertEquals("고친 제목", table(d, "A").get("title").asText());
        assertEquals("고친 머리글", table(d, "A").get("rows").get(0).get(0).get("text").asText());
    }

    // ── 저장·버전 ──

    @Test
    public void 저장하면_새_버전이_생기고_이전_버전은_그대로_읽힌다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        ObjectNode b = all(1, "양식 v2");
        b.set("tables", JSON.createArrayNode()
                .add(cell(cell(tbl("A", "새 제목"), "r0_c0", "기관"), "r4_c1", "총계"))
                .add(tbl("B")).add(tbl("C-2")).add(tbl("C-3")).add(tbl("C-4")).add(tbl("C-5")));
        JsonNode r = saved(MEMBER, id, b, 200);
        assertEquals(2, r.get("version").asInt());
        assertEquals(2, r.get("current_version").asInt());
        assertTrue(r.get("changed").asBoolean());
        assertEquals("양식 v2", r.get("name").asText());
        assertEquals("새 제목", table(r, "A").get("title").asText());
        assertEquals("총계", table(r, "A").get("rows").get(4).get(0).get("text").asText());
        assertEquals("대한민국 기관", table(r, "A").get("rows").get(1).get(0).get("text").asText());

        JsonNode v1 = call(MEMBER, get("/board-forms/" + id).param("version", "1"), null, 200);
        assertEquals("양식", v1.get("name").asText());
        assertEquals(DEFAULT_A_TITLE, table(v1, "A").get("title").asText());
        assertEquals("합계", table(v1, "A").get("rows").get(4).get(0).get("text").asText());
        assertFalse(v1.get("editable").asBoolean());                              // 옛 버전은 편집 대상이 아니다
        assertEquals(2, call(MEMBER, get("/board-forms/" + id), null, 200).get("version").asInt());

        JsonNode vs = call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200);
        assertEquals(2, vs.get("items").size());
        assertEquals(2, vs.get("items").get(0).get("version").asInt());           // 최신순
        assertTrue(vs.get("items").get(0).get("is_current").asBoolean());
        assertEquals(MEMBER, vs.get("items").get(0).get("created_by").asText());
        assertFalse(vs.get("items").get(0).has("spec_json"));
    }

    @Test
    public void base_version_누락은_400_낡은_버전은_409() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        call(MEMBER, put("/board-forms/" + id), "{\"tables\":[{\"ref\":\"A\"}]}", 400);
        saved(MEMBER, id, body(1, null, cell(tbl("A", "t1"), "r0_c0", "x")), 200);
        JsonNode r = saved(MEMBER, id, body(1, null, tbl("A")), 409);              // 다른 사람이 먼저 저장
        assertTrue(r.get("detail").asText().startsWith("다른 사람이 먼저 저장했습니다"));
        saved(MEMBER, id, body(7, null, tbl("A")), 409);
        assertEquals(2, call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200).get("items").size());
    }

    @Test
    public void 표_추가_삭제_순서_변경() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        JsonNode v2 = saved(MEMBER, id, body(1, null, tbl("A"), tbl("C-4")), 200);          // B·C-2·C-3 삭제
        assertEquals(2, v2.get("tables").size());
        JsonNode v3 = saved(MEMBER, id, body(2, null, tbl("A"), tbl("C-4"), tbl("B")), 200); // B 를 맨 아래에 추가
        assertEquals("B", v3.get("tables").get(2).get("id").asText());
        JsonNode v4 = saved(MEMBER, id, body(3, null, tbl("C-4"), tbl("A")), 200);           // 순서 변경
        assertEquals("C-4", v4.get("tables").get(0).get("id").asText());
        assertEquals("A", v4.get("tables").get(1).get("id").asText());
        assertEquals(2, v4.get("tables").size());
    }

    @Test
    public void 같은_표_중복_알_수_없는_표_빈_목록은_400() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        assertEquals("같은 표를 두 번 넣을 수 없습니다.",
                saved(MEMBER, id, body(1, null, tbl("A"), tbl("A")), 400).get("detail").asText());
        saved(MEMBER, id, body(1, null, tbl("ZZ")), 400);
        saved(MEMBER, id, body(1, null), 400);
        call(MEMBER, put("/board-forms/" + id), "{\"base_version\":1}", 400);
        assertEquals(1, call(MEMBER, get("/board-forms/" + id), null, 200).get("version").asInt());
    }

    @Test
    public void 매핑_칸과_없는_칸_키_전송은_400이고_구조_키는_무시된다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r1_c0", "해킹")), 400);
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r99_c9", "x")), 400);
        // 낡은 화면이 보내는 옛 모양 key 는 조용히 엉뚱한 칸에 적용되지 않고 400 (문구는 고정, 입력을 되돌려 싣지 않는다)
        JsonNode oldKey = saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0c0", "낡은화면")), 400);
        assertEquals("수정할 수 없는 칸이 포함되어 있습니다.", oldKey.get("detail").asText());
        ObjectNode t = tbl("A", "제목만 바꿈");
        t.put("columns", 99);
        t.put("mapping", "Z");
        JsonNode r = saved(MEMBER, id, body(1, null, t), 200);
        assertEquals(4, table(r, "A").get("columns").asInt());                      // columns·mapping 은 읽지 않는다
        assertEquals("A", table(r, "A").get("mapping").asText());
        assertEquals(5, table(r, "A").get("rows").size());
        // rows 만(cols 없이) 보내는 것은 구조 계약 위반
        ObjectNode half = tbl("A");
        half.putArray("rows");
        assertEquals(com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec.BAD_STRUCT, saved(MEMBER, id, body(2, null, half), 400).get("detail").asText());
    }

    @Test
    public void 주석은_수정_불가_같은_값_에코는_허용() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        ObjectNode bad = tbl("C-4");
        bad.putArray("notes").add("바꾼 주석");
        assertEquals("표 주석은 수정할 수 없습니다.", saved(MEMBER, id, body(1, null, bad), 400).get("detail").asText());
        JsonNode cur = call(MEMBER, get("/board-forms/" + id), null, 200);
        ObjectNode echo = tbl("C-4");
        ArrayNode notes = echo.putArray("notes");
        for (JsonNode n : table(cur, "C-4").get("notes")) {
            notes.add(n.asText());
        }
        JsonNode r = saved(MEMBER, id, body(1, null, echo), 200);
        assertEquals(2, table(r, "C-4").get("notes").size());
    }

    @Test
    public void 길이_제어문자_검증() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        saved(MEMBER, id, body(1, null, tbl("A", rep("가", 101))), 400);
        saved(MEMBER, id, body(1, null, tbl("A", "   ")), 400);
        saved(MEMBER, id, body(1, null, tbl("A", "a\nb")), 400);
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0_c0", rep("나", 101))), 400);
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0_c0", "a\tb")), 400);
        saved(MEMBER, id, body(1, rep("다", 61), tbl("A")), 400);
        saved(MEMBER, id, body(1, "a\u0007b", tbl("A")), 400);
        JsonNode ok = saved(MEMBER, id, body(1, null, tbl("A", rep("가", 100)), cell(tbl("B"), "r0_c0", rep("나", 100))), 200);
        assertEquals(2, ok.get("version").asInt());
    }

    @Test
    public void 보내지_않은_칸은_카탈로그_기본값으로_돌아간다_전체_교체() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0_c0", "변경")), 200);
        JsonNode v3 = saved(MEMBER, id, body(2, null, tbl("A")), 200);
        assertEquals("기관명", table(v3, "A").get("rows").get(0).get(0).get("text").asText());
        assertEquals(3, v3.get("version").asInt());
    }

    @Test
    public void 바뀐_것이_없으면_새_버전을_만들지_않는다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        JsonNode r = saved(MEMBER, id, all(1, null), 200);
        assertFalse(r.get("changed").asBoolean());
        assertEquals(1, r.get("version").asInt());
        assertEquals(1, call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200).get("items").size());
    }

    // ── 팀 공유·범위 ──

    @Test
    public void 같은_팀은_함께_보고_고치고_다른_팀은_존재를_모른다() throws Exception {
        grant(MEMBER);
        grant(LEAD);
        grant(IT);
        long id = copy(MEMBER, "영업 양식");
        assertEquals(1, call(MEMBER2, get("/board-forms"), null, 200).get("items").size());   // 같은 팀 팀원(권한 없어도 열람)
        call(MEMBER2, get("/board-forms/" + id), null, 200);
        JsonNode byLead = saved(LEAD, id, body(1, null, cell(tbl("A"), "r0_c0", "팀장 수정")), 200);   // 같은 팀 다른 사람
        assertEquals(LEAD, byLead.get("updated_by").asText());
        assertEquals(0, call(IT, get("/board-forms"), null, 200).get("items").size());
        JsonNode hidden = call(IT, get("/board-forms/" + id), null, 404);
        JsonNode missing = call(IT, get("/board-forms/987654"), null, 404);
        assertEquals(missing.get("detail").asText(), hidden.get("detail").asText());       // 존재 숨김
        call(IT, put("/board-forms/" + id), body(2, null, tbl("A")), 404);
        call(IT, post("/board-forms/" + id + "/archive"), null, 404);
        call(IT, get("/board-forms/" + id + "/versions"), null, 404);
        call(IT, get("/board-forms/" + id + "/docx"), null, 404);
        ObjectNode b = JSON.createObjectNode();
        b.put("source_form_id", id);
        b.put("name", "훔친 복제");
        call(IT, post("/board-forms/copy"), b, 404);
        call(ADMIN, get("/board-forms/" + id), null, 404);            // 관리자도 자기 팀(전산)만
    }

    @Test
    public void 디자이너는_영업팀_소속으로_영업_양식을_함께_본다() throws Exception {
        assertEquals("영업", Teams.teamOf("영업부장"));
        assertEquals("영업", Teams.teamOf("영업팀장"));
        assertEquals("디자이너", Teams.teamOf("디자이너"));                           // 순수 teamOf 는 그대로
        assertEquals("전산", Teams.teamOf("전산팀"));
        grant(MEMBER);
        long id = copy(MEMBER, "영업 양식");
        // 양식 공유 범위는 소속 팀(ApproverRules.team): 디자이너는 영업팀 소속이다
        call(DESIGNER, get("/board-forms/" + id), null, 200);
        assertEquals("영업", call(DESIGNER, get("/board-forms"), null, 200).get("team_key").asText());
        assertEquals(1, call(DESIGNER, get("/board-forms"), null, 200).get("items").size());
    }

    // ── 보관·복원 ──

    @Test
    public void 보관하면_기본_목록에서_빠지고_수정은_막히며_복원하면_돌아온다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        JsonNode a = call(MEMBER, post("/board-forms/" + id + "/archive"), null, 200);
        assertEquals("ARCHIVED", a.get("status").asText());
        assertEquals(0, call(MEMBER, get("/board-forms"), null, 200).get("items").size());
        assertEquals(1, call(MEMBER, get("/board-forms").param("status", "archived"), null, 200).get("items").size());
        assertEquals(1, call(MEMBER, get("/board-forms").param("status", "all"), null, 200).get("items").size());
        call(MEMBER, get("/board-forms").param("status", "zzz"), null, 400);
        saved(MEMBER, id, body(1, null, tbl("A")), 400);
        assertFalse(call(MEMBER, get("/board-forms/" + id), null, 200).get("editable").asBoolean());
        call(MEMBER, post("/board-forms/" + id + "/archive"), null, 200);          // 멱등
        assertEquals("ACTIVE", call(MEMBER, post("/board-forms/" + id + "/restore"), null, 200).get("status").asText());
        assertEquals(1, call(MEMBER, get("/board-forms"), null, 200).get("items").size());
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0_c0", "복원 후 수정")), 200);
    }

    @Test
    public void 같은_이름이_이미_활성이면_복원이_400() throws Exception {
        grant(MEMBER);
        long first = copy(MEMBER, "같은 이름");
        call(MEMBER, post("/board-forms/" + first + "/archive"), null, 200);
        copy(MEMBER, "같은 이름");
        JsonNode r = call(MEMBER, post("/board-forms/" + first + "/restore"), null, 400);
        assertTrue(r.get("detail").asText().contains("복원할 수 없습니다"));
    }

    // ── 카탈로그·조회 옵션·docx ──

    @Test
    public void 카탈로그는_표_6개와_버전을_돌려준다() throws Exception {
        JsonNode c = call(MEMBER, get("/board-forms/catalog"), null, 200);
        assertEquals(2, c.get("catalog_ver").asInt());
        assertEquals(6, c.get("items").size());
        assertEquals("A", c.get("items").get(0).get("ref").asText());
        assertEquals("C-4", c.get("items").get(4).get("ref").asText());
        assertEquals(2, c.get("items").get(4).get("notes").size());
        assertEquals(4, c.get("items").get(0).get("columns").asInt());
        assertEquals("C-5", c.get("items").get(5).get("ref").asText());
        assertEquals(9, c.get("items").get(5).get("columns").asInt());
        assertEquals(26, c.get("items").get(5).get("row_count").asInt());
        assertEquals("(단위: 억원)", c.get("items").get(5).get("unit").asText());
        assertEquals(7, c.get("items").get(3).get("columns").asInt());          // C-3: 사업초기 열 추가
        call(null, get("/board-forms/catalog"), null, 401);
    }

    @Test
    public void 조회_옵션_values_version_id_검증() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        JsonNode blank = call(MEMBER, get("/board-forms/" + id).param("values", "blank"), null, 200);
        assertEquals("", table(blank, "A").get("rows").get(1).get(0).get("text").asText());       // 매핑 칸 비움
        assertEquals("출연금", table(blank, "A").get("rows").get(1).get(1).get("text").asText());
        call(MEMBER, get("/board-forms/" + id).param("values", "xx"), null, 400);
        call(MEMBER, get("/board-forms/" + id).param("version", "abc"), null, 400);
        call(MEMBER, get("/board-forms/" + id).param("version", "0"), null, 400);
        call(MEMBER, get("/board-forms/" + id).param("version", "99"), null, 404);
        call(MEMBER, get("/board-forms/abc"), null, 404);
        assertEquals(id, call(MEMBER, get("/board-forms/" + id), null, 200).get("form_id").asLong());
    }

    @Test
    public void docx는_편집한_이름과_표를_담고_버전을_고를_수_있다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "원래 이름");
        saved(MEMBER, id, body(2 - 1, "바뀐 이름", tbl("A", "바뀐 표 제목"), tbl("C-4")), 200);
        MvcResult cur = mockMvc.perform(get("/board-forms/" + id + "/docx").header(Actor.HEADER, MEMBER))
                .andExpect(status().isOk()).andReturn();
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                cur.getResponse().getContentType());
        String cd = cur.getResponse().getHeader("Content-Disposition");
        assertTrue(cd, cd.contains("filename*=UTF-8''") && cd.contains("%EB"));
        assertTrue(cd, cd.endsWith("_%EC%83%98%ED%94%8C.docx"));   // _샘플.docx
        XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(cur.getResponse().getContentAsByteArray()));
        try {
            assertEquals("바뀐 이름", d.getParagraphs().get(0).getText());
            assertEquals("샘플 — 표의 수치는 가상 예시입니다.", d.getParagraphs().get(1).getText());   // 보기 모드(sample) 안내
            assertEquals("바뀐 표 제목", d.getParagraphs().get(2).getText());
            assertEquals("(단위: 억원)", d.getParagraphs().get(3).getText());
            assertEquals(2, d.getTables().size());
        } finally {
            d.close();
        }
        MvcResult old = mockMvc.perform(get("/board-forms/" + id + "/docx").param("version", "1")
                .header(Actor.HEADER, MEMBER)).andExpect(status().isOk()).andReturn();
        XWPFDocument d1 = new XWPFDocument(new ByteArrayInputStream(old.getResponse().getContentAsByteArray()));
        try {
            assertEquals("원래 이름", d1.getParagraphs().get(0).getText());
            assertEquals(6, d1.getTables().size());
        } finally {
            d1.close();
        }
        MvcResult blank = mockMvc.perform(get("/board-forms/" + id + "/docx").param("values", "blank")
                .header(Actor.HEADER, MEMBER)).andExpect(status().isOk()).andReturn();
        XWPFDocument db = new XWPFDocument(new ByteArrayInputStream(blank.getResponse().getContentAsByteArray()));
        try {
            assertEquals("바뀐 표 제목", db.getParagraphs().get(1).getText());   // 빈 양식에는 샘플 안내 문구가 없다
        } finally {
            db.close();
        }
        mockMvc.perform(get("/board-forms/" + id + "/docx")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/board-forms/" + id + "/docx").header(Actor.HEADER, HEAD)).andExpect(status().isForbidden());
    }

    @Test
    public void board_docs_기본_양식_칸에도_주소표가_붙는다() throws Exception {
        JsonNode d = call(MEMBER, get("/board-docs/default_doc"), null, 200);
        assertEquals(6, d.get("tables").size());
        // 2026-11-05 사용자 확정: 기본 양식에서도 바로 작성 → 칸 주소표(key)가 있어야 작성 모드가 값 칸을 그린다(NEXT 45 P1)
        assertEquals("r0_c0", d.get("tables").get(0).get("rows").get(0).get(0).get("key").asText());
        assertEquals("r0", d.get("tables").get(0).get("rows").get(0).get(0).get("row_id").asText());
        assertEquals("c0", d.get("tables").get(0).get("rows").get(0).get(0).get("col_id").asText());
        assertEquals("r1_c2", d.get("tables").get(0).get("rows").get(1).get(2).get("key").asText());   // 출연금 값 칸
        assertEquals("[\"c0\",\"c1\",\"c2\",\"c3\"]", d.get("tables").get(0).get("col_ids").toString());
        assertFalse(d.get("tables").get(0).has("next_r"));                       // 카운터는 응답에 싣지 않는다
        assertNotEquals(0, call(MEMBER, get("/board-docs"), null, 200).get("items").size());
    }

    // ── 칸 이름표(행id·열id) · 응답 모양 ──

    private static java.util.List<String> texts(JsonNode arr) {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (JsonNode n : arr) {
            out.add(n.asText());
        }
        return out;
    }

    @Test
    public void 응답_칸에_key_row_id_col_id_input_mapped_editable_표에_row_ids_col_ids() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        JsonNode d = call(MEMBER, get("/board-forms/" + id), null, 200);
        JsonNode a = table(d, "A");
        assertEquals(java.util.Arrays.asList("r0", "r1", "r2", "r3", "r4"), texts(a.get("row_ids")));
        assertEquals(java.util.Arrays.asList("c0", "c1", "c2", "c3"), texts(a.get("col_ids")));
        JsonNode lab = a.get("rows").get(2).get(0);                              // 예비비 라벨: 0열이 세로 병합에 덮여 1열
        assertEquals("r2_c1", lab.get("key").asText());
        assertEquals("r2", lab.get("row_id").asText());
        assertEquals("c1", lab.get("col_id").asText());
        assertFalse(lab.get("mapped").asBoolean());
        assertFalse(lab.get("input").asBoolean());
        assertTrue(lab.get("editable").asBoolean());
        for (JsonNode t : d.get("tables")) {
            java.util.Set<String> seen = new java.util.HashSet<>();
            for (JsonNode row : t.get("rows")) {
                for (JsonNode c : row) {
                    String key = c.get("key").asText();
                    assertTrue(key, key.matches("^r(0|[1-9][0-9]{0,3})_c(0|[1-9][0-9]{0,3})$"));
                    assertEquals(c.get("row_id").asText() + "_" + c.get("col_id").asText(), key);
                    assertTrue("중복 " + key, seen.add(key));
                    assertTrue(c.get("editable").asBoolean());                                   // 잠김 폐지: 모든 칸 true
                    assertFalse(c.get("input").asBoolean());
                }
            }
        }
        assertFalse(d.get("catalog_outdated").asBoolean());
        assertEquals(2, d.get("catalog_ver").asInt());                          // 지금 복제하면 현재 카탈로그(2)로 기록된다
        // DB 에는 새 포맷(fmt 2)으로 저장된다
        BoardFormVer v1 = forms.selectVersion(id, 1);
        assertTrue(v1.getSpecJson(), v1.getSpecJson().startsWith("{\"fmt\":2,\"catalog_ver\":2,\"tables\":["));
        assertEquals(2, v1.getCatalogVer());
    }

    // ── 요청 fmt ──

    @Test
    public void fmt는_생략_1_2만_허용하고_그_밖은_400이다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        for (Integer ok : new Integer[]{1, 2}) {
            ObjectNode b = all(1, null);
            b.put("fmt", ok.intValue());
            assertFalse(saved(MEMBER, id, b, 200).get("changed").asBoolean());
        }
        ObjectNode none = all(1, null);
        assertFalse(saved(MEMBER, id, none, 200).get("changed").asBoolean());
        for (Object bad : new Object[]{0, 3, -1, 99, "2", "x", 1.5, 2.0, true}) {
            ObjectNode b = all(1, null);
            if (bad instanceof Integer) {
                b.put("fmt", ((Integer) bad).intValue());
            } else if (bad instanceof Double) {
                b.put("fmt", ((Double) bad).doubleValue());
            } else if (bad instanceof Boolean) {
                b.put("fmt", ((Boolean) bad).booleanValue());
            } else {
                b.put("fmt", (String) bad);
            }
            JsonNode r = saved(MEMBER, id, b, 400);
            assertEquals("지원하지 않는 양식 저장 형식입니다.", r.get("detail").asText());     // 입력을 되돌려 싣지 않는다
        }
        assertEquals(1, call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200).get("items").size());
    }

    // ── 옛 포맷 복원 ──

    private void putVersion(long id, int ver, int catalogVer, String json) {
        BoardForm f = forms.selectForm(id);
        BoardFormVer v = new BoardFormVer();
        v.setFormId(id);
        v.setVerNo(ver);
        v.setName(f.getName());
        v.setCatalogVer(catalogVer);
        v.setSpecJson(json);
        v.setCreatedBy(MEMBER);
        v.setCreatedAt(Times.nowIso());
        forms.insertVersion(v);
        assertEquals(1, forms.updateHeader(id, f.getCurrentVer(), ver, f.getName(), MEMBER, Times.nowIso()));
    }

    private static final String LEGACY = "{\"catalog_ver\":1,\"tables\":["
            + "{\"ref\":\"A\",\"title\":\"옛 제목\",\"cells\":{\"r0c0\":\"옛 기관\",\"r4c0\":\"옛 합계\",\"r4c2\":\"옛 비고\"}},"
            + "{\"ref\":\"B\",\"cells\":{\"r0c1\":\"옛 총기대\"}},{\"ref\":\"C-2\"},{\"ref\":\"C-3\"},{\"ref\":\"C-4\"}]}";

    @Test
    public void 옛_포맷_버전은_새_key로_복원되고_같은_내용_재저장은_changed_false() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        putVersion(id, 2, 1, LEGACY);
        JsonNode cur = call(MEMBER, get("/board-forms/" + id), null, 200);
        assertEquals(2, cur.get("version").asInt());
        JsonNode a = table(cur, "A");
        assertEquals("옛 제목", a.get("title").asText());
        assertEquals("옛 기관", a.get("rows").get(0).get(0).get("text").asText());
        assertEquals("r0_c0", a.get("rows").get(0).get(0).get("key").asText());
        assertEquals("옛 합계", a.get("rows").get(4).get(0).get("text").asText());       // 옛 r4c0 → r4_c1
        assertEquals("r4_c1", a.get("rows").get(4).get(0).get("key").asText());
        assertEquals("옛 비고", a.get("rows").get(4).get(2).get("text").asText());       // 옛 r4c2 → r4_c3
        assertEquals("r4_c3", a.get("rows").get(4).get(2).get("key").asText());
        assertEquals("옛 총기대", table(cur, "B").get("rows").get(0).get(1).get("text").asText());
        assertEquals("r0_c2", table(cur, "B").get("rows").get(0).get(1).get("key").asText());
        // 눈에 보이는 표 구조(열 수·행별 칸 수·병합·연결 여부·key)는 새 포맷 v1 과 같다
        JsonNode v1 = call(MEMBER, get("/board-forms/" + id).param("version", "1"), null, 200);
        assertEquals(v1.get("tables").size(), cur.get("tables").size());
        for (int t = 0; t < v1.get("tables").size(); t++) {
            JsonNode x = v1.get("tables").get(t);
            JsonNode y = cur.get("tables").get(t);
            assertEquals(x.get("columns").asInt(), y.get("columns").asInt());
            assertEquals(x.get("row_ids"), y.get("row_ids"));
            assertEquals(x.get("col_ids"), y.get("col_ids"));
            for (int r = 0; r < x.get("rows").size(); r++) {
                assertEquals(x.get("rows").get(r).size(), y.get("rows").get(r).size());
                for (int i = 0; i < x.get("rows").get(r).size(); i++) {
                    JsonNode p = x.get("rows").get(r).get(i);
                    JsonNode q = y.get("rows").get(r).get(i);
                    for (String f : new String[]{"key", "colspan", "rowspan", "header", "mapped", "input", "align", "editable"}) {
                        assertEquals(f, p.get(f), q.get(f));
                    }
                }
            }
        }
        // 이행 결과: C-5 가 맨 뒤에 덧붙고 C-3 에 사업초기 열이 들어갔다. 옛 버전이라 catalog_outdated 안내가 켜진다.
        assertEquals("C-5", cur.get("tables").get(5).get("id").asText());
        assertEquals(7, table(cur, "C-3").get("columns").asInt());
        assertTrue(cur.get("catalog_outdated").asBoolean());
        assertEquals(1, cur.get("catalog_ver").asInt());
        // 같은 내용으로 저장해도 옛 카탈로그(1)로 기록된 버전은 현재 카탈로그(2)로 이행한 새 버전(3)이 된다
        JsonNode r = saved(MEMBER, id, legacySame(2), 200);
        assertTrue(r.get("changed").asBoolean());
        assertEquals(3, r.get("version").asInt());
        assertEquals(2, forms.selectVersion(id, 3).getCatalogVer());
        assertFalse(r.get("catalog_outdated").asBoolean());
        assertEquals("옛 합계", table(r, "A").get("rows").get(4).get(0).get("text").asText());     // 문구 보존
        // 이행된 버전과 같은 내용으로 다시 저장하면 새 버전이 생기지 않는다
        JsonNode again = saved(MEMBER, id, legacySame(3), 200);
        assertFalse(again.get("changed").asBoolean());
        assertEquals(3, again.get("version").asInt());
        assertEquals(3, call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200).get("items").size());
        // 하나라도 다르면 새 버전(4)이 새 포맷으로 저장된다
        ObjectNode diff = body(3, null,
                cell(cell(cell(tbl("A", "옛 제목"), "r0_c0", "옛 기관"), "r4_c1", "바뀐 합계"), "r4_c3", "옛 비고"),
                cell(tbl("B"), "r0_c2", "옛 총기대"), tbl("C-2"), tbl("C-3"), tbl("C-4"), tbl("C-5"));
        JsonNode r4 = saved(MEMBER, id, diff, 200);
        assertTrue(r4.get("changed").asBoolean());
        assertEquals(4, r4.get("version").asInt());
        assertTrue(forms.selectVersion(id, 4).getSpecJson().startsWith("{\"fmt\":2,"));
        assertTrue(forms.selectVersion(id, 2).getSpecJson().startsWith("{\"catalog_ver\":1,"));   // 옛 버전은 불변
    }

    private static ObjectNode legacySame(int base) {
        return body(base, null,
                cell(cell(cell(tbl("A", "옛 제목"), "r0_c0", "옛 기관"), "r4_c1", "옛 합계"), "r4_c3", "옛 비고"),
                cell(tbl("B"), "r0_c2", "옛 총기대"), tbl("C-2"), tbl("C-3"), tbl("C-4"), tbl("C-5"));
    }

    @Test
    public void 번역표가_없는_옛_버전은_닫힌_실패이고_저장으로_복구할_수_있다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        putVersion(id, 2, 3, "{\"catalog_ver\":3,\"tables\":[{\"ref\":\"A\"}]}");
        JsonNode r = call(MEMBER, get("/board-forms/" + id), null, 500);                   // 기본 구조로 조용히 되돌려 보여 주지 않는다
        assertTrue(r.has("detail"));                                                        // 문구는 개발축 설정에 따라 다르다(상세 on/off)
        call(MEMBER, get("/board-forms/" + id + "/docx"), null, 500);
        assertEquals("양식", call(MEMBER, get("/board-forms/" + id).param("version", "1"), null, 200).get("name").asText());
        JsonNode healed = saved(MEMBER, id, all(2, null), 200);                              // 읽을 수 없는 현재 버전 위에 새 버전
        assertTrue(healed.get("changed").asBoolean());
        assertEquals(3, healed.get("version").asInt());
        call(MEMBER, get("/board-forms/" + id), null, 200);
    }

    // ── 정상 입력이 거부되지 않는다(이스케이프가 많은 최대 길이) ──

    @Test
    public void 칸마다_100자_따옴표_섞인_최대_입력도_저장된다() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        JsonNode cur = call(MEMBER, get("/board-forms/" + id), null, 200);
        String worst = rep("\"가", 50);                                                    // 100자, JSON 에서 따옴표마다 이스케이프
        ObjectNode b = JSON.createObjectNode();
        b.put("base_version", 1);
        ArrayNode tables = b.putArray("tables");
        int cells = 0;
        for (JsonNode t : cur.get("tables")) {
            ObjectNode tn = tbl(t.get("ref").asText());
            for (JsonNode row : t.get("rows")) {
                for (JsonNode c : row) {
                    if (!c.get("mapped").asBoolean()) {                    // 연결 칸 key 는 cells 맵으로 보낼 수 없다(400)
                        cell(tn, c.get("key").asText(), worst);
                        cells++;
                    }
                }
            }
            tables.add(tn);
        }
        assertTrue("편집 가능한 칸이 충분히 많아야 한다: " + cells, cells > 50);
        JsonNode r = saved(MEMBER, id, b, 200);
        assertEquals(2, r.get("version").asInt());
        assertEquals(worst, table(r, "A").get("rows").get(0).get(0).get("text").asText());
        assertTrue(forms.selectVersion(id, 2).getSpecJson().length() > 20000);
    }

    // ── 서식 문자(Cf) · 개인정보 ──

    @Test
    public void 서식_문자는_칸_제목_이름에서_400_고정_문구() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        for (String ch : new String[]{"‮", "​", "‍", "﻿"}) {
            JsonNode c = saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0_c0", "a" + ch + "b")), 400);
            assertEquals("칸 문구에 쓸 수 없는 문자가 있습니다.", c.get("detail").asText());
            JsonNode t = saved(MEMBER, id, body(1, null, tbl("A", "제" + ch + "목")), 400);
            assertEquals("표 제목에 쓸 수 없는 문자가 있습니다.", t.get("detail").asText());
            JsonNode n = saved(MEMBER, id, body(1, "이" + ch + "름", tbl("A")), 400);
            assertEquals("양식 이름에 쓸 수 없는 문자가 있습니다.", n.get("detail").asText());
            ObjectNode cp = JSON.createObjectNode();
            cp.put("name", "복" + ch + "제");
            assertEquals("양식 이름에 쓸 수 없는 문자가 있습니다.",
                    call(MEMBER, post("/board-forms/copy"), cp, 400).get("detail").asText());
        }
        assertEquals(1, call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200).get("items").size());
    }

    @Test
    public void 양식_저장과_복제는_개인정보로_보이는_값이면_422_고정_문구() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        String msg = "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 문구를 지우고 다시 저장해 주세요.";
        String[] bad = {"010-1234-5678", "900101-1234567", "kim.team@example.com"};
        for (String pii : bad) {
            for (JsonNode r : new JsonNode[]{
                    saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0_c0", "담당 " + pii)), 422),
                    saved(MEMBER, id, body(1, null, tbl("A", "제목 " + pii)), 422),
                    saved(MEMBER, id, body(1, pii, tbl("A")), 422)}) {
                assertEquals(msg, r.get("detail").asText());
                assertFalse(r.toString().contains(pii));                               // 검출값을 되돌려 싣지 않는다
            }
            ObjectNode cp = JSON.createObjectNode();
            cp.put("name", "양식 " + pii);
            assertEquals(msg, call(MEMBER, post("/board-forms/copy"), cp, 422).get("detail").asText());
        }
        assertEquals(1, call(MEMBER, get("/board-forms/" + id + "/versions"), null, 200).get("items").size());
        // 평범한 숫자·금액 문구는 통과한다
        saved(MEMBER, id, body(1, null, cell(tbl("A", "2026년 4분기 (단위: 억원)"), "r0_c0", "1,234.5")), 200);
    }

    // ── 본문 크기 한도(필터) ──

    private JsonNode rawBody(String method, String rawPath, String body, int expect) throws Exception {
        MockHttpServletRequestBuilder b = "PUT".equals(method) ? put(new java.net.URI(rawPath)) : post(new java.net.URI(rawPath));
        if (body != null) {
            b = b.contentType(MediaType.APPLICATION_JSON).content(body.getBytes(StandardCharsets.UTF_8));
        }
        String text = mockMvc.perform(b).andExpect(status().is(expect)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return text.isEmpty() ? null : JSON.readTree(text);
    }

    @Test
    public void 저장은_512KB_복제는_16KB_넘으면_권한_판정_전에_413() throws Exception {
        String big = "{\"base_version\":1,\"pad\":\"" + rep("a", 600 * 1024) + "\"}";
        JsonNode r = call(null, put("/board-forms/1"), big, 413);
        assertEquals("BODY_TOO_LARGE", r.get("detail").get("code").asText());
        assertEquals(512, r.get("detail").get("max_kb").asInt());
        assertTrue(r.get("detail").get("message").asText().contains("512KB"));
        String edge = "{\"base_version\":1,\"pad\":\"" + rep("a", 512 * 1024) + "\"}";      // 한도를 살짝 넘는다(여는 부분 포함)
        call(null, put("/board-forms/1"), edge, 413);
        for (String p : new String[]{"/board-forms/1/", "/board-forms/1;a=b", "/board-forms//1", "/board-forms/%31"}) {
            assertEquals(p, "BODY_TOO_LARGE", rawBody("PUT", p, big, 413).get("detail").get("code").asText());
        }
        String mid = "{\"base_version\":1,\"pad\":\"" + rep("a", 100 * 1024) + "\"}";       // 한도 안이면 필터를 지나 권한(403)에서 막힌다
        call(MEMBER, put("/board-forms/1"), mid, 403);

        String copyBig = "{\"name\":\"x\",\"pad\":\"" + rep("a", 20 * 1024) + "\"}";
        JsonNode c = call(null, post("/board-forms/copy"), copyBig, 413);
        assertEquals("BODY_TOO_LARGE", c.get("detail").get("code").asText());
        assertEquals(16, c.get("detail").get("max_kb").asInt());
        assertEquals("BODY_TOO_LARGE", rawBody("POST", "/board-forms/copy/", copyBig, 413).get("detail").get("code").asText());
        call(MEMBER, post("/board-forms/copy"), "{\"name\":\"x\",\"pad\":\"" + rep("a", 10 * 1024) + "\"}", 403);   // 16KB 안
    }

    @Test
    public void 본문_길이가_없으면_저장과_복제도_411() throws Exception {
        JsonNode p = rawBody("PUT", "/board-forms/1", null, 411);
        assertEquals("LENGTH_REQUIRED", p.get("detail").get("code").asText());
        JsonNode c = rawBody("POST", "/board-forms/copy", null, 411);
        assertEquals("LENGTH_REQUIRED", c.get("detail").get("code").asText());
    }
}
