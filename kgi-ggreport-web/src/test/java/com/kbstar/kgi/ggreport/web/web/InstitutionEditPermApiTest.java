package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 기관 레코드 쓰기(POST·PUT·/import)는 map·regions 의 '수정' 권한이 필요하다. 영업 계열은 역할 기본으로 가진다.
 * 시드: 영업팀 3918264 김영업 · 영업팀장 5047192 · 영업부장 2674805 · 디자이너 7130526 · 예산팀 1857403 · 전산팀 4482971 · 관리자 8203417.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionEditPermApiTest {

    private static final String SALES = "3918264";
    private static final String BUDGET = "1857403";
    private static final String IT = "4482971";
    private static final String ADMIN = "8203417";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;

    private int create(String emp, String name) throws Exception {
        MockHttpServletRequestBuilder b = post("/institutions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name_ko\":\"" + name + "\"}");
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    private String createdId(String emp, String name) throws Exception {
        MockHttpServletRequestBuilder b = post("/institutions").header(Actor.HEADER, emp)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name_ko\":\"" + name + "\"}");
        String text = mockMvc.perform(b).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return JSON.readTree(text).path("institution_id").asText();
    }

    private int update(String emp, String id) throws Exception {
        MockHttpServletRequestBuilder b = put("/institutions/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"region_code\":\"11999\"}");
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    private int importCsv(String emp) throws Exception {
        String csv = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일\n임포트구청,자치구,11130,3,2024-02-02,2027-02-02\n";
        MockHttpServletRequestBuilder b = multipart("/institutions/import")
                .file(new MockMultipartFile("file", "표.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        return mockMvc.perform(b).andReturn().getResponse().getStatus();
    }

    private void userPerm(String emp, String menu, int view, int edit) {
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,?,0,?,0,'2026-10-30T00:00:00+00:00')", emp, menu, view, edit);
    }

    @Test
    public void 영업_계열_네_역할은_기본으로_기관을_추가할_수_있다() throws Exception {
        assertEquals(201, create(SALES, "영업팀원기관"));
        assertEquals(201, create("5047192", "영업팀장기관"));
        assertEquals(201, create("2674805", "영업부장기관"));      // regions 조회는 꺼져 있어도 map 으로 편집
        assertEquals(201, create("7130526", "디자이너기관"));
    }

    @Test
    public void 영업은_PUT_과_CSV_반입도_된다() throws Exception {
        String id = createdId(SALES, "수정할기관");
        assertEquals(200, update(SALES, id));
        assertEquals(200, importCsv(SALES));
    }

    @Test
    public void 비영업_역할은_쓰기가_403이고_아무것도_바뀌지_않는다() throws Exception {
        int before = jdbc.queryForObject("SELECT COUNT(*) FROM INSTITUTIONS", Integer.class);
        String id = createdId(SALES, "보호할기관");
        int withOne = before + 1;
        for (String emp : new String[]{BUDGET, IT}) {
            assertEquals(403, create(emp, "막힌기관" + emp));
            assertEquals(403, update(emp, id));
            assertEquals(403, importCsv(emp));
        }
        assertEquals(withOne, (int) jdbc.queryForObject("SELECT COUNT(*) FROM INSTITUTIONS", Integer.class));
    }

    @Test
    public void 헤더가_없으면_401_미등록_사번은_403() throws Exception {
        String id = createdId(SALES, "대상기관");
        assertEquals(401, create(null, "무명기관"));
        assertEquals(401, update(null, id));
        assertEquals(401, importCsv(null));
        assertEquals(403, create("9999999", "유령기관"));
    }

    @Test
    public void 읽기는_여전히_누구나_된다() throws Exception {
        mockMvc.perform(get("/institutions")).andExpect(status().isOk());
    }

    @Test
    public void 영업_사용자도_두_메뉴의_수정을_모두_끄면_차단된다() throws Exception {
        userPerm(SALES, "map", 1, 0);
        userPerm(SALES, "regions", 1, 0);
        assertEquals(403, create(SALES, "차단된영업"));
    }

    @Test
    public void 한_메뉴만_꺼도_다른_메뉴의_기본으로_통과한다() throws Exception {
        userPerm(SALES, "map", 1, 0);
        assertEquals(201, create(SALES, "한쪽만끔"));
    }

    @Test
    public void 비영업도_사용자_예외로_켜면_허용된다() throws Exception {
        userPerm(BUDGET, "regions", 1, 1);
        assertEquals(201, create(BUDGET, "예외허용기관"));
    }

    @Test
    public void 비활성_사용자는_403() throws Exception {
        jdbc.update("UPDATE USERS SET STATUS='RETIRED' WHERE EMP_NO=?", SALES);
        assertEquals(403, create(SALES, "퇴직자기관"));
    }

    @Test
    public void 권한_표에는_영업의_map_regions_수정이_역할_기본으로_보이고_부장은_map만이다() throws Exception {
        JsonNode lead = perms("5047192");
        assertTrue(edit(lead, "map"));
        assertTrue(edit(lead, "regions"));
        assertFalse(edit(lead, "knowledge"));
        JsonNode head = perms("2674805");
        assertTrue(edit(head, "map"));
        assertFalse(edit(head, "regions"));            // 영업부장은 regions 조회가 기본 꺼짐
        assertFalse(edit(perms(BUDGET), "map"));
    }

    @Test
    public void 거부는_접근_이력에_DENIED_로_남고_본문과_쿼리는_없다() throws Exception {
        assertEquals(403, create(IT, "비밀기관명"));
        assertEquals(401, create(null, "비밀기관명2"));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT EVENT_TYPE, STATUS_CODE, REQ_PATH, DETAIL, EMP_NO FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' ORDER BY LOG_ID");
        boolean saw403 = false;
        boolean saw401 = false;
        for (Map<String, Object> r : rows) {
            String path = String.valueOf(r.get("REQ_PATH"));
            String detail = String.valueOf(r.get("DETAIL"));
            assertFalse(path.contains("?"));
            assertFalse(detail.contains("비밀기관명"));
            int code = ((Number) r.get("STATUS_CODE")).intValue();
            if (code == 403 && IT.equals(r.get("EMP_NO"))) {
                saw403 = true;
                assertEquals("no edit permission: map|regions", detail);
            }
            if (code == 401 && r.get("EMP_NO") == null) {
                saw401 = true;
            }
        }
        assertTrue(saw403);
        assertTrue(saw401);
    }

    private JsonNode perms(String emp) throws Exception {
        String text = mockMvc.perform(get("/sysadmin/perms/" + emp).header(Actor.HEADER, ADMIN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return JSON.readTree(text);
    }

    private boolean edit(JsonNode perms, String menu) {
        JsonNode rows = perms.has("perms") ? perms.get("perms") : perms.get("menus");
        for (JsonNode r : rows) {
            if (menu.equals(r.path("menu_key").asText())) {
                return r.path("edit").asBoolean();
            }
        }
        throw new AssertionError("menu not found: " + menu);
    }
}
