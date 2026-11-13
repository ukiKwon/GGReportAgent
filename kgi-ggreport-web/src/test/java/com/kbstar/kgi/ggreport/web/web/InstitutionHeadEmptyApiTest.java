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
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * 빈 머리(권한대행 밖 확정 값·사진을 모두 무효 처리한 현 기관장) = 현 기관장 없음(11-13 사용자 결정 가, 화면 hc.isEmptyHead 와 같은 기준).
 * head_empty → [기관장 추가] 바로 확정·빈 머리 VOIDED(FORMER 아님) → 열린 후보는 새 머리로 후보 그대로 → 후보 기관장은 충돌 아님 →
 * 칸 입력·사진 올림·복원 409 NO_HEAD → 사진만 남은 머리의 사진 무효는 자동 복원 없음.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadEmptyApiTest extends HeadApiTestBase {

    private MvcResult voidItem(long itemId, String emp) throws Exception {
        return postJson(headPath(INST) + "/items/" + itemId + "/void", emp, reason("잘못 입력된 값"));
    }

    /** 머리의 확정 칸을 전부 팀장 L1 이 무효 처리한다. 마지막 응답을 돌려준다. */
    private JsonNode voidAll(long head) throws Exception {
        JsonNode last = null;
        List<Long> ids = jdbc.queryForList("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED' ORDER BY ITEM_ID",
                Long.class, head);
        for (Long id : ids) {
            MvcResult v = voidItem(id, L1);
            assertEquals(text(v), 200, v.getResponse().getStatus());
            last = json(v);
        }
        return last;
    }

    private long emptyHead() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        voidAll(head);
        return head;
    }

    private JsonNode detail(String emp) throws Exception {
        MvcResult r = getAs(headPath(INST), emp);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        return json(r);
    }

    private long headOfItem(long itemId) {
        return jdbc.queryForObject("SELECT HEAD_ID FROM INST_HEAD_ITEM WHERE ITEM_ID=?", Long.class, itemId);
    }

    @Test
    public void 마지막_확정_칸을_무효하면_응답과_상세가_빈_머리를_알리고_목록에서_빠진다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        assertFalse(detail(T1).path("head_empty").asBoolean());
        long name = jdbc.queryForObject("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='NAME'", Long.class, head);
        assertFalse("직위가 남아 있으면 비지 않았다", json(voidItem(name, L1)).path("head_empty").asBoolean());
        assertTrue(voidAll(head).path("head_empty").asBoolean());
        JsonNode d = detail(T1);
        assertTrue(d.path("head_empty").asBoolean());
        assertEquals("머리는 그대로 내려온다(화면 호환)", head, d.path("head").path("head_id").asLong());
        assertTrue(d.path("head").path("name").isNull());
        assertEquals("정리는 다음 등록 때 — 지금은 CURRENT", "CURRENT", headStatus(head));
        for (JsonNode n : json(getAs("/institution-heads", T1))) {
            assertNotEquals("빈 머리는 현 기관장 목록에 없다", INST, n.path("institution_id").asText());
        }
    }

    @Test
    public void 현_기관장이_없는_기관도_head_empty가_참이다() throws Exception {
        JsonNode j = json(getAs(headPath(INST2), T1));
        assertTrue(j.path("head").isNull());
        assertTrue(j.path("head_empty").asBoolean());
    }

    @Test
    public void 빈_머리에서_기관장_추가는_바로_확정이고_빈_머리는_이전_기관장이_아니라_VOIDED다() throws Exception {
        long empty = emptyHead();
        MvcResult r = postJson(headsPath(INST), T1, headJson("김철수", "구청장"));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        JsonNode j = json(r);
        assertEquals("CURRENT", j.path("state").asText());
        assertFalse(j.path("conflict").asBoolean());
        assertEquals(empty, j.path("voided_head_id").asLong());
        assertEquals(0, j.path("moved_item_count").asInt());
        long h2 = j.path("head_id").asLong();
        assertEquals("VOIDED", headStatus(empty));
        assertEquals(Long.valueOf(h2), currentHeadId(INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='CURRENT'", INST));
        assertEquals("이름 없는 머리가 이전 기관장 이력에 쌓이지 않는다", 0,
                count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=? AND STATUS_CD='FORMER'", INST));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_VOID' AND HEAD_ID=? AND FROM_HEAD_ID=?"
                + " AND ACTOR_EMP_NO=? AND SELF_FLAG=0 AND REASON='BY_ADD'", h2, empty, T1));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_REPLACE' AND FROM_HEAD_ID=?", empty));
        assertEquals("누가·어느 버튼은 감사 표에", 1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='HEAD_ADD'"
                + " AND OUTCOME='OK' AND HEAD_ID=? AND ACTOR_EMP_NO=?", h2, T1));
        JsonNode d = detail(T1);
        assertFalse(d.path("head_empty").asBoolean());
        assertEquals("김철수", d.path("head").path("name").asText());
    }

    @Test
    public void 빈_머리의_열린_후보는_새_현_기관장으로_옮겨져_후보로_남는다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long cand = addItemOk(INST, T2, itemText(head, "POSITION", "부구청장"), 202);
        voidAll(head);
        JsonNode d = detail(T1);
        assertTrue(d.path("head_empty").asBoolean());
        assertEquals("빈 머리에서도 후보는 보인다", 1, d.path("candidates").size());
        MvcResult r = postJson(headsPath(INST), T1, headJson("김철수", "구청장"));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        long h2 = json(r).path("head_id").asLong();
        assertEquals(1, json(r).path("moved_item_count").asInt());
        assertEquals("CANDIDATE", itemState(cand));
        assertEquals(h2, headOfItem(cand));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_MERGE' AND HEAD_ID=? AND FROM_HEAD_ID=?", h2, head));
        JsonNode c = detail(T1).path("candidates").get(0);
        assertEquals(cand, c.path("item_id").asLong());
        assertTrue("새 확정값(구청장)과 달라 충돌 — 팀장·부장 처리", c.path("conflict").asBoolean());
        assertEquals("LEAD_ONLY", code(json(postJson(headPath(INST) + "/items/" + cand + "/confirm", T1, "{}"))));
    }

    @Test
    public void 빈_머리면_후보_기관장은_충돌이_아니고_확정해도_빈_머리의_후보는_기각되지_않는다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long open = addItemOk(INST, T2, itemText(head, "POSITION", "부구청장"), 202);
        MvcResult add = postJson(headsPath(INST), T2, headJson("김철수", "구청장"));
        assertEquals(text(add), 202, add.getResponse().getStatus());
        long cand = json(add).path("head_id").asLong();
        voidAll(head);
        JsonNode q = null;
        for (JsonNode n : json(getAs("/institution-heads/candidates", T1)).path("institutions")) {
            if (INST.equals(n.path("institution_id").asText())) {
                q = n;
            }
        }
        assertEquals("대기열도 충돌로 세지 않는다", 0, q.path("conflict_count").asInt());
        assertTrue(detail(T2).path("candidate_heads").get(0).path("can_confirm").asBoolean());
        MvcResult ok = postJson(headsPath(INST) + "/" + cand + "/confirm", T2, "{}");
        assertEquals(text(ok), 200, ok.getResponse().getStatus());
        assertTrue(json(ok).path("former_head_id").isNull());
        assertEquals(head, json(ok).path("voided_head_id").asLong());
        assertEquals("VOIDED", headStatus(head));
        assertEquals("CURRENT", headStatus(cand));
        assertEquals("CANDIDATE", itemState(open));
        assertEquals("확정한 머리로 옮겨진다", cand, headOfItem(open));
        assertEquals("옮긴 후보는 함께 확정되지 않는다", 2, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CONFIRMED'", cand));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND REASON='HEAD_REPLACED' AND HEAD_ID=?", head));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_VOID' AND HEAD_ID=? AND FROM_HEAD_ID=? AND REASON='BY_CONFIRM'", cand, head));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_CONFIRM' AND HEAD_ID=? AND SELF_FLAG=1", cand));
    }

    @Test
    public void 빈_머리에는_칸_입력과_사진_올리기가_409_NO_HEAD다() throws Exception {
        long empty = emptyHead();
        MvcResult item = postJson(headPath(INST) + "/items", T1, itemDate(empty, "TERM_END", "2030-06-30"));
        assertEquals(text(item), 409, item.getResponse().getStatus());
        assertEquals("NO_HEAD", code(json(item)));
        MvcResult photo = upload(INST, T1, empty, "face.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(text(photo), 409, photo.getResponse().getStatus());
        assertEquals("NO_HEAD", code(json(photo)));
        assertEquals(1, act("ITEM_ADD", "BLOCKED"));
        assertEquals(1, act("PHOTO_UPLOAD", "BLOCKED"));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_PHOTO WHERE HEAD_ID=?", empty));
    }

    @Test
    public void 사진만_남은_머리는_비지_않았고_그_사진을_무효하면_되살리지_않고_빈_머리가_된다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long p1 = photoOk(INST, L1, head);
        long p2 = photoOk(INST, L1, head);
        assertEquals("REPLACED", photoState(p1));
        voidAll(head);
        assertFalse("사진이 남아 있으면 비지 않았다", detail(T1).path("head_empty").asBoolean());
        MvcResult v = postJson(headPath(INST) + "/photos/" + p2 + "/void", L1, reason("잘못 올림"));
        assertEquals(text(v), 200, v.getResponse().getStatus());
        assertTrue(json(v).path("restored_photo_id").isNull());
        assertTrue(json(v).path("head_empty").asBoolean());
        assertEquals("REPLACED", photoState(p1));
        MvcResult back = postJson(headPath(INST) + "/photos/" + p1 + "/restore", L1, "{}");
        assertEquals(text(back), 409, back.getResponse().getStatus());
        assertEquals("NO_HEAD", code(json(back)));
    }

    @Test
    public void 권한대행_칸만_남은_머리도_비었고_그_칸은_새_머리로_옮기지_않는다() throws Exception {
        MvcResult a = postJson(headsPath(INST), L1, "{\"name\":\"홍길동\",\"position\":\"구청장\",\"acting\":false,\"source\":" + source() + "}");
        assertEquals(text(a), 201, a.getResponse().getStatus());
        long head = json(a).path("head_id").asLong();
        long acting = jdbc.queryForObject("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='ACTING'", Long.class, head);
        for (String f : new String[]{"NAME", "POSITION"}) {
            long id = jdbc.queryForObject("SELECT ITEM_ID FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD=?", Long.class, head, f);
            assertEquals(200, voidItem(id, L1).getResponse().getStatus());
        }
        assertEquals("CONFIRMED", itemState(acting));
        assertTrue(detail(T1).path("head_empty").asBoolean());
        MvcResult r = postJson(headsPath(INST), T1, headJson("김철수", "구청장"));
        assertEquals(text(r), 201, r.getResponse().getStatus());
        assertEquals("VOIDED", headStatus(head));
        assertEquals("권한대행 확정값은 빈 머리에 남는다(머리째 숨김)", head, headOfItem(acting));
        assertFalse(detail(T1).path("head").path("fields").has("ACTING"));
    }
}
