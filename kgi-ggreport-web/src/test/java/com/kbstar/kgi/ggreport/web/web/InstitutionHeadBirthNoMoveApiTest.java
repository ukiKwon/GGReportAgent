package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 생년월일은 머리 사이에서 자동으로 옮겨지지 않는다(planner 11-20 A1·B1, qa P2, security 발견 4).
 * 빈 머리 대체([기관장 추가])·매칭 합치기에서 확정 생년월일은 남고, 생년월일 후보는 기각된다. 다른 칸 후보는 지금처럼 옮긴다.
 * 카드 꼬리 '출처를 단 항목 N건·최근 확인'에도 생년월일은 세지 않는다(design 11-20 E).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadBirthNoMoveApiTest extends HeadApiTestBase {

    private static final String BIRTH = "1970-05-17";

    /** 이름·직위를 무효 처리해 생년월일만 남은 빈 머리를 만든다(InstitutionHeadBirthDateApiTest 와 같은 순서). */
    private long emptyHeadWithBirth() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        List<Long> ids = jdbc.queryForList("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'"
                + " AND FIELD_CD IN ('NAME','POSITION')", Long.class, head);
        for (Long id : ids) {
            MvcResult v = postJson(headPath(INST) + "/items/" + id + "/void", L1, reason("잘못 입력된 값"));
            assertEquals(text(v), 200, v.getResponse().getStatus());
        }
        assertTrue(json(getAs(headPath(INST), T1)).path("head_empty").asBoolean());
        return head;
    }

    @Test
    public void 빈_머리의_확정_생년월일은_새_머리로_안_가고_옛_행은_남는다() throws Exception {
        long oldHead = emptyHeadWithBirth();
        long newHead = addHeadOk(INST, L1, "홍길동", "구청장");   // 빈 머리 대체
        assertEquals("VOIDED", headStatus(oldHead));
        JsonNode h = json(getAs(headPath(INST), T1)).path("head");
        assertTrue(h.toString(), h.path("birth_date").isNull() || h.path("birth_date").isMissingNode());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='BIRTH_DATE' AND STATE_CD='CONFIRMED'", oldHead));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='BIRTH_DATE'", newHead));
    }

    @Test
    public void 빈_머리의_생년월일_후보는_기각되고_다른_후보는_옮겨진다() throws Exception {
        long oldHead = emptyHeadWithBirth();
        long birth = insertCandidateItem(oldHead, INST, "BIRTH_DATE", null, T2);
        jdbc.update("UPDATE INST_HEAD_ITEM SET VAL_DATE='1971-06-18' WHERE ITEM_ID=?", birth);
        long other = insertCandidateItem(oldHead, INST, "POSITION", "후보직위", T2);
        int logBefore = count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND REASON='BIRTH_NOT_MOVED'");

        long newHead = addHeadOk(INST, L1, "홍길동", "구청장");
        assertEquals("REJECTED", itemState(birth));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE ITEM_ID=? AND HEAD_ID=?", other, newHead));   // 다른 칸은 그대로 옮긴다
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='BIRTH_DATE'", newHead));
        assertEquals(logBefore + 1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND REASON='BIRTH_NOT_MOVED'"));
    }

    @Test
    public void 매칭_합치기도_생년월일_후보는_기각하고_나머지는_옮긴다() throws Exception {
        long cur = addHeadOk(INST, T1, "김후보", "구청장");
        long un = insertUnmatchedHead("김후보", T1);
        long birth = insertCandidateItem(un, null, "BIRTH_DATE", null, T1);
        jdbc.update("UPDATE INST_HEAD_ITEM SET VAL_DATE='" + BIRTH + "' WHERE ITEM_ID=?", birth);

        MvcResult r = postJson("/institution-heads/unmatched/" + un + "/assign", T2, "{\"institution_id\":\"" + INST + "\"}");
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("MERGED", json(r).path("result").asText());
        assertEquals("REJECTED", itemState(birth));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='BIRTH_DATE'", cur));
        assertEquals("NAME·POSITION 후보는 옮겨진다", 2, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CANDIDATE'", cur));
    }

    @Test
    public void 카드_꼬리_출처_건수와_최근_확인에_생년월일은_세지_않는다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        JsonNode before = json(getAs(headPath(INST), T1)).path("head");
        String body = "{\"head_id\":" + head + ",\"field_cd\":\"BIRTH_DATE\",\"date\":\"" + BIRTH + "\",\"source\":"
                + "{\"kind\":\"HOMEPAGE\",\"title\":\"시험 출처 문서\",\"checked_on\":\"2099-01-01\"}}";
        MvcResult a = postJson(headPath(INST) + "/items", L1, body);
        if (a.getResponse().getStatus() == 400) {   // 확인 날짜 상한이 있으면 오늘로(이 시험의 요지는 건수)
            addItemOk(INST, L1, itemDate(head, "BIRTH_DATE", BIRTH), 201);
        } else {
            assertEquals(text(a), 201, a.getResponse().getStatus());
        }
        JsonNode after = json(getAs(headPath(INST), T1)).path("head");
        assertEquals(before.path("source_count").asInt(), after.path("source_count").asInt());
        assertEquals(before.path("last_checked_on").asText(), after.path("last_checked_on").asText());
        assertEquals(BIRTH, after.path("birth_date").asText());
    }
}
