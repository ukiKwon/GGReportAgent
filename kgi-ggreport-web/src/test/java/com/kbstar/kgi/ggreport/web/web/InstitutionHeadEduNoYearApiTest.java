package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** 학력은 연도를 비워 저장할 수 있다(사용자 11-25). 경력은 시작 연도 필수 그대로. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadEduNoYearApiTest extends HeadApiTestBase {

    private static String items() {
        return headPath(INST) + "/items";
    }

    private static String edu(long head, String periodJson) {
        return "{\"head_id\":" + head + ",\"field_cd\":\"EDU\",\"value\":\"가람고등학교 졸업\"" + periodJson + ",\"source\":" + source() + "}";
    }

    @Test
    public void 학력은_from_to_모두_없어도_201이고_상세에_null로_나간다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult r = postJson(items(), L1, edu(head, ""));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        assertEquals("CONFIRMED", json(r).path("state").asText());
        JsonNode e = json(getAs(headPath(INST), L1)).path("head").path("education").get(0);
        assertTrue(e.has("from") && e.get("from").isNull());
        assertTrue(e.has("to") && e.get("to").isNull());
    }

    @Test
    public void 빈_문자열도_같다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult r = postJson(items(), L1, edu(head, ",\"from\":\"\",\"to\":\"\""));
        assertEquals(text(r), 201, r.getResponse().getStatus());
    }

    @Test
    public void 학력_시작만_또는_둘_다_있으면_201() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        assertEquals(201, postJson(items(), L1, edu(head, ",\"from\":\"2001\"")).getResponse().getStatus());
        assertEquals(201, postJson(items(), L1, edu(head, ",\"from\":\"2001\",\"to\":\"2005-02\"")).getResponse().getStatus());
    }

    @Test
    public void 학력_끝만_있으면_400이고_행이_안_생긴다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        int before = count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='EDU'", head);
        MvcResult r = postJson(items(), L1, edu(head, ",\"to\":\"2005\""));
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(r)));
        assertEquals(before, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='EDU'", head));
    }

    @Test
    public void 학력_형식_순서_오류는_그대로_400() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        assertEquals(400, postJson(items(), L1, edu(head, ",\"from\":\"20x1\"")).getResponse().getStatus());
        assertEquals(400, postJson(items(), L1, edu(head, ",\"from\":\"2006\",\"to\":\"2005\"")).getResponse().getStatus());
        assertEquals(400, postJson(items(), L1, edu(head, ",\"from\":\" \"")).getResponse().getStatus());
    }

    @Test
    public void 경력은_시작_없으면_여전히_400() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        String body = "{\"head_id\":" + head + ",\"field_cd\":\"CAREER\",\"value\":\"가람시 기획관\",\"source\":" + source() + "}";
        MvcResult r = postJson(items(), L1, body);
        assertEquals(400, r.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(r)));
    }
}
