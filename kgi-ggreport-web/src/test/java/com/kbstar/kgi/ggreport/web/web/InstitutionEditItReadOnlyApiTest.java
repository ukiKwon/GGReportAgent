package com.kbstar.kgi.ggreport.web.web;

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
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * 사용자 11-19 '전산팀·전산팀장은 시스템 전체 보기 전용' — 사용자별 예외(USER_MENU_PERMS map can_view=1·can_edit=1)를 넣어도
 * 기관 쓰기(PUT·POST·/import)는 403 + DENIED 'institution edit: sales roles only'. 영업은 그대로 통과하고, 사업계획 수집 요청은 전산팀에 여전히 열려 있다.
 * 시드: 영업팀 3918264 · 전산팀 4482971 · 전산팀장 6295038.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionEditItReadOnlyApiTest {

    private static final String SALES = "3918264";
    private static final String IT = "4482971";
    private static final String IT_LEAD = "6295038";
    private static final String DENY_DETAIL = "institution edit: sales roles only";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;

    private void grantMapEdit(String emp) {
        jdbc.update("INSERT INTO USER_MENU_PERMS (EMP_NO, MENU_KEY, CAN_VIEW, CAN_WRITE, CAN_EDIT, CAN_APPROVE, UPDATED_AT)"
                + " VALUES (?,?,1,0,1,0,'2026-11-19T00:00:00+00:00')", emp, "map");
    }

    private int denied(String emp) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND STATUS_CODE=403"
                + " AND DETAIL=? AND EMP_NO=?", Integer.class, DENY_DETAIL, emp);
    }

    private String createdId(String name) throws Exception {
        String text = mockMvc.perform(post("/institutions").header(Actor.HEADER, SALES)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name_ko\":\"" + name + "\"}"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return JSON.readTree(text).path("institution_id").asText();
    }

    private int putAs(String emp, String id) throws Exception {
        return mockMvc.perform(put("/institutions/" + id).header(Actor.HEADER, emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"region_code\":\"11888\"}"))
                .andReturn().getResponse().getStatus();
    }

    private int postNew(String emp, String name) throws Exception {
        return mockMvc.perform(post("/institutions").header(Actor.HEADER, emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name_ko\":\"" + name + "\"}"))
                .andReturn().getResponse().getStatus();
    }

    private int importCsv(String emp) throws Exception {
        String csv = "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일\n전산반입구청,자치구,11130,3,2024-02-02,2027-02-02\n";
        return mockMvc.perform(multipart("/institutions/import")
                        .file(new MockMultipartFile("file", "표.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)))
                        .header(Actor.HEADER, emp))
                .andReturn().getResponse().getStatus();
    }

    private int institutionCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM INSTITUTIONS", Integer.class);
    }

    private String regionOf(String id) {
        return jdbc.queryForObject("SELECT REGION_CODE FROM INSTITUTIONS WHERE INSTITUTION_ID=?", String.class, id);
    }

    @Test
    public void 전산팀은_사용자_예외로_map_수정을_켜도_기관_PUT이_403이고_값이_그대로다() throws Exception {
        String id = createdId("전산보기전용기관");
        String before = regionOf(id);
        grantMapEdit(IT);
        int logs = denied(IT);

        assertEquals(403, putAs(IT, id));

        assertEquals(logs + 1, denied(IT));
        assertEquals(before, regionOf(id));
    }

    @Test
    public void 전산팀의_기관_추가_POST는_403이다() throws Exception {
        grantMapEdit(IT);
        int count = institutionCount();
        int logs = denied(IT);

        assertEquals(403, postNew(IT, "전산추가기관"));

        assertEquals(count, institutionCount());
        assertEquals(logs + 1, denied(IT));
    }

    @Test
    public void 전산팀의_CSV_반입은_403이다() throws Exception {
        grantMapEdit(IT);
        int count = institutionCount();
        int logs = denied(IT);

        assertEquals(403, importCsv(IT));

        assertEquals(count, institutionCount());
        assertEquals(logs + 1, denied(IT));
    }

    @Test
    public void 전산팀장도_사용자_예외가_있어도_세_경로_모두_403이다() throws Exception {
        String id = createdId("전산팀장보기전용기관");
        String before = regionOf(id);
        grantMapEdit(IT_LEAD);
        int count = institutionCount();
        int logs = denied(IT_LEAD);

        assertEquals(403, putAs(IT_LEAD, id));
        assertEquals(403, postNew(IT_LEAD, "전산팀장추가기관"));
        assertEquals(403, importCsv(IT_LEAD));

        assertEquals(logs + 3, denied(IT_LEAD));
        assertEquals(before, regionOf(id));
        assertEquals(count, institutionCount());
    }

    @Test
    public void 대조군_영업팀은_PUT이_200이다() throws Exception {
        String id = createdId("영업수정기관");
        int logs = denied(SALES);

        assertEquals(200, putAs(SALES, id));

        assertEquals("11888", regionOf(id));
        assertEquals(logs, denied(SALES));
    }

    /** 보기 전용은 기관 레코드 쓰기에만 걸린다 — 사업계획 수집 요청(개발부서 허용, PlanCollectService.canRequest)은 그대로. */
    @Test
    public void 전산팀의_사업계획_수집_요청은_여전히_허용된다() throws Exception {
        int status = mockMvc.perform(post("/institutions/jongno/plan-collect").header(Actor.HEADER, IT))
                .andReturn().getResponse().getStatus();
        assertEquals(201, status);
    }
}
