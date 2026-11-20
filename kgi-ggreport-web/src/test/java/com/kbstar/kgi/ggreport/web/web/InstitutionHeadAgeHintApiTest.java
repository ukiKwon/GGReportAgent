package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

/**
 * 기관장 글자 칸(직위·학력·경력·출처 제목)의 나이 표기 차단(security 11-20 ③)과
 * 확정 경로의 생년월일 범위 재검사(security 11-20 ①). 오류 응답에 입력값이 없어야 한다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadAgeHintApiTest extends HeadApiTestBase {

    private static String items() {
        return headPath(INST) + "/items";
    }

    private static String withPeriod(String body) {
        return body.replace("\"source\"", "\"to\":\"2022-06\",\"source\"");   // 시작 년-월은 itemText 가 넣는다
    }

    private void assertInvalidText(MvcResult r, String leaked) throws Exception {
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_TEXT", code(json(r)));
        assertFalse("입력값을 싣지 않는다", text(r).contains(leaked));
    }

    @Test
    public void 정상_직위는_통과한다() throws Exception {
        MvcResult r = postJson(headsPath(INST), L1, headJson("홍길동", "제8대 구청장"));
        assertEquals(text(r), 201, r.getResponse().getStatus());
    }

    @Test
    public void 저출생_취임_날짜는_오탐하지_않는다() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        String[] ok = {"저출생대응과장", "2022.07.01 취임"};
        for (String v : ok) {
            MvcResult r = postJson(items(), L1, withPeriod(itemText(head, "CAREER", v)));
            assertEquals(v + " " + text(r), 201, r.getResponse().getStatus());
        }
    }

    @Test
    public void 경력_시작이_연도만이면_400이고_년월이면_201() throws Exception {   // 사용자 11-20 '년-월 정도는 있어야'
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        String yearOnly = itemText(head, "CAREER", "가람시 기획관").replace("2018-03", "2018");
        MvcResult r = postJson(items(), L1, yearOnly);
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(r)));
        String none = itemText(head, "CAREER", "가람시 기획관").replace(",\"from\":\"2018-03\"", "");
        assertEquals(400, postJson(items(), L1, none).getResponse().getStatus());
        assertEquals(201, postJson(items(), L1, itemText(head, "CAREER", "가람시 기획관")).getResponse().getStatus());
    }

    @Test
    public void addHead_직위의_년생은_400() throws Exception {
        assertInvalidText(postJson(headsPath(INST), L1, headJson("홍길동", "1965년생 구청장")), "1965");
    }

    @Test
    public void 전각_년생도_NFKC로_400() throws Exception {
        assertInvalidText(postJson(headsPath(INST), L1, headJson("홍길동", "１９６５년생 구청장")), "６５");
    }

    @Test
    public void POSITION_칸의_년생은_400() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        assertInvalidText(postJson(items(), L1, itemText(head, "POSITION", "1965년생 구청장")), "1965");
    }

    @Test
    public void 경력의_만_61세는_400() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        assertInvalidText(postJson(items(), L1, withPeriod(itemText(head, "CAREER", "만 61세 퇴직"))), "61");
    }

    @Test
    public void 출처_제목_생년월일은_400() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        String body = "{\"head_id\":" + head + ",\"field_cd\":\"POSITION\",\"value\":\"구청장\",\"source\":"
                + "{\"kind\":\"HOMEPAGE\",\"title\":\"후보자 생년월일 안내\",\"checked_on\":\"" + Times.todayKst() + "\"}}";
        assertInvalidText(postJson(items(), L1, body), "후보자");
    }

    @Test
    public void 사진_출처_이름의_년생도_400() throws Exception {   // security 11-20 R1
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        MvcResult r = mockMvc.perform(as(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart(headPath(INST) + "/photos")
                .file(new org.springframework.mock.web.MockMultipartFile("file", "face.jpg", "application/octet-stream", jpeg(300, 400)))
                .param("license_cd", "KOGL1").param("src_kind", "HOMEPAGE").param("src_title", "1965년생 시장 사진")
                .param("checked_on", Times.todayKst()).param("head_id", String.valueOf(head)), L1)).andReturn();
        assertInvalidText(r, "1965");
    }

    // ── 확정 경로 재검사(DB 직접 반입 후보) ─────────────────────────────

    @Test
    public void 범위_밖_생년월일_후보_칸_확정은_400이고_상태_그대로() throws Exception {
        long head = addHeadOk(INST, L1, "홍길동", "구청장");
        long item = insertCandidateItem(head, INST, "BIRTH_DATE", null, T2);
        jdbc.update("UPDATE INST_HEAD_ITEM SET VAL_DATE='1919-12-31' WHERE ITEM_ID=?", item);

        MvcResult r = postJson(headPath(INST) + "/items/" + item + "/confirm", L1, "{}");
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(r)));
        assertFalse(text(r).contains("1919"));
        assertEquals("CANDIDATE", itemState(item));
    }

    @Test
    public void 범위_밖_생년월일_후보_머리_확정은_400이고_상태_그대로() throws Exception {
        addHeadOk(INST, L1, "홍길동", "구청장");                                   // 현 기관장이 있어야 다른 사람은 후보 기관장(202)
        MvcResult a = postJson(headsPath(INST), T1, headJson("김후보", "구청장"));
        assertEquals(text(a), 202, a.getResponse().getStatus());
        long head = json(a).path("head_id").asLong();
        long item = insertCandidateItem(head, INST, "BIRTH_DATE", null, T1);
        jdbc.update("UPDATE INST_HEAD_ITEM SET VAL_DATE='1919-12-31' WHERE ITEM_ID=?", item);

        MvcResult r = postJson(headsPath(INST) + "/" + head + "/confirm", L1, "{}");
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_DATE", code(json(r)));
        assertEquals("CANDIDATE", headStatus(head));
        assertEquals("CANDIDATE", itemState(item));
    }
}
