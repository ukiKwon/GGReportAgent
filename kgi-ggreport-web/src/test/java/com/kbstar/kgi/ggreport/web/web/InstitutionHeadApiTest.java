package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 기관장 정보 목록·상세·가림(NEXT 72·77) — 등록 → 목록(가린 이름) → 상세(원문·no-store·감사) → 없는 기관 404 → 이력·접근 이력에 이름 없음. */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadApiTest extends HeadApiTestBase {

    @Test
    public void 현_기관장이_없으면_직접_등록이_곧_확정이다() throws Exception {
        MvcResult r = postJson(headsPath(INST), T1, headJson("홍길동", "구청장"));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        JsonNode j = json(r);
        assertEquals("CURRENT", j.path("state").asText());
        assertFalse(j.path("conflict").asBoolean());
        long head = j.path("head_id").asLong();
        assertEquals("CURRENT", headStatus(head));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'", head));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_ADD' AND HEAD_ID=? AND SELF_FLAG=1"
                + " AND ACTOR_EMP_NO=? AND ACTOR_ROLE='영업팀'", head, T1));
        assertEquals(1, act("HEAD_ADD", "OK"));
    }

    @Test
    public void 목록은_가린_이름만_주고_학력_경력_사진_번호는_없다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        addItemOk(INST, T1, itemText(head, "EDU", "행정학 석사"), 201);
        addItemOk(INST, T1, itemText(head, "CAREER", "서울특별시 행정국장"), 201);
        MvcResult r = getAs("/institution-heads", T2);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String body = text(r);
        assertTrue(body, body.contains("홍*동"));
        assertFalse(body.contains("홍길동"));
        assertFalse(body.contains("education") || body.contains("career") || body.contains("photo_id") || body.contains("행정학"));
        JsonNode row = null;
        for (JsonNode n : json(r)) {
            if (INST.equals(n.path("institution_id").asText())) {
                row = n;
            }
        }
        assertTrue(row != null);
        assertEquals("구청장", row.path("position").asText());
        assertEquals(head, row.path("head_id").asLong());
        assertFalse(row.path("has_photo").asBoolean());
        assertEquals(0, row.path("open_candidates").asInt());
        assertEquals("목록 성공은 감사 표에 넣지 않는다(가린 값)", 0, act("LIST", "OK"));
    }

    @Test
    public void 상세는_원문을_주고_no_store이며_감사_표에_VIEW가_남는다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        addItemOk(INST, T1, itemDate(head, "TERM_END", "2030-06-30"), 201);
        MvcResult r = getAs(headPath(INST), T2);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertTrue(r.getResponse().getHeader("Cache-Control").contains("no-store"));
        JsonNode j = json(r);
        assertEquals("홍길동", j.path("head").path("name").asText());
        assertEquals("구청장", j.path("head").path("position").asText());
        assertEquals("2030-06-30", j.path("head").path("term_end").asText());
        assertEquals("2030-06-30", j.path("head").path("fields").path("TERM_END").path("value").asText());
        assertFalse(j.path("viewer_verified").asBoolean());
        assertEquals("영업팀", j.path("viewer_role").asText());
        assertEquals(INST, j.path("institution_id").asText());
        assertTrue(j.path("candidates").isArray() && j.path("candidate_heads").isArray());
        assertTrue("사진이 없으면 photo:null", j.path("head").path("photo").isNull());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='VIEW' AND OUTCOME='OK' AND INSTITUTION_ID=?"
                + " AND ACTOR_EMP_NO=?", INST, T2));
    }

    @Test
    public void 현_기관장이_없는_기관의_상세는_head_null이다() throws Exception {
        MvcResult r = getAs(headPath(INST2), T1);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertTrue(json(r).path("head").isNull());
        assertEquals(0, json(r).path("candidates").size());
    }

    @Test
    public void 없는_기관의_상세는_404이고_감사_표에_HIDDEN이_남는다() throws Exception {
        MvcResult r = getAs(headPath("no-such-institution"), T1);
        assertEquals(text(r), 404, r.getResponse().getStatus());
        assertEquals(1, act("VIEW", "HIDDEN"));
    }

    @Test
    public void 흐름이_끝난_뒤_이력과_접근_이력_어디에도_이름이_없다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long cand = addItemOk(INST, T2, itemText(head, "POSITION", "부구청장"), 202);
        assertEquals(200, postJson(headPath(INST) + "/items/" + cand + "/reject", T2, reason("잘못 입력함")).getResponse().getStatus());
        getAs(headPath(INST), T1);
        getAs("/institution-heads", T1);
        // 양성 단언 먼저 — 기록이 실제로 생겼는데 이름이 없다는 것을 보인다(기록이 없어서 0 인 것이 아니다)
        assertTrue("이력에 사유가 남았다", count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND REASON='잘못 입력함'") == 1);
        assertTrue("접근 이력에 기관 경로가 남았다",
                count("SELECT COUNT(*) FROM ACCESS_LOG WHERE REQ_PATH LIKE '/institutions/nowon/head%'") > 0);
        assertTrue("접근 이력의 요약은 행위 코드다", count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE 'inst-head inst=nowon code=VIEW'") > 0);
        assertTrue("감사 표에 열람이 남았다", count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='VIEW' AND OUTCOME='OK' AND INSTITUTION_ID='nowon'") == 1);
        // 이름은 어디에도 없다 — 사유·접근 이력 요약·경로
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE REASON LIKE '%홍길동%'"));
        assertEquals(0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE '%홍길동%' OR REQ_PATH LIKE '%홍길동%'"));
    }

    @Test
    public void 대기열은_값_없이_수만_준다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        addItemOk(INST, T2, itemText(head, "POSITION", "부구청장"), 202);
        MvcResult r = getAs("/institution-heads/candidates", T1);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        JsonNode row = null;
        for (JsonNode n : json(r).path("institutions")) {
            if (INST.equals(n.path("institution_id").asText())) {
                row = n;
            }
        }
        assertTrue(row != null);
        assertEquals(1, row.path("open_count").asInt());
        assertEquals(1, row.path("conflict_count").asInt());
        assertEquals("POSITION", row.path("field_cds").get(0).asText());
        assertTrue(json(r).has("unmatched_count"));
        assertFalse(text(r).contains("부구청장"));
        assertEquals(1, act("QUEUE_VIEW", "OK"));
    }
}
