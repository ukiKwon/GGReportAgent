package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;

/**
 * 기관장 정보 IDOR — 기관 X 의 칸·머리·사진 번호를 기관 Y 경로로 찍으면 전부 404(그 번호가 있다는 사실이 새지 않는다)이고 상태는 그대로다.
 * 모든 대상 번호는 {@code WHERE INSTITUTION_ID = ? AND X_ID = ?} 로 묶어 조회한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadIdorApiTest extends HeadApiTestBase {

    private static final String X = INST;
    private static final String Y = INST2;

    @Test
    public void 다른_기관_경로로_칸_번호를_찍으면_확정_기각_무효_모두_404다() throws Exception {
        long head = addHeadOk(X, T1, "홍길동", "구청장");
        long confirmed = addItemOk(X, T1, itemDate(head, "TERM_END", "2030-06-30"), 201);
        long candidate = addItemOk(X, T2, itemDate(head, "TERM_END", "2031-01-01"), 202);
        addHeadOk(Y, T1, "김철수", "군수");   // Y 에도 기관장이 있다(다른 기관이라는 사실만 다르다)

        MvcResult c = postJson(headPath(Y) + "/items/" + candidate + "/confirm", L2, "{}");
        assertEquals(text(c), 404, c.getResponse().getStatus());
        MvcResult r = postJson(headPath(Y) + "/items/" + candidate + "/reject", L2, reason("잘못 입력된 값"));
        assertEquals(text(r), 404, r.getResponse().getStatus());
        MvcResult v = postJson(headPath(Y) + "/items/" + confirmed + "/void", L2, reason("잘못 입력된 값"));
        assertEquals(text(v), 404, v.getResponse().getStatus());

        assertEquals("CANDIDATE", itemState(candidate));
        assertEquals("CONFIRMED", itemState(confirmed));
        assertEquals(3, act("ITEM_CONFIRM", "HIDDEN") + act("ITEM_REJECT", "HIDDEN") + act("ITEM_VOID", "HIDDEN"));
    }

    @Test
    public void 다른_기관의_머리_번호로_칸을_넣거나_머리를_확정_기각하면_404다() throws Exception {
        long head = addHeadOk(X, T1, "홍길동", "구청장");
        long cand = json(postJson(headsPath(X), T2, headJson("김철수", "구청장"))).path("head_id").asLong();
        addHeadOk(Y, T1, "박민수", "군수");

        MvcResult item = postJson(headPath(Y) + "/items", L2, itemText(head, "POSITION", "부군수"));
        assertEquals(text(item), 404, item.getResponse().getStatus());
        MvcResult confirm = postJson(headsPath(Y) + "/" + cand + "/confirm", L2, "{}");
        assertEquals(text(confirm), 404, confirm.getResponse().getStatus());
        MvcResult reject = postJson(headsPath(Y) + "/" + cand + "/reject", L2, reason("잘못 입력된 값"));
        assertEquals(text(reject), 404, reject.getResponse().getStatus());

        assertEquals("CANDIDATE", headStatus(cand));
        assertEquals("CURRENT", headStatus(head));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='POSITION' AND CREATED_BY=?", head, L2));
    }

    @Test
    public void 다른_기관의_사진_번호로_보기_무효_복원하면_404다() throws Exception {
        long head = addHeadOk(X, T1, "홍길동", "구청장");
        long photo = photoOk(X, T1, head);
        addHeadOk(Y, T1, "박민수", "군수");

        assertEquals(404, getAs(headPath(Y) + "/photos/" + photo + "/content", L2).getResponse().getStatus());
        assertEquals(404, postJson(headPath(Y) + "/photos/" + photo + "/void", L2, reason("잘못 올림")).getResponse().getStatus());
        assertEquals(404, postJson(headPath(Y) + "/photos/" + photo + "/restore", L2, "{}").getResponse().getStatus());
        assertEquals("ACTIVE", photoState(photo));
        assertEquals(200, getAs(headPath(X) + "/photos/" + photo + "/content", L2).getResponse().getStatus());
    }
}
