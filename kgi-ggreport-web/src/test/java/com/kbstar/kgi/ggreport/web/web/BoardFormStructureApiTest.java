package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.domain.AccessLogEntry;
import com.kbstar.kgi.ggreport.web.domain.BoardForm;
import com.kbstar.kgi.ggreport.web.domain.BoardFormVer;
import com.kbstar.kgi.ggreport.web.mapper.BoardFormMapper;
import com.kbstar.kgi.ggreport.web.service.AccessLogService;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 양식 구조 저장(PUT /board-forms/{id} 의 cols·rows) — 행·열 삽입/삭제, 구분 열 쪼개기, 연결 칸 사라짐 확인, 위조 id, 상한, 권한.
 * 시드·사번은 {@link BoardFormApiTest} 와 같다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BoardFormStructureApiTest {

    private static final String MEMBER = "3918264";
    private static final String LEAD = "5047192";
    private static final String ADMIN = "8203417";
    private static final String IT = "4482971";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BAD_STRUCT = BoardDocSpec.BAD_STRUCT;

    @Autowired
    private MockMvc mockMvc;
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

    private long newForm() throws Exception {
        grant(MEMBER);
        return copy(MEMBER, "양식");
    }

    private static ObjectNode tbl(String ref) {
        ObjectNode n = JSON.createObjectNode();
        n.put("ref", ref);
        return n;
    }

    private static JsonNode table(JsonNode doc, String id) {
        for (JsonNode t : doc.get("tables")) {
            if (id.equals(t.get("id").asText())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + id);
    }

    /** 응답의 표를 구조(cols·rows)를 담은 요청 표로 되돌린다. */
    private static ObjectNode structOf(JsonNode t) {
        ObjectNode n = tbl(t.get("ref").asText());
        ArrayNode cols = n.putArray("cols");
        for (JsonNode c : t.get("col_ids")) {
            cols.addObject().put("id", c.asText());
        }
        ArrayNode rows = n.putArray("rows");
        for (int r = 0; r < t.get("rows").size(); r++) {
            ObjectNode row = rows.addObject();
            row.put("id", t.get("row_ids").get(r).asText());
            ArrayNode cells = row.putArray("cells");
            for (JsonNode c : t.get("rows").get(r)) {
                ObjectNode cn = cells.addObject();
                cn.put("col", c.get("col_id").asText());
                cn.put("text", c.get("text").asText());
                cn.put("colspan", c.get("colspan").asInt());
                cn.put("rowspan", c.get("rowspan").asInt());
                cn.put("header", c.get("header").asBoolean());
                cn.put("input", c.get("input").asBoolean());
                cn.put("align", c.get("align").asText());
            }
        }
        return n;
    }

    private static ObjectNode newCell(String col, String text, boolean input) {
        ObjectNode c = JSON.createObjectNode();
        c.put("col", col);
        c.put("text", text);
        c.put("colspan", 1);
        c.put("rowspan", 1);
        c.put("header", false);
        c.put("input", input);
        c.put("align", "left");
        return c;
    }

    private static ObjectNode body(int base, ObjectNode a) {
        ObjectNode b = JSON.createObjectNode();
        b.put("base_version", base);
        ArrayNode ts = b.putArray("tables");
        ts.add(a);
        for (String ref : new String[]{"B", "C-2", "C-3", "C-4", "C-5"}) {
            ts.add(tbl(ref));
        }
        return b;
    }

    /** 표 하나만 구조를 보내고 나머지는 구조 없이(ref 만) 보내는 본문 — 표 ref 가 A 가 아닐 때도 쓴다. */
    private static ObjectNode bodyOf(int base, ObjectNode... changed) {
        ObjectNode b = JSON.createObjectNode();
        b.put("base_version", base);
        ArrayNode ts = b.putArray("tables");
        for (String ref : new String[]{"A", "B", "C-2", "C-3", "C-4", "C-5"}) {
            ObjectNode pick = null;
            for (ObjectNode c : changed) {
                if (ref.equals(c.get("ref").asText())) {
                    pick = c;
                }
            }
            ts.add(pick != null ? pick : tbl(ref));
        }
        return b;
    }

    private JsonNode detail(long id) throws Exception {
        return call(MEMBER, get("/board-forms/" + id), null, 200);
    }

    private static ArrayNode rowsOf(ObjectNode t) {
        return (ArrayNode) t.get("rows");
    }

    private static void setCellInt(ObjectNode t, int row, int cell, String field, int v) {
        ((ObjectNode) t.get("rows").get(row).get("cells").get(cell)).put(field, v);
    }

    /** A 표의 3번 자리(0-기준)에 새 행(라벨 + 직접 입력 값 칸)을 끼운다. */
    private static ObjectNode withNewRow(JsonNode a) {
        ObjectNode t = structOf(a);
        setCellInt(t, 1, 0, "rowspan", 5);
        setCellInt(t, 1, 3, "rowspan", 4);
        ObjectNode row = JSON.createObjectNode();
        row.putNull("id");
        row.putArray("cells").add(newCell("c1", "추가 항목", false)).add(newCell("c2", "", true));
        rowsOf(t).insert(3, row);
        return t;
    }

    private static List<String> texts(JsonNode arr) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : arr) {
            out.add(n.asText());
        }
        return out;
    }

    // ── 행 ──

    @Test
    public void 행_삽입은_r100_키_r100_c2_버전_2_삭제_후_재추가는_r101() throws Exception {
        long id = newForm();
        JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(1, withNewRow(table(detail(id), "A"))), 200);
        assertEquals(2, r.get("version").asInt());
        assertTrue(r.get("changed").asBoolean());
        assertEquals(0, r.get("dropped_mapped").asInt());
        JsonNode a = table(r, "A");
        assertEquals(Arrays.asList("r0", "r1", "r2", "r100", "r3", "r4"), texts(a.get("row_ids")));
        JsonNode input = a.get("rows").get(3).get(1);
        assertEquals("r100_c2", input.get("key").asText());
        assertTrue(input.get("input").asBoolean());
        assertFalse(input.get("mapped").asBoolean());
        assertTrue(input.get("editable").asBoolean());
        assertEquals("r100_c1", a.get("rows").get(3).get(0).get("key").asText());
        assertEquals(5, a.get("rows").get(1).get(0).get("rowspan").asInt());
        assertFalse(a.has("next_r"));                                              // 카운터는 응답에 싣지 않는다
        // 현재 버전으로 다시 읽어도 같다
        assertEquals(texts(a.get("row_ids")), texts(table(detail(id), "A").get("row_ids")));

        // 삭제: 행을 빼고 병합을 되돌린다 → 버전 3
        ObjectNode del = structOf(a);
        rowsOf(del).remove(3);
        setCellInt(del, 1, 0, "rowspan", 4);
        setCellInt(del, 1, 3, "rowspan", 3);
        JsonNode r3 = call(MEMBER, put("/board-forms/" + id), bodyOf(2, del), 200);
        assertEquals(3, r3.get("version").asInt());
        assertEquals(Arrays.asList("r0", "r1", "r2", "r3", "r4"), texts(table(r3, "A").get("row_ids")));
        // 지운 id 를 다시 쓰는 시도는 거부(고정 문구)
        ObjectNode reuse = withNewRow(table(r3, "A"));
        ((ObjectNode) rowsOf(reuse).get(3)).put("id", "r100");
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(3, reuse), 400).get("detail").asText());
        // 새 행은 r101
        JsonNode r4 = call(MEMBER, put("/board-forms/" + id), bodyOf(3, withNewRow(table(r3, "A"))), 200);
        assertEquals(4, r4.get("version").asInt());
        assertEquals(Arrays.asList("r0", "r1", "r2", "r101", "r3", "r4"), texts(table(r4, "A").get("row_ids")));
        // 옛 버전은 그대로 읽힌다
        assertEquals(Arrays.asList("r0", "r1", "r2", "r100", "r3", "r4"),
                texts(table(call(MEMBER, get("/board-forms/" + id).param("version", "2"), null, 200), "A").get("row_ids")));
    }

    @Test
    public void 같은_구조를_다시_보내면_changed_false_하나_고치면_새_버전() throws Exception {
        long id = newForm();
        JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(1, withNewRow(table(detail(id), "A"))), 200);
        JsonNode same = call(MEMBER, put("/board-forms/" + id), bodyOf(2, structOf(table(r, "A"))), 200);
        assertFalse(same.get("changed").asBoolean());
        assertEquals(2, same.get("version").asInt());
        assertEquals(0, same.get("dropped_mapped").asInt());
        ObjectNode tweak = structOf(table(r, "A"));
        ((ObjectNode) tweak.get("rows").get(3).get("cells").get(0)).put("text", "고친 라벨");
        JsonNode changed = call(MEMBER, put("/board-forms/" + id), bodyOf(2, tweak), 200);
        assertTrue(changed.get("changed").asBoolean());
        assertEquals(3, changed.get("version").asInt());
        assertEquals("고친 라벨", table(changed, "A").get("rows").get(3).get(0).get("text").asText());
    }

    // ── 열 ──

    @Test
    public void 열_삽입은_임시_n1이_c100이_되고_기존_연결은_밀리지_않는다() throws Exception {
        long id = newForm();
        ObjectNode t = structOf(table(detail(id), "C-4"));
        ((ArrayNode) t.get("cols")).insert(1, JSON.createObjectNode().put("id", "n1"));
        for (JsonNode row : t.get("rows")) {
            ((ArrayNode) row.get("cells")).insert(1, newCell("n1", "", false));
        }
        JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(1, t), 200);
        JsonNode c4 = table(r, "C-4");
        assertEquals(Arrays.asList("c0", "c100", "c1", "c2"), texts(c4.get("col_ids")));
        assertEquals(4, c4.get("columns").asInt());
        assertEquals("r1_c100", c4.get("rows").get(1).get(1).get("key").asText());
        assertEquals("r1_c1", c4.get("rows").get(1).get(2).get("key").asText());
        assertTrue(c4.get("rows").get(1).get(2).get("mapped").asBoolean());
        assertFalse(c4.get("rows").get(1).get(1).get("mapped").asBoolean());
        // 임시 id 중복 → 400
        ObjectNode dup = structOf(table(detail(id), "C-4"));
        ((ArrayNode) dup.get("cols")).insert(0, JSON.createObjectNode().put("id", "n1"));
        ((ArrayNode) dup.get("cols")).insert(1, JSON.createObjectNode().put("id", "n1"));
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(2, dup), 400).get("detail").asText());
    }

    // ── 구분 열 쪼개기 ──

    private static ObjectNode splitA(JsonNode a) {
        ObjectNode t = structOf(a);
        ((ArrayNode) t.get("cols")).insert(2, JSON.createObjectNode().put("id", "n1"));
        for (int r = 0; r < t.get("rows").size(); r++) {
            ArrayNode cells = (ArrayNode) t.get("rows").get(r).get("cells");
            for (int i = 0; i < cells.size(); i++) {
                if ("c1".equals(cells.get(i).get("col").asText())) {
                    if (r == 0) {
                        ((ObjectNode) cells.get(i)).put("colspan", 2);
                    } else {
                        cells.insert(i + 1, newCell("n1", "세부", false));
                    }
                    break;
                }
            }
        }
        return t;
    }

    @Test
    public void 구분_열_쪼개기는_200_docx에_gridSpan_vMerge_실패는_400_고정_문구() throws Exception {
        long id = newForm();
        JsonNode a = table(detail(id), "A");
        // 실패들(고정 문구): 칸 부족 · 겹침 · 칸의 열 위조 · 기본 열 순서 뒤바뀜 — 새 버전이 생기지 않는다
        ObjectNode missing = splitA(a);
        ((ArrayNode) missing.get("rows").get(2).get("cells")).remove(1);
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(1, missing), 400).get("detail").asText());
        ObjectNode wide = structOf(a);
        setCellInt(wide, 0, 1, "colspan", 3);
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(1, wide), 400).get("detail").asText());
        ObjectNode lie = structOf(a);
        ((ObjectNode) lie.get("rows").get(3).get("cells").get(0)).put("col", "c2");
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(1, lie), 400).get("detail").asText());
        ObjectNode swapped = structOf(a);
        ArrayNode swapCols = (ArrayNode) swapped.get("cols");
        JsonNode first = swapCols.get(0);
        swapCols.set(0, swapCols.get(1));
        swapCols.set(1, first);
        JsonNode rej = call(MEMBER, put("/board-forms/" + id), bodyOf(1, swapped), 400);
        assertTrue(rej.get("detail").asText(), rej.get("detail").asText().contains("순서"));
        assertEquals(1, detail(id).get("version").asInt());

        JsonNode ok = call(MEMBER, put("/board-forms/" + id), bodyOf(1, splitA(a)), 200);
        JsonNode sa = table(ok, "A");
        assertEquals(Arrays.asList("c0", "c1", "c100", "c2", "c3"), texts(sa.get("col_ids")));
        assertEquals(2, sa.get("rows").get(0).get(1).get("colspan").asInt());
        assertEquals("r0_c1", sa.get("rows").get(0).get(1).get("key").asText());
        assertEquals("r1_c100", sa.get("rows").get(1).get(2).get("key").asText());
        assertTrue(sa.get("rows").get(1).get(3).get("mapped").asBoolean());          // 출연금 값 칸 연결 유지

        MvcResult m = mockMvc.perform(get("/board-forms/" + id + "/docx").header(Actor.HEADER, MEMBER))
                .andExpect(status().isOk()).andReturn();
        XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(m.getResponse().getContentAsByteArray()));
        try {
            XWPFTable t = d.getTables().get(0);
            assertEquals(2, t.getRow(0).getCell(1).getCTTc().getTcPr().getGridSpan().getVal().intValue());
            assertEquals(org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge.RESTART,
                    t.getRow(1).getCell(0).getCTTc().getTcPr().getVMerge().getVal());
        } finally {
            d.close();
        }

        assertEquals(2, detail(id).get("version").asInt());
    }

    // ── 연결 칸 사라짐 ──

    @Test
    public void 연결_칸이_사라지는_저장은_확인_없이는_400_true면_200과_dropped_mapped_접근_이력은_숫자만() throws Exception {
        long id = newForm();
        ObjectNode del = structOf(table(detail(id), "A"));                       // r2(예비비) 행 삭제 — r2_c2 는 연결 칸
        rowsOf(del).remove(2);
        setCellInt(del, 1, 0, "rowspan", 3);
        setCellInt(del, 1, 3, "rowspan", 2);
        JsonNode need = call(MEMBER, put("/board-forms/" + id), bodyOf(1, del), 400);
        JsonNode d = need.get("detail");
        assertEquals("UNMAP_CONFIRM_REQUIRED", d.get("code").asText());
        assertEquals(1, d.get("count").asInt());
        assertEquals("A", d.get("dropped").get(0).get("ref").asText());
        assertEquals("r2_c2", d.get("dropped").get(0).get("key").asText());
        assertTrue(d.get("message").asText().length() > 0);
        assertEquals(1, detail(id).get("version").asInt());                      // 저장되지 않았다
        // false · 문자열 "true" · 1 도 확인으로 치지 않는다
        for (Object bad : new Object[]{Boolean.FALSE, "true", 1}) {
            ObjectNode b = bodyOf(1, del);
            if (bad instanceof Boolean) {
                b.put("confirm_unmapped", (Boolean) bad);
            } else if (bad instanceof Integer) {
                b.put("confirm_unmapped", (Integer) bad);
            } else {
                b.put("confirm_unmapped", (String) bad);
            }
            assertEquals("UNMAP_CONFIRM_REQUIRED",
                    call(MEMBER, put("/board-forms/" + id), b, 400).get("detail").get("code").asText());
        }
        ObjectNode confirmed = bodyOf(1, del);
        confirmed.put("confirm_unmapped", true);
        JsonNode ok = call(MEMBER, put("/board-forms/" + id), confirmed, 200);
        assertEquals(1, ok.get("dropped_mapped").asInt());
        assertEquals(2, ok.get("version").asInt());
        assertEquals(Arrays.asList("r0", "r1", "r3", "r4"), texts(table(ok, "A").get("row_ids")));

        // 접근 이력: 숫자 요약만(본문·문구 없음)
        boolean found = false;
        for (AccessLogEntry e : accessLog.search(null, null, MEMBER, "API", 0, 50).getItems()) {
            String detail = String.valueOf(e.getDetail());
            if (detail.startsWith("board-form-save")) {
                assertTrue("숫자 요약만 남아야 한다: " + detail, detail.matches("board-form-save rows\\+\\d+/-\\d+ cols\\+\\d+/-\\d+ unmapped=\\d+"));
                found = found || "board-form-save rows+0/-1 cols+0/-0 unmapped=1".equals(detail);   // 같은 DB 를 쓰는 다른 테스트의 기록이 섞여 있을 수 있다
            }
        }
        assertTrue("구조 변경 저장의 접근 이력이 없다", found);
    }

    @Test
    public void 병합으로_가려진_연결_칸도_사라진_것으로_센다() throws Exception {
        long id = newForm();
        ObjectNode t = structOf(table(detail(id), "A"));
        setCellInt(t, 1, 2, "rowspan", 2);                                       // r1_c2 가 r2 의 값 칸을 덮는다
        ((ArrayNode) t.get("rows").get(2).get("cells")).remove(1);               // r2_c2 앵커 제거
        JsonNode need = call(MEMBER, put("/board-forms/" + id), bodyOf(1, t), 400);
        assertEquals("UNMAP_CONFIRM_REQUIRED", need.get("detail").get("code").asText());
        assertEquals("r2_c2", need.get("detail").get("dropped").get(0).get("key").asText());
        // 표 전체를 빼는 것은 연결 칸이 있어도 이 확인 대상이 아니다(표 삭제는 별도 동작)
        ObjectNode b = JSON.createObjectNode();
        b.put("base_version", 1);
        b.putArray("tables").add(tbl("A")).add(tbl("C-4"));
        assertEquals(2, call(MEMBER, put("/board-forms/" + id), b, 200).get("version").asInt());
    }

    // ── 옛 계약(cells 맵) ──

    @Test
    public void cells만_보낸_PUT은_구조를_유지하고_옛_key는_400() throws Exception {
        long id = newForm();
        call(MEMBER, put("/board-forms/" + id), bodyOf(1, withNewRow(table(detail(id), "A"))), 200);
        ObjectNode a = tbl("A");
        a.put("title", "제목만 바꿈");
        a.putObject("cells").put("r0_c0", "기관");
        JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(2, a), 200);
        assertEquals(Arrays.asList("r0", "r1", "r2", "r100", "r3", "r4"), texts(table(r, "A").get("row_ids")));   // 구조 유지
        assertEquals("제목만 바꿈", table(r, "A").get("title").asText());
        assertEquals("기관", table(r, "A").get("rows").get(0).get(0).get("text").asText());
        assertEquals("", table(r, "A").get("rows").get(3).get(0).get("text").asText());     // 전체 교체: 안 보낸 추가 칸 문구는 비워진다
        ObjectNode oldKey = tbl("A");
        oldKey.putObject("cells").put("r0c0", "낡은 화면");
        assertEquals("수정할 수 없는 칸이 포함되어 있습니다.",
                call(MEMBER, put("/board-forms/" + id), bodyOf(3, oldKey), 400).get("detail").asText());
        // 사용자가 추가한 칸 key(r100_c1)도 cells 로 고칠 수 있다
        ObjectNode a2 = tbl("A");
        a2.putObject("cells").put("r100_c1", "다시 적음");
        JsonNode r2 = call(MEMBER, put("/board-forms/" + id), bodyOf(3, a2), 200);
        assertEquals("다시 적음", table(r2, "A").get("rows").get(3).get(0).get("text").asText());
    }

    // ── 위조 id ──

    @Test
    public void 위조_id는_400_고정_문구이고_버전이_늘지_않는다() throws Exception {
        long id = newForm();
        JsonNode a = table(detail(id), "A");
        String text = structOf(a).toString();
        for (String[] forge : new String[][]{
                {"\"id\":\"r2\"", "\"id\":\"r02\""}, {"\"id\":\"r2\"", "\"id\":\"x1\""}, {"\"id\":\"r2\"", "\"id\":\"r1\""},
                {"\"id\":\"r2\"", "\"id\":\"r150\""}, {"\"id\":\"c3\"", "\"id\":\"c9999\""}, {"\"id\":\"c3\"", "\"id\":\"c1\""},
                {"\"id\":\"c3\"", "\"id\":\"c03\""}}) {
            ObjectNode t = (ObjectNode) JSON.readTree(text.replace(forge[0], forge[1]));
            if (forge[0].contains("c3")) {                                      // 칸이 말하는 열도 같이 바꿔 id 위조만 남긴다
                t = (ObjectNode) JSON.readTree(t.toString().replace("\"col\":\"c3\"", "\"col\":" + forge[1].substring(5)));
            }
            JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(1, t), 400);
            assertEquals(forge[1], BAD_STRUCT, r.get("detail").asText());
            assertFalse(r.toString().contains("9999"));                          // 입력을 되돌려 싣지 않는다
        }
        // 표 간 이동: A 에만 있는 행 id(r4)를 B 에 쓴다
        ObjectNode b = structOf(table(detail(id), "B"));
        ((ObjectNode) rowsOf(b).get(2)).put("id", "r4");
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(1, b), 400).get("detail").asText());
        // cols 만 · rows 만
        ObjectNode half = structOf(a);
        half.remove("rows");
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(1, half), 400).get("detail").asText());
        half = structOf(a);
        half.remove("cols");
        assertEquals(BAD_STRUCT, call(MEMBER, put("/board-forms/" + id), bodyOf(1, half), 400).get("detail").asText());
        assertEquals(1, detail(id).get("version").asInt());
    }

    // ── 상한 ──

    @Test
    public void 상한_위반은_400이다_행41_열13_표칸_양식칸_문구101_제어문자() throws Exception {
        long id = newForm();
        JsonNode cur = detail(id);
        // 행 41: C-4 에 새 행 37개를 더한다
        ObjectNode r41 = structOf(table(cur, "C-4"));
        for (int i = 0; i < 37; i++) {
            ObjectNode row = JSON.createObjectNode();
            row.putNull("id");
            row.putArray("cells").add(newCell("c0", "", false)).add(newCell("c1", "", false)).add(newCell("c2", "", false));
            rowsOf(r41).add(row);
        }
        assertTrue(call(MEMBER, put("/board-forms/" + id), bodyOf(1, r41), 400).get("detail").asText().contains("행은 1개 이상 40개"));
        // 열 13: 새 열 10개
        ObjectNode c13 = structOf(table(cur, "C-4"));
        for (int i = 1; i <= 10; i++) {
            ((ArrayNode) c13.get("cols")).add(JSON.createObjectNode().put("id", "n" + i));
            for (JsonNode row : c13.get("rows")) {
                ((ArrayNode) row.get("cells")).add(newCell("n" + i, "", false));
            }
        }
        assertTrue(call(MEMBER, put("/board-forms/" + id), bodyOf(1, c13), 400).get("detail").asText().contains("열은 1개 이상 12개"));
        // 표 칸 301 이상: C-2 를 12열 × 26행(312칸)으로
        assertTrue(call(MEMBER, put("/board-forms/" + id), bodyOf(1, full(table(cur, "C-2"), 26)), 400)
                .get("detail").asText().contains("표 하나에 넣을 수 있는 칸은 300개"));
        // 양식 전체 800 초과: C-2·C-3 를 각각 300칸으로 (나머지 표와 합치면 800 초과)
        JsonNode big = call(MEMBER, put("/board-forms/" + id), bodyOf(1, full(table(cur, "C-2"), 25), full(table(cur, "C-3"), 25)), 400);
        assertTrue(big.get("detail").asText(), big.get("detail").asText().contains("양식 전체에 넣을 수 있는 칸은 800개"));
        // 한 표 300칸은 통과
        assertEquals(2, call(MEMBER, put("/board-forms/" + id), bodyOf(1, full(table(cur, "C-2"), 25)), 200).get("version").asInt());
        // 문구 101자 · 제어문자 · 서식 문자
        for (String bad : new String[]{rep("가", 101), "a\u0007b", "a‮b"}) {
            ObjectNode t = structOf(table(detail(id), "C-4"));
            ((ObjectNode) t.get("rows").get(0).get("cells").get(0)).put("text", bad);
            JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(2, t), 400);
            assertTrue(r.get("detail").asText(), r.get("detail").asText().contains(bad.length() > 50 ? "100자" : "쓸 수 없는 문자"));
        }
        // 제목·이름은 기존 규칙 그대로
        ObjectNode longTitle = structOf(table(detail(id), "C-4"));
        longTitle.put("title", rep("가", 101));
        call(MEMBER, put("/board-forms/" + id), bodyOf(2, longTitle), 400);
    }

    /** 표의 기존 열·행 id 를 유지하고 12열 × rowsN 행으로 채운 요청 표(새 열·행은 임시/null id). */
    private static ObjectNode full(JsonNode t, int rowsN) {
        ObjectNode n = tbl(t.get("ref").asText());
        ArrayNode cols = n.putArray("cols");
        List<String> ids = new ArrayList<>(texts(t.get("col_ids")));
        for (int i = 1; ids.size() < 12; i++) {
            ids.add("n" + i);
        }
        for (String c : ids) {
            cols.addObject().put("id", c);
        }
        ArrayNode rows = n.putArray("rows");
        for (int r = 0; r < rowsN; r++) {
            ObjectNode row = rows.addObject();
            if (r < t.get("row_ids").size()) {
                row.put("id", t.get("row_ids").get(r).asText());
            } else {
                row.putNull("id");
            }
            ArrayNode cells = row.putArray("cells");
            for (String c : ids) {
                cells.add(newCell(c, "", false));
            }
        }
        return n;
    }

    private static String rep(String s, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append(s);
        }
        return b.toString();
    }

    @Test
    public void 한도는_상세와_카탈로그_응답에_실린다() throws Exception {
        long id = newForm();
        for (JsonNode l : new JsonNode[]{detail(id).get("limits"), call(MEMBER, get("/board-forms/catalog"), null, 200).get("limits")}) {
            assertEquals(40, l.get("max_rows").asInt());
            assertEquals(12, l.get("max_cols").asInt());
            assertEquals(100, l.get("max_cell_chars").asInt());
            assertEquals(800, l.get("max_form_cells").asInt());
            assertEquals(300, l.get("max_table_cells").asInt());
        }
    }

    // ── 권한 · 충돌 · 보관 · 버전 상한 ──

    @Test
    public void 구조_저장도_권한_팀_범위_충돌_보관_규칙을_따른다() throws Exception {
        long id = newForm();
        ObjectNode body = bodyOf(1, withNewRow(table(detail(id), "A")));
        call("3361829", put("/board-forms/" + id), body, 403);                    // 수정 권한 없는 같은 팀원
        call(null, put("/board-forms/" + id), body, 401);
        grant(IT);
        call(IT, put("/board-forms/" + id), body, 404);                           // 다른 팀은 존재를 모른다
        call(MEMBER, put("/board-forms/" + id), body, 200);
        call(MEMBER, put("/board-forms/" + id), body, 409);                       // 낡은 base_version
        grant(LEAD);
        JsonNode r = call(LEAD, put("/board-forms/" + id), bodyOf(2, structOf(table(detail(id), "A"))), 200);   // 같은 팀 다른 사람
        assertFalse(r.get("changed").asBoolean());
        call(MEMBER, post("/board-forms/" + id + "/archive"), null, 200);
        call(MEMBER, put("/board-forms/" + id), bodyOf(2, structOf(table(detail(id), "A"))), 400);          // 보관 양식
    }

    @Test
    public void 양식당_저장_버전은_500개까지() throws Exception {
        long id = newForm();
        BoardForm f = forms.selectForm(id);
        BoardFormVer v1 = forms.selectVersion(id, 1);
        BoardFormVer v = new BoardFormVer();
        v.setFormId(id);
        v.setVerNo(500);
        v.setName(f.getName());
        v.setCatalogVer(v1.getCatalogVer());
        v.setSpecJson(v1.getSpecJson());
        v.setCreatedBy(MEMBER);
        v.setCreatedAt(Times.nowIso());
        forms.insertVersion(v);
        assertEquals(1, forms.updateHeader(id, 1, 500, f.getName(), MEMBER, Times.nowIso()));
        // 바뀐 것이 없으면(새 버전이 필요 없으면) 그대로 통과, 바뀌면 상한 400
        assertFalse(call(MEMBER, put("/board-forms/" + id), bodyOf(500, structOf(table(detail(id), "A"))), 200)
                .get("changed").asBoolean());
        JsonNode r = call(MEMBER, put("/board-forms/" + id), bodyOf(500, withNewRow(table(detail(id), "A"))), 400);
        assertTrue(r.get("detail").asText(), r.get("detail").asText().contains("저장 이력"));
    }
}
