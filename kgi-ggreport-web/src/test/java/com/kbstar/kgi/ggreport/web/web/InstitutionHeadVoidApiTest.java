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
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 확정값 무효 권한(11-13 사용자 결정, security 중) — 남이 확정한 값은 넣은 사람이라도 팀장·부장만 무효한다. 본인이 넣고 본인이 확정한 값은 본인이 무효한다.
 * 같은 값 재확인은 앞 값의 확정자를 이어받는다(재입력으로 '내 값' 만들기 우회 차단). 상세 응답 can_void 가 같은 규칙이다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadVoidApiTest extends HeadApiTestBase {

    private static final String END1 = "2030-06-30";
    private static final String END2 = "2031-01-01";

    private static String voidPath(long itemId) {
        return headPath(INST) + "/items/" + itemId + "/void";
    }

    private MvcResult voidItem(long itemId, String emp) throws Exception {
        return postJson(voidPath(itemId), emp, reason("잘못 입력된 값"));
    }

    private MvcResult confirm(long itemId, String emp) throws Exception {
        return postJson(headPath(INST) + "/items/" + itemId + "/confirm", emp, "{}");
    }

    private long itemOf(long head, String field) {
        return jdbc.queryForObject("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD=? AND STATE_CD='CONFIRMED'", Long.class, head, field);
    }

    private String col(String c, long itemId) {
        return jdbc.queryForObject("SELECT " + c + " FROM INST_HEAD_ITEM WHERE ITEM_ID=?", String.class, itemId);
    }

    private JsonNode head(String emp) throws Exception {
        return json(getAs(headPath(INST), emp)).path("head");
    }

    private int denied(String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?", path);
    }

    @Test
    public void 본인이_낸_후보를_팀장이_확정하면_본인도_무효할_수_없다_NOT_OWNER() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        addItemOk(INST, L1, itemDate(head, "TERM_END", END1), 201);
        long x = addItemOk(INST, T1, itemDate(head, "TERM_END", END2), 202);   // T1 의 충돌 후보
        assertEquals(200, confirm(x, L2).getResponse().getStatus());
        assertEquals(T1, col("CREATED_BY", x));
        assertEquals(L2, col("DECIDED_BY", x));
        assertFalse(head(T1).path("fields").path("TERM_END").path("can_void").asBoolean());
        assertTrue(head(L1).path("fields").path("TERM_END").path("can_void").asBoolean());
        int before = denied(voidPath(x));
        MvcResult r = voidItem(x, T1);
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals("NOT_OWNER", code(json(r)));
        assertEquals("CONFIRMED", itemState(x));
        assertEquals("접근 이력에 DENIED", before + 1, denied(voidPath(x)));
        assertEquals("감사 표에 DENIED", 1, act("ITEM_VOID", "DENIED"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_VOID' AND ITEM_ID=?", x));
    }

    @Test
    public void 본인이_넣고_확정한_값은_본인이_무효한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");   // 현 기관장 없음 → 직접 입력이 곧 확정(입력·확정자 T1)
        long pos = itemOf(head, "POSITION");
        assertEquals(T1, col("DECIDED_BY", pos));
        long photo = photoOk(INST, T1, head);
        assertTrue(head(T1).path("fields").path("POSITION").path("can_void").asBoolean());
        assertFalse(head(T2).path("fields").path("POSITION").path("can_void").asBoolean());
        assertTrue(head(T1).path("photo").path("can_void").asBoolean());
        assertFalse(head(T2).path("photo").path("can_void").asBoolean());
        long again = addItemOk(INST, T1, itemText(head, "POSITION", "구청장"), 201);   // 본인 값을 본인이 재확인 — 확정자 T1 유지
        assertEquals(T1, col("DECIDED_BY", again));
        MvcResult v = voidItem(again, T1);
        assertEquals(text(v), 200, v.getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_VOID' AND ITEM_ID=? AND SELF_FLAG=1", again));
        long c = insertCandidateItem(head, INST, "CAREER", "서울특별시 행정국장", T1);   // 충돌 없는 본인 후보를 본인이 확정
        assertEquals(200, confirm(c, T1).getResponse().getStatus());
        assertEquals(T1, col("DECIDED_BY", c));
        assertEquals(200, voidItem(c, T1).getResponse().getStatus());
        assertEquals(200, postJson(headPath(INST) + "/photos/" + photo + "/void", T1, reason("잘못 올림")).getResponse().getStatus());
    }

    @Test
    public void 팀장과_부장은_남이_넣고_확정한_값도_무효한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        assertTrue(head(L1).path("fields").path("NAME").path("can_void").asBoolean());
        assertEquals(200, voidItem(itemOf(head, "POSITION"), L1).getResponse().getStatus());
        assertEquals(200, voidItem(itemOf(head, "NAME"), D1).getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_VOID' AND ACTOR_EMP_NO=? AND SELF_FLAG=0", D1));
    }

    @Test
    public void 남이_확정한_값만_있는_머리는_입력자가_비워_바로_확정으로_바꿀_수_없다() throws Exception {
        addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult cand = postJson(headsPath(INST), T2, headJson("김철수", "구청장"));
        assertEquals(text(cand), 202, cand.getResponse().getStatus());
        long h2 = json(cand).path("head_id").asLong();
        assertEquals(200, postJson(headsPath(INST) + "/" + h2 + "/confirm", L2, "{}").getResponse().getStatus());
        List<Long> ids = jdbc.queryForList("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED' ORDER BY ITEM_ID", Long.class, h2);
        for (Long id : ids) {
            assertEquals(T2, col("CREATED_BY", id));
            MvcResult r = voidItem(id, T2);
            assertEquals(text(r), 403, r.getResponse().getStatus());
            assertEquals("NOT_OWNER", code(json(r)));
        }
        assertEquals(ids.size(), act("ITEM_VOID", "DENIED"));
        assertFalse(json(getAs(headPath(INST), T2)).path("head_empty").asBoolean());
        MvcResult again = postJson(headsPath(INST), T2, headJson("박영희", "구청장"));
        assertEquals("비우지 못했으니 새 등록은 후보(충돌)", 202, again.getResponse().getStatus());
        assertTrue(json(again).path("conflict").asBoolean());
        assertTrue(json(again).path("voided_head_id").isNull());
        assertEquals("CURRENT", headStatus(h2));
    }

    @Test
    public void 같은_값_재입력이나_같은_값_후보_확정으로_남의_확정값을_내_값으로_바꿔_무효하는_우회는_막힌다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long old = itemOf(head, "POSITION");
        long mine = addItemOk(INST, T2, itemText(head, "POSITION", "구청장"), 201);   // A5 같은 값 재확인
        assertEquals("SUPERSEDED", itemState(old));
        assertEquals(T2, col("CREATED_BY", mine));
        assertEquals("확정자는 앞 값의 L1 을 이어받는다", L1, col("DECIDED_BY", mine));
        assertFalse(head(T2).path("fields").path("POSITION").path("can_void").asBoolean());
        assertEquals("NOT_OWNER", code(json(voidItem(mine, T2))));
        long imp = insertCandidateItem(head, INST, "NAME", "홍길동", T2);   // 같은 값 반입 후보 — 충돌 없음
        assertEquals(200, confirm(imp, T2).getResponse().getStatus());
        assertEquals(L1, col("DECIDED_BY", imp));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_CONFIRM' AND ITEM_ID=? AND ACTOR_EMP_NO=?", imp, T2));
        assertEquals("NOT_OWNER", code(json(voidItem(imp, T2))));
        assertEquals("CONFIRMED", itemState(imp));
    }
}
