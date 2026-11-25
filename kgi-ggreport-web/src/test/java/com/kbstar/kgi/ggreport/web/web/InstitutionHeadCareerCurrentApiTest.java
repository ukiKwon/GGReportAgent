package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.*;

/** 경력 현직 표시(current) — 경력만, 끝이 있으면 거절, 상세 career[].current 로 나간다. 가상 값만. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadCareerCurrentApiTest extends HeadApiTestBase {

    private static String items() { return headPath(INST) + "/items"; }

    private static String career(long head, String value, String period, String extra) {
        return "{\"head_id\":" + head + ",\"field_cd\":\"CAREER\",\"value\":\"" + value + "\"" + period + extra + ",\"source\":" + source() + "}";
    }

    private Integer flagOf(long itemId) {
        return jdbc.queryForObject("SELECT VAL_FLAG FROM INST_HEAD_ITEM WHERE ITEM_ID=?", Integer.class, itemId);
    }

    private JsonNode careerOf(long itemId) throws Exception {
        for (JsonNode c : json(getAs(headPath(INST), L1)).path("head").path("career")) {
            if (c.path("item_id").asLong() == itemId) {
                return c;
            }
        }
        fail("career 에 없음: " + itemId);
        return null;
    }

    @Test
    public void 현직이면_끝_없이_201이고_VAL_FLAG_1_상세_current_true() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long id = addItemOk(INST, L1, career(head, "가람구청장", ",\"from\":\"2026-07\"", ",\"current\":true"), 201);
        assertEquals(Integer.valueOf(1), flagOf(id));
        JsonNode c = careerOf(id);
        assertTrue(c.path("current").asBoolean());
        assertTrue(c.get("to").isNull());
    }

    @Test
    public void 표시가_없거나_false면_0이고_current_false() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long a = addItemOk(INST, L1, career(head, "가람시 기획관", ",\"from\":\"2018\"", ""), 201);
        long b = addItemOk(INST, L1, career(head, "가람시 총무과장", ",\"from\":\"2015\"", ",\"current\":false"), 201);
        assertEquals(Integer.valueOf(0), flagOf(a));
        assertEquals(Integer.valueOf(0), flagOf(b));
        assertTrue(careerOf(a).has("current"));
        assertFalse(careerOf(a).path("current").asBoolean());
    }

    @Test
    public void 현직인데_끝이_있으면_400_INVALID_DATE_행이_안_생긴다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        int before = count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='CAREER'", head);
        MvcResult r = postJson(items(), L1, career(head, "가람구청장", ",\"from\":\"2018\",\"to\":\"2022\"", ",\"current\":true"));
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(r)));
        assertEquals(before, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='CAREER'", head));
    }

    @Test
    public void 학력_권한대행에_현직이면_400_BAD_VALUE() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult e = postJson(items(), L1, "{\"head_id\":" + head + ",\"field_cd\":\"EDU\",\"value\":\"가람대학교 졸업\",\"from\":\"2010\",\"current\":true,\"source\":" + source() + "}");
        assertEquals(text(e), 400, e.getResponse().getStatus());
        assertEquals("BAD_VALUE", code(json(e)));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='EDU'", head));
        MvcResult a = postJson(items(), L1, "{\"head_id\":" + head + ",\"field_cd\":\"ACTING\",\"flag\":1,\"current\":true,\"source\":" + source() + "}");
        assertEquals(text(a), 400, a.getResponse().getStatus());
        assertEquals("BAD_VALUE", code(json(a)));
    }

    @Test
    public void 학력에_current_false는_무시되고_학력에는_current_키가_없다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long id = addItemOk(INST, L1, "{\"head_id\":" + head + ",\"field_cd\":\"EDU\",\"value\":\"가람대학교 졸업\",\"from\":\"2010\",\"current\":false,\"source\":" + source() + "}", 201);
        assertNull(flagOf(id));
        assertFalse(json(getAs(headPath(INST), L1)).path("head").path("education").get(0).has("current"));
    }

    @Test
    public void 현직_표시_도입_이전_옛_행_VAL_FLAG_NULL은_현직이_아니다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long id = insertCandidateItem(head, INST, "CAREER", "가람시 옛 직책", L1);
        jdbc.update("UPDATE INST_HEAD_ITEM SET STATE_CD='CONFIRMED', VAL_FROM='2010' WHERE ITEM_ID=?", id);
        assertNull(flagOf(id));
        assertFalse(careerOf(id).path("current").asBoolean());
    }
}
