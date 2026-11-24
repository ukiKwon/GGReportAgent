package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** 뉴스 API(060) — 반입은 관리자만(403+DENIED 감사), 조회는 사업계획 조회와 같은 권한(map), 응답에 사번 없음. ADMIN 8203417, SALES 3918264, 미등록 9000001. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionNewsApiTest {

    private static final String ADMIN = "8203417";
    private static final String SALES = "3918264";
    private static final String STRANGER = "9000001";
    private static final String INST = "jongno";
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    private static LocalDate d() { return LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1); }
    private static String name() { return INST + "_" + d().format(YMD) + "_news.csv"; }

    private static String body() {
        return "기관ID,분야,제목,언론사,보도일,출처URL,요약,확인일,수집자\n"
                + INST + ",TREASURY,\"가상 금고 소식\",가상일보," + d().minusDays(2) + ",https://example.org/a,\"가상 요약이다.\"," + d() + ",news-collector/1.0\n";
    }

    private MockHttpServletResponse upload(String emp) throws Exception {
        MockHttpServletResponse res = mockMvc.perform(multipart("/institutions/" + INST + "/news/import")
                        .file(new MockMultipartFile("file", name(), "text/csv", body().getBytes(StandardCharsets.UTF_8)))
                        .header("X-Emp-No", emp)).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private MockHttpServletResponse getAs(String path, String emp) throws Exception {
        MockHttpServletResponse res = (emp == null ? mockMvc.perform(get(path)) : mockMvc.perform(get(path).header("X-Emp-No", emp)))
                .andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    private int count(String sql, Object... a) { return jdbc.queryForObject(sql, Integer.class, a); }

    @Test
    public void 관리자는_201_영업은_403이고_거부는_감사에_남는다() throws Exception {
        MockHttpServletResponse denied = upload(SALES);
        assertEquals(403, denied.getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='NEWS_IMPORT' AND OUTCOME='DENIED' AND ACTOR_EMP_NO=?", SALES));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_NEWS_IMPORT"));
        MockHttpServletResponse ok = upload(ADMIN);
        assertEquals(ok.getContentAsString(), 201, ok.getStatus());
        JsonNode b = json.readTree(ok.getContentAsString());
        assertEquals(1, b.path("item_count").asInt());
        assertEquals(INST, b.path("institution_id").asText());
    }

    @Test
    public void 사번이_없으면_401이고_감사_표는_늘지_않는다() throws Exception {
        MockHttpServletResponse res = mockMvc.perform(multipart("/institutions/" + INST + "/news/import")
                .file(new MockMultipartFile("file", name(), "text/csv", body().getBytes(StandardCharsets.UTF_8)))).andReturn().getResponse();
        assertEquals(401, res.getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM INST_PLAN_ACT WHERE ACTION_CD='NEWS_IMPORT'"));
    }

    @Test
    public void 조회는_map_권한이고_응답에_사번이_없다() throws Exception {
        assertEquals(201, upload(ADMIN).getStatus());
        assertEquals(401, getAs("/institutions/" + INST + "/news", null).getStatus());
        assertEquals(403, getAs("/institutions/" + INST + "/news", STRANGER).getStatus());
        MockHttpServletResponse res = getAs("/institutions/" + INST + "/news", SALES);
        assertEquals(res.getContentAsString(), 200, res.getStatus());
        JsonNode b = json.readTree(res.getContentAsString());
        assertTrue(b.path("has_news").asBoolean());
        assertEquals("가상 금고 소식", b.path("items").get(0).path("title").asText());
        assertEquals("NEWS_ONLY", b.path("plan_state").asText());
        assertFalse(res.getContentAsString().contains(ADMIN));
        assertEquals(404, getAs("/institutions/nosuch-x/news", SALES).getStatus());
    }
}
