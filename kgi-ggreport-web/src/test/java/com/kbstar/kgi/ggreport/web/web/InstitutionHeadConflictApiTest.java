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
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * 기관장 정보 충돌·권한(NEXT 72·77, M6·Q1·Q2). 칸 입력 → 충돌 후보 → 확정·기각·무효·머리 교체.
 * 시드 계정: 영업팀 T1·T2, 영업팀장 L1·L2, 영업부장 D1.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadConflictApiTest extends HeadApiTestBase {

    private static final String END1 = "2030-06-30";
    private static final String END2 = "2031-01-01";

    private String items(String suffix) {
        return headPath(INST) + "/items/" + suffix;
    }

    private MvcResult confirm(long itemId, String emp) throws Exception {
        return postJson(items(itemId + "/confirm"), emp, "{}");
    }

    private MvcResult reject(long itemId, String emp) throws Exception {
        return postJson(items(itemId + "/reject"), emp, reason("잘못 입력된 값"));
    }

    private int denied(String path) {
        return count("SELECT COUNT(*) FROM ACCESS_LOG WHERE EVENT_TYPE='DENIED' AND REQ_PATH=?", path);
    }

    /** 팀장 L1 이 기관장을 등록하고 임기 만료일 C 를 직접 확정한 상태(C 의 입력·확정자 = L1) — [head, C] 를 돌려준다. */
    private long[] headWithEndByLead() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long c = addItemOk(INST, L1, itemDate(head, "TERM_END", END1), 201);
        return new long[]{head, c};
    }

    @Test
    public void 칸_입력은_빈_칸이면_확정_같은_값이면_대체_다른_값이면_충돌_후보다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long a = addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        assertEquals("CONFIRMED", itemState(a));
        long b = addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        assertEquals("같은 값을 다시 확인하면 이전 행은 대체된다", "SUPERSEDED", itemState(a));
        assertEquals("CONFIRMED", itemState(b));
        assertEquals(Long.valueOf(b), jdbc.queryForObject("SELECT SUPERSEDED_BY_ID FROM INST_HEAD_ITEM WHERE ITEM_ID=?", Long.class, a));
        MvcResult x = postJson(headPath(INST) + "/items",T2, itemDate(head, "TERM_END", END2));
        assertEquals(text(x), 202, x.getResponse().getStatus());
        assertTrue(json(x).path("conflict").asBoolean());
        assertEquals("CANDIDATE", itemState(json(x).path("item_id").asLong()));
        assertEquals("확정값은 그대로", "CONFIRMED", itemState(b));
    }

    @Test
    public void 팀원은_충돌_후보를_확정할_수_없다_LEAD_ONLY() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        long x = addItemOk(INST, T2, itemDate(head, "TERM_END", END2), 202);
        String path = items(x + "/confirm");
        int before = denied(path);
        MvcResult r = confirm(x, T1);
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals("LEAD_ONLY", code(json(r)));
        assertEquals(before + 1, denied(path));
        assertEquals("CANDIDATE", itemState(x));
        assertEquals(1, act("ITEM_CONFIRM", "DENIED"));
    }

    @Test
    public void 팀장이_낸_충돌_후보는_본인이_확정할_수_없다_SELF_RESOLVE() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        long x = addItemOk(INST, L1, itemDate(head, "TERM_END", END2), 202);
        MvcResult r = confirm(x, L1);
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals("SELF_RESOLVE", code(json(r)));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE ITEM_ID=? AND STATE_CD='CANDIDATE'", x));
    }

    @Test
    public void 확정값을_넣은_팀장은_충돌_후보를_기각해_자기_값을_지킬_수_없지만_확정으로_양보할_수는_있다() throws Exception {
        long[] hc = headWithEndByLead();
        long x = addItemOk(INST, T1, itemDate(hc[0], "TERM_END", END2), 202);
        MvcResult guard = reject(x, L1);
        assertEquals(text(guard), 403, guard.getResponse().getStatus());
        assertEquals("OWN_VALUE_GUARD", code(json(guard)));
        assertEquals("CANDIDATE", itemState(x));
        MvcResult gave = confirm(x, L1);
        assertEquals(text(gave), 200, gave.getResponse().getStatus());
        assertEquals("CONFIRMED", itemState(x));
        assertEquals("SUPERSEDED", itemState(hc[1]));
        assertEquals(hc[1], json(gave).path("superseded_item_id").asLong());
    }

    @Test
    public void 영업부장은_팀장과_같은_자격으로_기각하고_이력에_역할이_남는다() throws Exception {
        long[] hc = headWithEndByLead();
        long x = addItemOk(INST, T1, itemDate(hc[0], "TERM_END", END2), 202);
        MvcResult r = reject(x, D1);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("REJECTED", itemState(x));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND ITEM_ID=? AND ACTOR_EMP_NO=?"
                + " AND ACTOR_ROLE='영업부장' AND SELF_FLAG=0 AND REASON IS NOT NULL", x, D1));
    }

    @Test
    public void 다른_팀장은_충돌_후보를_확정하고_이전_값은_대체된다() throws Exception {
        long[] hc = headWithEndByLead();
        long x = addItemOk(INST, T1, itemDate(hc[0], "TERM_END", END2), 202);
        MvcResult r = confirm(x, L2);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("SUPERSEDED", itemState(hc[1]));
        assertEquals("CONFIRMED", itemState(x));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_CONFIRM' AND ITEM_ID=? AND FROM_ITEM_ID=?"
                + " AND SELF_FLAG=0 AND ACTOR_EMP_NO=?", x, hc[1], L2));
    }

    @Test
    public void 충돌_없는_후보는_영업팀_누구나_확정하고_본인이면_SELF_FLAG가_선다() throws Exception {
        long head = addHeadOk(INST, T2, "홍길동", "구청장");
        long x = insertCandidateItem(head, INST, "POSITION", "구청장", T1);   // 반입 후보 — 확정값과 같은 값(충돌 없음)
        MvcResult r = confirm(x, T1);
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("CONFIRMED", itemState(x));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_CONFIRM' AND ITEM_ID=? AND SELF_FLAG=1", x));
    }

    @Test
    public void 팀원은_자기_충돌_후보를_회수할_수_있다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        long x = addItemOk(INST, T2, itemDate(head, "TERM_END", END2), 202);
        MvcResult other = reject(x, T1);
        assertEquals("남의 충돌 후보는 팀원이 기각할 수 없다", 403, other.getResponse().getStatus());
        MvcResult mine = reject(x, T2);
        assertEquals(text(mine), 200, mine.getResponse().getStatus());
        assertEquals("REJECTED", itemState(x));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND ITEM_ID=? AND SELF_FLAG=1", x));
    }

    @Test
    public void 확정된_칸의_확정과_후보_칸의_무효는_409다() throws Exception {
        long[] hc = headWithEndByLead();
        MvcResult c = confirm(hc[1], L2);
        assertEquals(text(c), 409, c.getResponse().getStatus());
        assertEquals("STATE_CHANGED", code(json(c)));
        long x = addItemOk(INST, T1, itemDate(hc[0], "TERM_END", END2), 202);
        MvcResult v = postJson(items(x + "/void"), L1, reason("잘못 입력된 값"));
        assertEquals(text(v), 409, v.getResponse().getStatus());
        assertEquals("CANDIDATE", itemState(x));
    }

    @Test
    public void 확정값_무효는_넣은_사람이나_팀장만_한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long a = addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        MvcResult other = postJson(items(a + "/void"), T2, reason("잘못 입력된 값"));
        assertEquals(text(other), 403, other.getResponse().getStatus());
        assertEquals("NOT_OWNER", code(json(other)));
        MvcResult lead = postJson(items(a + "/void"), L1, reason("잘못 입력된 값"));
        assertEquals(text(lead), 200, lead.getResponse().getStatus());
        assertEquals("VOIDED", itemState(a));
        long b = addItemOk(INST, T2, itemText(head, "CAREER", "서울특별시 행정국장"), 201);
        MvcResult own = postJson(items(b + "/void"), T2, reason("내가 넣은 값"));
        assertEquals(text(own), 200, own.getResponse().getStatus());
        assertEquals("VOIDED", itemState(b));
    }

    @Test
    public void 후보_머리_교체는_팀장_둘째_사람이_확정한다() throws Exception {
        long old = addHeadOk(INST, T1, "홍길동", "구청장");
        MvcResult cand = postJson(headsPath(INST), L1, headJson("김철수", "구청장"));
        assertEquals(text(cand), 202, cand.getResponse().getStatus());
        assertTrue(json(cand).path("conflict").asBoolean());
        long h2 = json(cand).path("head_id").asLong();
        String confirmPath = headsPath(INST) + "/" + h2 + "/confirm";

        MvcResult t1 = postJson(confirmPath, T1, "{}");
        assertEquals(text(t1), 403, t1.getResponse().getStatus());
        assertEquals("LEAD_ONLY", code(json(t1)));
        MvcResult self = postJson(confirmPath, L1, "{}");
        assertEquals(text(self), 403, self.getResponse().getStatus());
        assertEquals("SELF_RESOLVE", code(json(self)));
        MvcResult ok = postJson(confirmPath, L2, "{}");
        assertEquals(text(ok), 200, ok.getResponse().getStatus());

        assertEquals("FORMER", headStatus(old));
        assertEquals("CURRENT", headStatus(h2));
        assertEquals(Long.valueOf(h2), currentHeadId(INST));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CANDIDATE'", h2));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='HEAD_REPLACE' AND HEAD_ID=? AND FROM_HEAD_ID=?", h2, old));
        String list = text(getAs("/institution-heads", T1));
        assertFalse("이전 기관장 이름은 목록에 없다", list.contains("홍길동") || list.contains("홍*동"));
        assertTrue(list.contains("김*수"));
        String detail = text(getAs(headPath(INST), T1));
        assertFalse("이전 기관장 이름은 상세에 없다", detail.contains("홍길동"));
        assertTrue(detail.contains("김철수"));
    }

    @Test
    public void 현_기관장을_만든_팀장은_남의_후보_머리를_기각해_지킬_수_없고_부장은_기각한다() throws Exception {
        long cur = addHeadOk(INST, L1, "홍길동", "구청장");
        long cand = json(postJson(headsPath(INST), T1, headJson("김철수", "구청장"))).path("head_id").asLong();
        String rejectPath = headsPath(INST) + "/" + cand + "/reject";
        MvcResult own = postJson(rejectPath, L1, reason("근거 부족"));
        assertEquals(text(own), 403, own.getResponse().getStatus());
        assertEquals("OWN_VALUE_GUARD", code(json(own)));
        MvcResult head = postJson(rejectPath, D1, reason("근거 부족"));
        assertEquals(text(head), 200, head.getResponse().getStatus());
        assertEquals("REJECTED", headStatus(cand));
        assertEquals("CURRENT", headStatus(cur));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND STATE_CD='CANDIDATE'", cand));
    }

    @Test
    public void 교체_확정_뒤_옛_기관장의_열린_후보는_자동_기각되고_집계에서_빠진다_qa_P2_1() throws Exception {
        long old = addHeadOk(INST, T1, "홍길동", "구청장");
        long open = addItemOk(INST, T2, itemText(old, "POSITION", "부구청장"), 202);
        long h2 = json(postJson(headsPath(INST), L1, headJson("김철수", "구청장"))).path("head_id").asLong();
        assertTrue("교체 확정 전에는 집계에 잡힌다", queueOpenCount(INST) >= 1);

        MvcResult ok = postJson(headsPath(INST) + "/" + h2 + "/confirm", L2, "{}");
        assertEquals(text(ok), 200, ok.getResponse().getStatus());

        assertEquals("FORMER", headStatus(old));
        assertEquals("REJECTED", itemState(open));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_REJECT' AND HEAD_ID=? AND REASON='HEAD_REPLACED'"
                + " AND ACTOR_EMP_NO=?", old, L2));
        assertEquals("집계에서 빠진다", 0, queueOpenCount(INST));
        for (JsonNode n : json(getAs("/institution-heads", T1))) {
            if (INST.equals(n.path("institution_id").asText())) {
                assertEquals(0, n.path("open_candidates").asInt());
            }
        }
    }

    private int queueOpenCount(String inst) throws Exception {
        for (JsonNode n : json(getAs("/institution-heads/candidates", T1)).path("institutions")) {
            if (inst.equals(n.path("institution_id").asText())) {
                return n.path("open_count").asInt();
            }
        }
        return 0;
    }

    @Test
    public void 확정값을_무효로_만들어_충돌을_없앤_뒤_자기_후보를_확정하는_우회는_막힌다_security_중_1() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long c = addItemOk(INST, T1, itemDate(head, "TERM_END", END1), 201);
        long x = addItemOk(INST, L1, itemDate(head, "TERM_END", END2), 202);   // 팀장 L1 의 충돌 후보
        MvcResult v = postJson(items(c + "/void"), L1, reason("잘못 입력된 값"));
        assertEquals(text(v), 403, v.getResponse().getStatus());
        assertEquals("OWN_VALUE_GUARD", code(json(v)));
        assertEquals("CONFIRMED", itemState(c));
        assertEquals("CANDIDATE", itemState(x));
        MvcResult other = postJson(items(c + "/void"), D1, reason("잘못 입력된 값"));   // 같은 칸에 후보가 없는 부장은 무효 처리할 수 있다
        assertEquals(text(other), 200, other.getResponse().getStatus());
    }

    @Test
    public void 다른_사람의_열린_후보를_기각한_뒤_자기_후보를_확정하는_우회는_막힌다_security_중_1() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long y = insertCandidateItem(head, INST, "FIRST_TAKE_OFFICE", null, T2);   // 확정값 없는 칸의 반입 후보
        jdbc.update("UPDATE INST_HEAD_ITEM SET VAL_DATE=? WHERE ITEM_ID=?", "2020-01-01", y);
        long x = addItemOk(INST, L1, itemDate(head, "FIRST_TAKE_OFFICE", "2021-01-01"), 202);   // 확정값이 없어도 열린 후보가 있으면 후보로 들어간다
        MvcResult r = reject(y, L1);
        assertEquals(text(r), 403, r.getResponse().getStatus());
        assertEquals("OWN_VALUE_GUARD", code(json(r)));
        assertEquals("CANDIDATE", itemState(y));
        MvcResult self = confirm(x, L1);
        assertEquals("본인 후보는 본인이 확정할 수 없다", "SELF_RESOLVE", code(json(self)));
        MvcResult head1 = reject(y, D1);
        assertEquals(text(head1), 200, head1.getResponse().getStatus());
    }

    @Test
    public void 칸_확정과_기각_무효_응답에_head_id가_있고_대체_이력이_남는다_qa_P3() throws Exception {
        long[] hc = headWithEndByLead();
        long x = addItemOk(INST, T1, itemDate(hc[0], "TERM_END", END2), 202);
        MvcResult r = confirm(x, L2);
        assertEquals(hc[0], json(r).path("head_id").asLong());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='ITEM_SUPERSEDE' AND ITEM_ID=? AND FROM_ITEM_ID=?", x, hc[1]));
        assertEquals("ACT 의 HEAD_ID 도 채워진다", 1, count("SELECT COUNT(*) FROM INST_HEAD_ACT WHERE ACTION_CD='ITEM_CONFIRM'"
                + " AND OUTCOME='OK' AND HEAD_ID=? AND TARGET_ID=?", hc[0], x));
        MvcResult v = postJson(items(x + "/void"), L1, reason("잘못 입력된 값"));
        assertEquals(hc[0], json(v).path("head_id").asLong());
    }

    @Test
    public void 후보_머리는_열개까지고_학력은_열개까지다() throws Exception {
        long cur = addHeadOk(INST, T1, "홍길동", "구청장");
        String[] names = {"가나다", "나다라", "다라마", "라마바", "마바사", "바사아", "사아자", "아자차", "자차카", "차카타", "카타파"};
        for (int i = 0; i < 10; i++) {
            MvcResult r = postJson(headsPath(INST), T2, headJson(names[i], "구청장"));
            assertEquals(text(r), 202, r.getResponse().getStatus());
        }
        MvcResult over = postJson(headsPath(INST), T2, headJson(names[10], "구청장"));
        assertEquals(text(over), 409, over.getResponse().getStatus());
        assertEquals("CANDIDATE_LIMIT", code(json(over)));

        for (int i = 1; i <= 10; i++) {
            addItemOk(INST, T1, itemText(cur, "EDU", "학력 항목 " + (char) ('가' + i)), 201);
        }
        MvcResult eleventh = postJson(headPath(INST) + "/items",T1, itemText(cur, "EDU", "학력 항목 열하나"));
        assertEquals(text(eleventh), 409, eleventh.getResponse().getStatus());
        assertEquals("ITEM_LIMIT", code(json(eleventh)));
    }

    @Test
    public void 후보_머리의_칸은_머리째로만_확정한다_CONFIRM_VIA_HEAD() throws Exception {
        addHeadOk(INST, T1, "홍길동", "구청장");
        long cand = json(postJson(headsPath(INST), T2, headJson("김철수", "구청장"))).path("head_id").asLong();
        long item = jdbc.queryForObject("SELECT MIN(ITEM_ID) FROM INST_HEAD_ITEM WHERE HEAD_ID=?", Long.class, cand);
        MvcResult r = confirm(item, L2);
        assertEquals(text(r), 409, r.getResponse().getStatus());
        assertEquals("CONFIRM_VIA_HEAD", code(json(r)));
        MvcResult rej = reject(item, T2);   // 본인 후보 칸의 기각(회수)은 허용
        assertEquals(text(rej), 200, rej.getResponse().getStatus());
    }

    @Test
    public void 후보_머리_안에서_같은_칸이_서로_다르면_확정할_수_없다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long cand = json(postJson(headsPath(INST), T2, headJson("김철수", "구청장"))).path("head_id").asLong();
        insertCandidateItem(cand, INST, "NAME", "김영희", T2);   // 같은 칸에 다른 후보
        MvcResult r = postJson(headsPath(INST) + "/" + cand + "/confirm", L2, "{}");
        assertEquals(text(r), 409, r.getResponse().getStatus());
        assertEquals("HEAD_ITEMS_CONFLICT", code(json(r)));
        assertEquals("CURRENT", headStatus(head));
        assertNotEquals("CURRENT", headStatus(cand));
        JsonNode detail = json(getAs(headPath(INST), L1));
        assertEquals(1, detail.path("candidate_heads").size());
    }
}
