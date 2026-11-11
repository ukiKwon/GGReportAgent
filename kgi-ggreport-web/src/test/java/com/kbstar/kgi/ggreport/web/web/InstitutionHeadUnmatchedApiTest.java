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

/**
 * 기관장 정보 매칭 대기 후보(NEXT 72·77, U1~U4) — 수집 쪽이 보낸 후보(INSTITUTION_ID 없음)를 영업팀이 기관에 지정한다.
 * 준비 데이터는 JdbcTemplate 으로 넣는다(반입 API 는 2단계). 잠금 대상은 머리 행 자체이고 기관 지정은 이력 HEAD_MATCH 로 남는다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadUnmatchedApiTest extends HeadApiTestBase {

    private static String unmatched(long head) {
        return "/institution-heads/unmatched/" + head;
    }

    private static String assignBody(String inst) {
        return "{\"institution_id\":\"" + inst + "\"}";
    }

    @Test
    public void 목록은_가린_이름만_주고_감사_표에_UNMATCHED_LIST가_남는다() throws Exception {
        long head = insertUnmatchedHead("김후보", T1);
        MvcResult r = getAs("/institution-heads/unmatched", T2);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        String body = text(r);
        assertTrue(body, body.contains("김*보"));
        assertFalse(body.contains("김후보"));
        JsonNode row = null;
        for (JsonNode n : json(r).path("items")) {
            if (n.path("head_id").asLong() == head) {
                row = n;
            }
        }
        assertTrue(row != null);
        assertEquals("구청장", row.path("position").asText());
        assertEquals(2, row.path("open_item_count").asInt());
        assertEquals(T1, row.path("created_by").asText());
        assertFalse(row.path("created_verified").asBoolean());
        assertEquals("ORG-1", row.path("src_org_cd").asText());
        assertFalse(json(r).path("truncated").asBoolean());
        assertEquals(1, act("UNMATCHED_LIST", "OK"));
        assertEquals(403, getAs("/institution-heads/unmatched", DESIGNER).getResponse().getStatus());
    }

    @Test
    public void 상세는_원문을_주고_no_store이며_이미_매칭된_머리는_404다() throws Exception {
        long head = insertUnmatchedHead("김후보", T1);
        MvcResult r = getAs(unmatched(head), T2);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertTrue(r.getResponse().getHeader("Cache-Control").contains("no-store"));
        assertTrue(text(r).contains("김후보"));
        assertEquals(2, json(r).path("items").size());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='UNMATCHED_VIEW' AND OUTCOME='OK' AND HEAD_ID=?"
                + " AND INSTITUTION_ID='NONE' AND ACTOR_EMP_NO=?", head, T2));

        addHeadOk(INST, T1, "홍길동", "구청장");
        assertEquals(200, postJson(unmatched(head) + "/assign", T2, assignBody(INST)).getResponse().getStatus());
        assertEquals("매칭된 뒤에는 404", 404, getAs(unmatched(head), T2).getResponse().getStatus());
        assertEquals(404, getAs(unmatched(999999999L), T2).getResponse().getStatus());
        assertEquals(404, getAs("/institution-heads/unmatched/abc", T2).getResponse().getStatus());
    }

    @Test
    public void 기관을_지정하면_그_기관의_후보_머리가_되고_다시_지정하면_409다() throws Exception {
        addHeadOk(INST, T1, "홍길동", "구청장");
        long head = insertUnmatchedHead("김후보", T1);
        MvcResult r = postJson(unmatched(head) + "/assign", T2, assignBody(INST));
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("CANDIDATE_HEAD", json(r).path("result").asText());
        assertEquals(head, json(r).path("into_head_id").asLong());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_MATCH' AND HEAD_ID=? AND INSTITUTION_ID=?"
                + " AND ACTOR_EMP_NO=? AND SELF_FLAG=0", head, INST, T2));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND INSTITUTION_ID=?", head, INST));
        JsonNode detail = json(getAs(headPath(INST), T1));
        boolean seen = false;
        for (JsonNode ch : detail.path("candidate_heads")) {
            seen |= ch.path("head_id").asLong() == head;
        }
        assertTrue("상세의 candidate_heads 에 보인다", seen);

        MvcResult again = postJson(unmatched(head) + "/assign", T2, assignBody(INST));
        assertEquals(text(again), 409, again.getResponse().getStatus());
        assertEquals("STATE_CHANGED", code(json(again)));
        assertEquals(1, act("HEAD_MATCH", "BLOCKED"));
    }

    @Test
    public void 현_기관장과_이름이_같으면_칸을_그_머리로_옮겨_합친다() throws Exception {
        long cur = addHeadOk(INST, T1, "김후보", "구청장");
        long head = insertUnmatchedHead("김 후보", T1);   // 공백이 달라도 같은 이름으로 본다
        MvcResult r = postJson(unmatched(head) + "/assign", T2, assignBody(INST));
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("MERGED", json(r).path("result").asText());
        assertEquals(cur, json(r).path("into_head_id").asLong());
        assertEquals("MERGED", headStatus(head));
        assertEquals(Long.valueOf(cur), jdbc.queryForObject("SELECT MERGED_INTO_ID FROM INST_HEAD WHERE HEAD_ID=?", Long.class, head));
        assertEquals("칸이 현 머리의 후보로 옮겨졌다", 2,
                count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CANDIDATE'", cur));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_MERGE' AND HEAD_ID=? AND FROM_HEAD_ID=?", cur, head));
        assertEquals("CURRENT", headStatus(cur));
    }

    @Test
    public void 없는_기관은_422_형식_밖은_400_후보_머리가_열개면_409다() throws Exception {
        long head = insertUnmatchedHead("김후보", T1);
        MvcResult none = postJson(unmatched(head) + "/assign", T2, assignBody("no-such-institution"));
        assertEquals(text(none), 422, none.getResponse().getStatus());
        assertEquals("INSTITUTION_NOT_FOUND", code(json(none)));
        for (String bad : new String[]{"", "a b", "a/b", "{}"}) {
            String body = "{}".equals(bad) ? "{}" : assignBody(bad);
            assertEquals(bad, 400, postJson(unmatched(head) + "/assign", T2, body).getResponse().getStatus());
        }
        StringBuilder longId = new StringBuilder();
        for (int i = 0; i < 65; i++) {
            longId.append('a');
        }
        assertEquals(400, postJson(unmatched(head) + "/assign", T2, assignBody(longId.toString())).getResponse().getStatus());
        assertEquals("아직 매칭 대기", 0, count("SELECT COUNT(*) FROM INST_HEAD WHERE HEAD_ID=? AND INSTITUTION_ID IS NOT NULL", head));

        addHeadOk(INST, T1, "홍길동", "구청장");
        String[] names = {"가나다", "나다라", "다라마", "라마바", "마바사", "바사아", "사아자", "아자차", "자차카", "차카타"};
        for (String n : names) {
            assertEquals(202, postJson(headsPath(INST), T2, headJson(n, "구청장")).getResponse().getStatus());
        }
        MvcResult limit = postJson(unmatched(head) + "/assign", T2, assignBody(INST));
        assertEquals(text(limit), 409, limit.getResponse().getStatus());
        assertEquals("CANDIDATE_LIMIT", code(json(limit)));
    }

    @Test
    public void 기각은_영업팀이_하고_본인이_반입했으면_SELF_FLAG가_서며_디자이너는_403이다() throws Exception {
        long head = insertUnmatchedHead("김후보", T1);
        assertEquals(403, postJson(unmatched(head) + "/reject", DESIGNER, reason("관련 없음")).getResponse().getStatus());
        MvcResult r = postJson(unmatched(head) + "/reject", T1, reason("관련 없음"));
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("REJECTED", headStatus(head));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CANDIDATE'", head));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_REJECT' AND HEAD_ID=? AND SELF_FLAG=1"
                + " AND REASON IS NOT NULL AND INSTITUTION_ID IS NULL", head));
        assertEquals(1, act("UNMATCHED_REJECT", "OK"));
        assertEquals("이미 기각된 머리는 409", 409, postJson(unmatched(head) + "/reject", T2, reason("관련 없음")).getResponse().getStatus());
    }

    @Test
    public void 본인이_반입한_후보를_본인이_지정하고_확정할_수_있다_현_기관장이_없을_때() throws Exception {
        long head = insertUnmatchedHead("김후보", T1);
        MvcResult assign = postJson(unmatched(head) + "/assign", T1, assignBody(INST2));
        assertEquals(text(assign), 200, assign.getResponse().getStatus());
        assertEquals("CANDIDATE_HEAD", json(assign).path("result").asText());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_MATCH' AND HEAD_ID=? AND SELF_FLAG=1", head));
        MvcResult confirm = postJson(headsPath(INST2) + "/" + head + "/confirm", T1, "{}");
        assertEquals(text(confirm), 200, confirm.getResponse().getStatus());
        assertEquals("CURRENT", headStatus(head));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_CONFIRM' AND HEAD_ID=? AND SELF_FLAG=1", head));
        assertEquals(2, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'", head));
    }
}
