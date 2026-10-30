package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 시드: 김영업 3918264(영업팀, tasks 조회), 마스터 8203417(전산팀), 백수아 1473958(영업부장, tasks 꺼짐). */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class BoardDocApiTest {

    private static final String MEMBER = "3918264";
    private static final String ADMIN = "8203417";
    private static final String HEAD = "1473958";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;

    private MvcResult call(String emp, String url, int expect) throws Exception {
        MockHttpServletRequestBuilder b = get(url);
        if (emp != null) {
            b = b.header(Actor.HEADER, emp);
        }
        return mockMvc.perform(b).andExpect(status().is(expect)).andReturn();
    }

    private JsonNode json(String emp, String url, int expect) throws Exception {
        return JSON.readTree(call(emp, url, expect).getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static JsonNode tbl(JsonNode doc, String id) {
        for (JsonNode t : doc.get("tables")) {
            if (id.equals(t.get("id").asText())) {
                return t;
            }
        }
        throw new AssertionError("table not found " + id);
    }

    @Test
    public void 목록은_팀원과_전산팀이_보고_나머지는_막힌다() throws Exception {
        assertEquals("default_doc", json(MEMBER, "/board-docs", 200).get("items").get(0).get("id").asText());
        json(ADMIN, "/board-docs", 200);
        call(null, "/board-docs", 401);
        call(HEAD, "/board-docs", 403);          // 영업부장은 기본값에서 tasks 가 꺼져 있다
        call("9999999", "/board-docs", 403);     // 미등록
    }

    @Test
    public void JSON_구조와_확정_샘플값() throws Exception {
        JsonNode d = json(MEMBER, "/board-docs/default_doc", 200);
        assertEquals("default_doc", d.get("id").asText());
        assertFalse(d.has("pages"));
        assertEquals(5, d.get("tables").size());
        assertEquals("C-4", d.get("tables").get(4).get("id").asText());
        JsonNode a = tbl(d, "A");
        assertEquals("A", a.get("mapping").asText());
        assertEquals(4, a.get("columns").asInt());
        JsonNode inst = a.get("rows").get(1).get(0);
        assertEquals("대한민국 기관", inst.get("text").asText());
        assertEquals(4, inst.get("rowspan").asInt());
        assertEquals(1, inst.get("colspan").asInt());
        assertTrue(inst.get("mapped").asBoolean());
        assertFalse(inst.get("header").asBoolean());
        assertEquals("center", inst.get("align").asText());
        assertEquals(2, tbl(d, "C-4").get("notes").size());
        JsonNode b1 = tbl(d, "B").get("rows").get(1).get(0);
        assertEquals("", b1.get("text").asText());
        assertFalse(b1.get("mapped").asBoolean());
        assertEquals(2, b1.get("rowspan").asInt());
    }

    @Test
    public void values_blank는_값_칸만_비운다_잘못된_값은_400_없는_id는_404() throws Exception {
        JsonNode a = tbl(json(MEMBER, "/board-docs/default_doc?values=blank", 200), "A");
        JsonNode inst = a.get("rows").get(1).get(0);
        assertEquals("", inst.get("text").asText());
        assertTrue(inst.get("mapped").asBoolean());
        assertEquals("출연금", a.get("rows").get(1).get(1).get("text").asText());
        call(MEMBER, "/board-docs/default_doc?values=xx", 400);
        MvcResult nf = call(MEMBER, "/board-docs/nope", 404);
        assertFalse(nf.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("nope"));
    }

    @Test
    public void docx_다운로드는_RFC5987_한글_파일명과_zip_본문() throws Exception {
        MvcResult r = call(MEMBER, "/board-docs/default_doc/docx", 200);
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                r.getResponse().getContentType());
        String cd = r.getResponse().getHeader("Content-Disposition");
        assertTrue(cd, cd.contains("filename*=UTF-8''") && cd.contains("%EC"));
        byte[] body = r.getResponse().getContentAsByteArray();
        assertTrue(body.length > 1000);
        assertEquals('P', body[0]);
        assertEquals('K', body[1]);
        call(null, "/board-docs/default_doc/docx", 401);
        call(HEAD, "/board-docs/default_doc/docx", 403);
    }
}
