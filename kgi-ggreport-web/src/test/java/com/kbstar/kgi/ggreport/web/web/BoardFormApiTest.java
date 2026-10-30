package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.AccessLogEntry;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.service.PermissionService;
import com.kbstar.kgi.ggreport.web.support.Teams;
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
        return body(base, name, tbl("A"), tbl("B"), tbl("C-2"), tbl("C-3"), tbl("C-4"));
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
        assertEquals(5, d.get("tables").size());
        assertEquals(DEFAULT_A_TITLE, table(d, "A").get("title").asText());
        JsonNode inst = table(d, "A").get("rows").get(1).get(0);
        assertEquals("r1c0", inst.get("key").asText());
        assertTrue(inst.get("mapped").asBoolean());
        assertFalse(inst.get("editable").asBoolean());
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
        saved(MEMBER, id, body(1, null, cell(tbl("A", "고친 제목"), "r0c0", "고친 머리글")), 200);
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
                .add(cell(cell(tbl("A", "새 제목"), "r0c0", "기관"), "r4c0", "총계"))
                .add(tbl("B")).add(tbl("C-2")).add(tbl("C-3")).add(tbl("C-4")));
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
        saved(MEMBER, id, body(1, null, cell(tbl("A", "t1"), "r0c0", "x")), 200);
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
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r1c0", "해킹")), 400);
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r99c9", "x")), 400);
        ObjectNode t = tbl("A", "제목만 바꿈");
        t.put("columns", 99);
        t.put("mapping", "Z");
        t.putArray("rows");
        JsonNode r = saved(MEMBER, id, body(1, null, t), 200);
        assertEquals(4, table(r, "A").get("columns").asInt());                      // 구조는 서버 카탈로그
        assertEquals("A", table(r, "A").get("mapping").asText());
        assertEquals(5, table(r, "A").get("rows").size());
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
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0c0", rep("나", 101))), 400);
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0c0", "a\tb")), 400);
        saved(MEMBER, id, body(1, rep("다", 61), tbl("A")), 400);
        saved(MEMBER, id, body(1, "a\u0007b", tbl("A")), 400);
        JsonNode ok = saved(MEMBER, id, body(1, null, tbl("A", rep("가", 100)), cell(tbl("B"), "r0c0", rep("나", 100))), 200);
        assertEquals(2, ok.get("version").asInt());
    }

    @Test
    public void 보내지_않은_칸은_카탈로그_기본값으로_돌아간다_전체_교체() throws Exception {
        grant(MEMBER);
        long id = copy(MEMBER, "양식");
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0c0", "변경")), 200);
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
        JsonNode byLead = saved(LEAD, id, body(1, null, cell(tbl("A"), "r0c0", "팀장 수정")), 200);   // 같은 팀 다른 사람
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
        saved(MEMBER, id, body(1, null, cell(tbl("A"), "r0c0", "복원 후 수정")), 200);
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
    public void 카탈로그는_표_5개와_버전을_돌려준다() throws Exception {
        JsonNode c = call(MEMBER, get("/board-forms/catalog"), null, 200);
        assertEquals(1, c.get("catalog_ver").asInt());
        assertEquals(5, c.get("items").size());
        assertEquals("A", c.get("items").get(0).get("ref").asText());
        assertEquals("C-4", c.get("items").get(4).get("ref").asText());
        assertEquals(2, c.get("items").get(4).get("notes").size());
        assertEquals(4, c.get("items").get(0).get("columns").asInt());
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
        XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(cur.getResponse().getContentAsByteArray()));
        try {
            assertEquals("바뀐 이름", d.getParagraphs().get(0).getText());
            assertEquals("바뀐 표 제목", d.getParagraphs().get(1).getText());
            assertEquals(2, d.getTables().size());
        } finally {
            d.close();
        }
        MvcResult old = mockMvc.perform(get("/board-forms/" + id + "/docx").param("version", "1")
                .header(Actor.HEADER, MEMBER)).andExpect(status().isOk()).andReturn();
        XWPFDocument d1 = new XWPFDocument(new ByteArrayInputStream(old.getResponse().getContentAsByteArray()));
        try {
            assertEquals("원래 이름", d1.getParagraphs().get(0).getText());
            assertEquals(5, d1.getTables().size());
        } finally {
            d1.close();
        }
        mockMvc.perform(get("/board-forms/" + id + "/docx").param("values", "blank").header(Actor.HEADER, MEMBER))
                .andExpect(status().isOk());
        mockMvc.perform(get("/board-forms/" + id + "/docx")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/board-forms/" + id + "/docx").header(Actor.HEADER, HEAD)).andExpect(status().isForbidden());
    }

    @Test
    public void 기존_board_docs는_영향이_없다() throws Exception {
        JsonNode d = call(MEMBER, get("/board-docs/default_doc"), null, 200);
        assertEquals(5, d.get("tables").size());
        assertNull(d.get("tables").get(0).get("rows").get(0).get(0).get("key"));      // 옛 응답에 새 키가 섞이지 않는다
        assertNotEquals(0, call(MEMBER, get("/board-docs"), null, 200).get("items").size());
    }
}
