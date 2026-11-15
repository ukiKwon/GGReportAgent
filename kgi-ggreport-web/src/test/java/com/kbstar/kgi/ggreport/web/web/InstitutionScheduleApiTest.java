package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 기관 확정/추정·운영 상태·개원 예정일 저장 규칙(030, NEXT 72) — PUT /institutions/{id}.
 * 영업 사번 3918264(기존 시험 기준). 롤백한다(기관 수를 세는 골든 시험 보호).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionScheduleApiTest {

    private static final String SALES = "3918264";
    private static final String BUDGET = "1857403";
    private static final String IT = "4482971";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    private String create(String name) throws Exception {
        MockHttpServletResponse r = mockMvc.perform(post("/institutions").header(Actor.HEADER, SALES)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name_ko\":\"" + name + "\"}")).andReturn().getResponse();
        assertEquals(201, r.getStatus());
        return JSON.readTree(r.getContentAsString(StandardCharsets.UTF_8)).path("institution_id").asText();
    }

    private MockHttpServletResponse put(String id, String body) throws Exception {
        return putAs(SALES, id, body, null, null);
    }

    private MockHttpServletResponse putAs(String emp, String id, String body, String screen, String button) throws Exception {
        MockHttpServletRequestBuilder b = MockMvcRequestBuilders.put("/institutions/" + id).contentType(MediaType.APPLICATION_JSON).content(body);
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        if (screen != null) {
            b = b.header("X-Screen-Id", screen);
        }
        if (button != null) {
            b = b.header("X-Button-Id", button);
        }
        return mockMvc.perform(b).andReturn().getResponse();
    }

    private JsonNode ok(MockHttpServletResponse r) throws Exception {
        String text = r.getContentAsString(StandardCharsets.UTF_8);
        assertEquals(text, 200, r.getStatus());
        return JSON.readTree(text);
    }

    private void bad(MockHttpServletResponse r) throws Exception {
        String text = r.getContentAsString(StandardCharsets.UTF_8);
        assertEquals(text, 400, r.getStatus());
        String detail = JSON.readTree(text).path("detail").asText();
        assertFalse(text, detail.isEmpty());
        for (String leak : new String[]{"SQL", "INSTITUTIONS", "Exception", "java.", "com.kbstar"}) {
            assertFalse("오류 본문에 내부 정보: " + text, text.contains(leak));
        }
    }

    private JsonNode get(String id) throws Exception {
        return JSON.readTree(mockMvc.perform(MockMvcRequestBuilders.get("/institutions/" + id)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8));
    }

    private int logCount(String id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ?", Integer.class, id);
    }

    private String confirmedRow(String name) throws Exception {
        String id = create(name);
        ok(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":true,\"contract_end_src_no\":\"제2026-1393호\"}"));
        return id;
    }

    // ------------------------------------------------------------ 입찰 예정일·확정

    @Test
    public void 날짜만_보내면_400() throws Exception {
        String id = create("일정구청1");
        bad(put(id, "{\"contract_end\":\"2027-03-01\"}"));
        assertEquals(0, logCount(id));
    }

    @Test
    public void 추정으로_저장하면_200_출처_없음() throws Exception {
        String id = create("일정구청2");
        JsonNode r = ok(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":false}"));
        assertFalse(r.path("contract_end_confirmed").asBoolean());
        assertTrue(r.path("contract_end_src_url").isNull());
        assertEquals("2027-03-01", r.path("contract_end").asText());
    }

    @Test
    public void 확정은_출처가_있어야_한다() throws Exception {
        String id = create("일정구청3");
        bad(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":true}"));
        JsonNode r = ok(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":true,"
                + "\"contract_end_src_url\":\"https://x.kr/a\"}"));
        assertTrue(r.path("contract_end_confirmed").asBoolean());
        assertEquals("https://x.kr/a", r.path("contract_end_src_url").asText());
    }

    @Test
    public void 나쁜_링크는_400() throws Exception {
        String id = create("일정구청4");
        for (String url : new String[]{"javascript:alert(1)", "ftp://x.kr/a", "https://u:p@x.kr/", "http://x.kr/\\\"><b>",
                "http://x.kr/<a>", "http://x.kr/\\u202e"}) {
            bad(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":true,\"contract_end_src_url\":\"" + url + "\"}"));
        }
        assertEquals(0, logCount(id));
    }

    @Test
    public void 공고_번호로도_확정된다() throws Exception {
        String id = create("일정구청5");
        JsonNode r = ok(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":true,"
                + "\"contract_end_src_no\":\"제2026-1393호\"}"));
        assertEquals("제2026-1393호", r.path("contract_end_src_no").asText());
    }

    @Test
    public void 확정된_행의_날짜를_추정으로_바꾸면_출처가_지워진다() throws Exception {
        String id = confirmedRow("일정구청6");
        JsonNode r = ok(put(id, "{\"contract_end\":\"2027-04-01\",\"contract_end_confirmed\":false}"));
        assertFalse(r.path("contract_end_confirmed").asBoolean());
        assertTrue(r.path("contract_end_src_no").isNull());
    }

    @Test
    public void 날짜를_비우면_추정이_된다_날짜_없이_확정은_400() throws Exception {
        String id = confirmedRow("일정구청7");
        bad(put(id, "{\"contract_end\":null,\"contract_end_confirmed\":true}"));
        JsonNode r = ok(put(id, "{\"contract_end\":null}"));
        assertFalse(r.path("contract_end_confirmed").asBoolean());
        String id2 = create("일정구청7b");
        bad(put(id2, "{\"contract_end_confirmed\":true}"));
    }

    @Test
    public void 없는_날짜는_400() throws Exception {
        String id = create("일정구청8");
        bad(put(id, "{\"contract_end\":\"2027-02-30\",\"contract_end_confirmed\":false}"));
    }

    @Test
    public void 확정_여부만_추정으로_내리면_출처가_지워진다() throws Exception {
        String id = confirmedRow("일정구청9");
        JsonNode r = ok(put(id, "{\"contract_end_confirmed\":false}"));
        assertFalse(r.path("contract_end_confirmed").asBoolean());
        assertEquals("2027-03-01", r.path("contract_end").asText());
        assertTrue(r.path("contract_end_src_no").isNull());
    }

    // ------------------------------------------------------------ 운영 상태·개원 예정일

    @Test
    public void 개원_예정에는_개원일이_필요하고_지난_개원일은_확인_필요() throws Exception {
        String id = create("개원구청1");
        bad(put(id, "{\"op_status\":\"PLANNED\"}"));
        JsonNode r = ok(put(id, "{\"op_status\":\"PLANNED\",\"open_date\":\"2020\",\"op_src_no\":\"제1호\"}"));
        assertEquals("PLANNED", r.path("op_status").asText());
        assertTrue(r.path("open_check_needed").asBoolean());
        bad(put(id, "{\"op_status\":\"OPERATING\"}"));                       // 출처 없음
        JsonNode back = ok(put(id, "{\"op_status\":\"OPERATING\",\"op_src_url\":\"https://x.kr/o\"}"));
        assertFalse(back.path("open_check_needed").asBoolean());
        assertEquals("OPERATING", back.path("op_status").asText());
    }

    @Test
    public void 모르는_운영_상태는_400() throws Exception {
        String id = create("개원구청2");
        bad(put(id, "{\"op_status\":\"FOO\"}"));
    }

    @Test
    public void 미래_개원일은_확인_필요가_아니다() throws Exception {
        String id = create("개원구청3");
        JsonNode r = ok(put(id, "{\"op_status\":\"PLANNED\",\"open_date\":\"2099\",\"op_src_no\":\"제2호\"}"));
        assertFalse(r.path("open_check_needed").asBoolean());
    }

    /** 보안 검토 L1 — 상태를 바꾸지 않는 저장이 출처를 둘 다 지우면 사람이 정한 상태가 시드 소유로 돌아간다. */
    @Test
    public void 상태를_안_바꾸는_저장이_출처를_모두_비우면_400() throws Exception {
        String id = create("개원구청4");
        ok(put(id, "{\"op_status\":\"PLANNED\",\"open_date\":\"2099\",\"op_src_no\":\"제3호\"}"));
        bad(put(id, "{\"op_src_url\":\"\",\"op_src_no\":\"\"}"));
        assertEquals("제3호", get(id).path("op_src_no").asText());
        ok(put(id, "{\"open_date\":\"2098\"}"));                              // 개원일만 바꾸는 저장은 된다
    }

    // ------------------------------------------------------------ 이력·권한·깨진 JSON

    @Test
    public void 성공한_저장은_바뀐_칸마다_이력_한_행_헤더가_없으면_UNKNOWN() throws Exception {
        String id = create("이력구청1");
        ok(put(id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":true,\"contract_end_src_no\":\"제2026-1393호\"}"));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT FIELD_CD, ACTOR_EMP_NO, SCREEN_ID, BUTTON_ID, UI_VALID, EMP_VERIFIED FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? ORDER BY LOG_ID", id);
        assertEquals(2, rows.size());
        assertEquals("CONTRACT_END", rows.get(0).get("FIELD_CD"));
        assertEquals("CONTRACT_END_CONFIRMED", rows.get(1).get("FIELD_CD"));
        assertEquals(SALES, rows.get(0).get("ACTOR_EMP_NO"));
        assertEquals("UNKNOWN", rows.get(0).get("SCREEN_ID"));
        assertEquals("UNKNOWN", rows.get(0).get("BUTTON_ID"));
        assertEquals(0, ((Number) rows.get(0).get("UI_VALID")).intValue());
        assertEquals(0, ((Number) rows.get(0).get("EMP_VERIFIED")).intValue());
    }

    @Test
    public void 허용된_화면_버튼_헤더는_그대로_기록된다() throws Exception {
        String id = create("이력구청2");
        ok(putAs(SALES, id, "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":false}", "institution_edit", "save_schedule"));
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT SCREEN_ID, BUTTON_ID, UI_VALID FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? AND FIELD_CD = 'CONTRACT_END'", id);
        assertEquals("institution_edit", row.get("SCREEN_ID"));
        assertEquals("save_schedule", row.get("BUTTON_ID"));
        assertEquals(1, ((Number) row.get("UI_VALID")).intValue());
        // 반입 화면 id 는 헤더로 흉내 낼 수 없다
        ok(putAs(SALES, id, "{\"contract_end\":\"2027-05-01\",\"contract_end_confirmed\":false}", "csv_import", "import_upsert"));
        assertEquals("UNKNOWN", jdbc.queryForObject("SELECT SCREEN_ID FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? AND NEW_VAL = '2027-05-01'",
                String.class, id));
    }

    @Test
    public void 거부된_저장은_값도_이력도_바꾸지_않는다() throws Exception {
        String id = create("이력구청3");
        bad(put(id, "{\"region_code\":\"11999\",\"contract_end\":\"2027-03-01\"}"));
        assertEquals(0, logCount(id));
        assertTrue(get(id).path("region_code").isNull());
    }

    @Test
    public void 사번이_없으면_401_예산팀_전산팀은_403() throws Exception {
        String id = create("권한구청1");
        String body = "{\"contract_end\":\"2027-03-01\",\"contract_end_confirmed\":false}";
        assertEquals(401, putAs(null, id, body, null, null).getStatus());
        assertEquals(403, putAs(BUDGET, id, body, null, null).getStatus());
        assertEquals(403, putAs(IT, id, body, null, null).getStatus());
        assertEquals(0, logCount(id));
    }

    @Test
    public void 빈_지역코드는_응답에서_null() throws Exception {
        String id = create("지역구청1");
        jdbc.update("UPDATE INSTITUTIONS SET REGION_CODE = '' WHERE INSTITUTION_ID = ?", id);
        // Oracle 모드 H2 는 '' 를 NULL 로 본다 — 어느 쪽이든 응답은 null 이어야 한다.
        assertTrue(get(id).path("region_code").isNull());
    }

    /** 보안 검토 L5 — 깨진 값의 응답 본문에 파서 메시지·클래스명이 없어야 한다. */
    @Test
    public void 깨진_JSON_값은_고정_문구_400() throws Exception {
        String id = create("깨짐구청1");
        for (String body : new String[]{"{\"contract_end_confirmed\":\"yes\"}", "{\"contract_end\":123}", "{\"contract_end_confirmed\":[1]}"}) {
            MockHttpServletResponse r = put(id, body);
            String text = r.getContentAsString(StandardCharsets.UTF_8);
            assertEquals(text, 400, r.getStatus());
            for (String leak : new String[]{"Exception", "com.fasterxml", "java.lang", "Cannot deserialize", "InstitutionUpdateIn", "yes"}) {
                assertFalse(body + " → 본문에 내부 정보(" + leak + "): " + text, text.contains(leak));
            }
        }
        assertEquals(0, logCount(id));
    }

    // ------------------------------------------------------------ CSV 반입(보안 검토 B3)

    private void csv(String name, String end) throws Exception {
        String csv = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일\n" + name + ",자치구,11130,3,2024-02-02," + end + "\n";
        MockHttpServletResponse r = mockMvc.perform(multipart("/institutions/import")
                .file(new MockMultipartFile("file", "표.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)))
                .header(Actor.HEADER, SALES)).andReturn().getResponse();
        assertEquals(200, r.getStatus());
    }

    @Test
    public void CSV가_확정된_날짜를_바꾸면_확정이_내려가고_칸별_이력이_남는다() throws Exception {
        String id = confirmedRow("반입구청1");
        int before = logCount(id);
        csv("반입구청1", "2027-09-09");
        JsonNode r = get(id);
        assertEquals("2027-09-09", r.path("contract_end").asText());
        assertFalse(r.path("contract_end_confirmed").asBoolean());
        assertTrue(r.path("contract_end_src_no").isNull());
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT FIELD_CD, SCREEN_ID, BUTTON_ID, ACTOR_EMP_NO FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? AND SCREEN_ID = 'csv_import' ORDER BY LOG_ID", id);
        assertTrue(rows.size() >= 2);
        assertEquals(before + rows.size(), logCount(id));
        boolean end = false, conf = false;
        for (Map<String, Object> row : rows) {
            end |= "CONTRACT_END".equals(row.get("FIELD_CD"));
            conf |= "CONTRACT_END_CONFIRMED".equals(row.get("FIELD_CD"));
            assertEquals(SALES, row.get("ACTOR_EMP_NO"));
        }
        assertTrue(end && conf);
    }

    @Test
    public void CSV가_같은_날짜를_올리면_확정이_유지되고_그_칸_이력은_없다() throws Exception {
        String id = confirmedRow("반입구청2");
        csv("반입구청2", "2027-03-01");
        assertTrue(get(id).path("contract_end_confirmed").asBoolean());
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? AND SCREEN_ID = 'csv_import' AND FIELD_CD IN ('CONTRACT_END','CONTRACT_END_CONFIRMED')",
                Integer.class, id).intValue());
    }

    @Test
    public void 같은_날짜를_공백과_함께_보내면_DB에는_공백_없이_저장되고_확정은_유지된다() throws Exception {
        String id = confirmedRow("공백구청1");
        int before = logCount(id);
        JsonNode r = ok(put(id, "{\"contract_end\":\" 2027-03-01 \"}"));
        assertEquals("2027-03-01", r.path("contract_end").asText());
        assertEquals("2027-03-01", jdbc.queryForObject(
                "SELECT CONTRACT_END FROM INSTITUTIONS WHERE INSTITUTION_ID = ?", String.class, id));
        assertTrue(get(id).path("contract_end_confirmed").asBoolean());
        assertEquals(before, logCount(id));
    }

    @Test
    public void CSV가_빈_날짜를_처음_채우면_확정은_0_유지_이력은_CONTRACT_END_한_행() throws Exception {
        String id = create("반입구청3");                      // CONTRACT_END = NULL
        csv("반입구청3", "2027-09-09");
        JsonNode r = get(id);
        assertEquals("2027-09-09", r.path("contract_end").asText());
        assertFalse(r.path("contract_end_confirmed").asBoolean());
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? AND SCREEN_ID = 'csv_import' AND FIELD_CD = 'CONTRACT_END'",
                Integer.class, id).intValue());
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM INST_EDIT_LOG WHERE INSTITUTION_ID = ? AND SCREEN_ID = 'csv_import' AND FIELD_CD = 'CONTRACT_END_CONFIRMED'",
                Integer.class, id).intValue());
    }
}
