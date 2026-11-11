package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.support.Times;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 기관장 정보 입력 검사(NEXT 72·77) — 형식 오류 400·개인정보 422 PII_BLOCKED·금지 내용 422 HEAD_FORBIDDEN·출처 검사.
 * 모든 오류 응답 본문에 입력값이 없다. 요청 본문은 Jackson 으로 만든다(줄바꿈·방향 문자 이스케이프 실수 방지).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class InstitutionHeadInputApiTest extends HeadApiTestBase {

    private Map<String, Object> src(String title, String url, String checkedOn, String kind) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("kind", kind);
        s.put("title", title);
        if (url != null) {
            s.put("url", url);
        }
        s.put("checked_on", checkedOn);
        return s;
    }

    private Map<String, Object> okSrc() {
        return src("시험 출처 문서", null, Times.todayKst(), "HOMEPAGE");
    }

    private MvcResult add(long head, String field, String value, Map<String, Object> source) throws Exception {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("head_id", head);
        b.put("field_cd", field);
        b.put("value", value);
        b.put("source", source);
        return postJson(headPath(INST) + "/items", T1, om.writeValueAsString(b));
    }

    private MvcResult career(long head, String value) throws Exception {
        return add(head, "CAREER", value, okSrc());
    }

    private MvcResult addHead(String name, String position) throws Exception {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("name", name);
        b.put("position", position);
        b.put("source", okSrc());
        return postJson(headsPath(INST), T1, om.writeValueAsString(b));
    }

    private static void assertNoEcho(MvcResult r, String input) throws Exception {
        String body = text(r);
        assertFalse("오류 응답에 입력값이 있다: " + body, input != null && !input.isEmpty() && body.contains(input));
    }

    @Test
    public void 이름의_숫자_줄바꿈_방향문자는_400_INVALID_TEXT다() throws Exception {
        for (String bad : new String[]{"홍길동1", "홍\n길동", "홍" + (char) 0x202E + "길동"}) {
            MvcResult r = addHead(bad, "구청장");
            assertEquals(text(r), 400, r.getResponse().getStatus());
            assertEquals("INVALID_TEXT", code(json(r)));
            assertNoEcho(r, "길동");
        }
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=?", INST));
    }

    @Test
    public void 낱말과_겹치는_사람_이름은_금지_검사에서_제외되어_저장된다_qa_P1() throws Exception {
        boolean first = true;
        for (String name : new String[]{"고희정", "신도윤", "권사랑", "장남희", "조문희", "신자영", "손자영"}) {
            MvcResult r = addHead(name, "구청장");
            assertEquals(name + " " + text(r), first ? 201 : 202, r.getResponse().getStatus());
            first = false;
        }
        MvcResult phone = addHead("02-123-4567", "구청장");
        assertEquals(text(phone), 400, phone.getResponse().getStatus());   // 숫자가 든 이름은 400(전화번호 검사 이전에 형식에서 막힌다)
    }

    @Test
    public void 정상_경력_직함은_낱말_일부여도_저장된다_qa_P1() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        for (String ok : new String[]{"서울특별시 재난안전과장", "지역발전과장", "과학기술정보통신부 차관", "OO인권사무소장",
                "구로구 신도림동장", "고려대학교 회계학과", "정보통신 자문위원", "국토교통부 고문"}) {
            MvcResult r = career(head, ok);
            assertEquals(ok + " " + text(r), 201, r.getResponse().getStatus());
        }
        MvcResult bad = career(head, "전과 2범");
        assertEquals(text(bad), 422, bad.getResponse().getStatus());
        assertEquals("CRIME", json(bad).path("detail").path("kinds").get(0).path("kind").asText());
    }

    @Test
    public void 이름의_원문자_전각_숫자는_정규화_뒤에도_거부한다_qa_P3_6() throws Exception {
        for (String bad : new String[]{"홍길동" + (char) 0x2460, "홍길동" + (char) 0xFF11}) {
            MvcResult r = addHead(bad, "구청장");
            assertEquals(text(r), 400, r.getResponse().getStatus());
            assertEquals("INVALID_TEXT", code(json(r)));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD WHERE INSTITUTION_ID=?", INST));
    }

    @Test
    public void 경력_61자는_400이다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < 61; i++) {
            s.append('가');
        }
        MvcResult r = career(head, s.toString());
        assertEquals(text(r), 400, r.getResponse().getStatus());
        assertEquals("INVALID_TEXT", code(json(r)));
        assertEquals(201, career(head, s.substring(0, 60)).getResponse().getStatus());
    }

    @Test
    public void 휴대폰은_PII_BLOCKED_유선과_대표번호는_HEAD_FORBIDDEN_PHONE이다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        MvcResult mobile = career(head, "010-1234-5678");
        assertEquals(text(mobile), 422, mobile.getResponse().getStatus());
        assertEquals("PII_BLOCKED", code(json(mobile)));
        assertNoEcho(mobile, "1234");
        for (String phone : new String[]{"02-123-4567", "(031)123-4567", "02.123.4567", "1588-1234"}) {
            MvcResult r = career(head, phone);
            assertEquals(phone + " " + text(r), 422, r.getResponse().getStatus());
            JsonNode d = json(r).path("detail");
            assertEquals("HEAD_FORBIDDEN", d.path("code").asText());
            assertEquals("PHONE", d.path("kinds").get(0).path("kind").asText());
            assertNoEcho(r, "123");
        }
        MvcResult ok = career(head, "1995-2002 ○○시 부시장");
        assertEquals(text(ok), 201, ok.getResponse().getStatus());
    }

    @Test
    public void 정당_표현은_422_PARTY이고_비슷한_낱말은_통과한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        for (String bad : new String[]{"더불어민주당 지역위원장", "국민의 힘 최고위원", "새희망당 대변인"}) {
            MvcResult r = career(head, bad);
            assertEquals(bad + " " + text(r), 422, r.getResponse().getStatus());
            assertEquals("PARTY", json(r).path("detail").path("kinds").get(0).path("kind").asText());
            assertNoEcho(r, "민주");
        }
        for (String ok : new String[]{"CJ제일제당 대표이사", "예술의전당 이사", "기획담당관", "경로당 연합회장", "정당한 절차 개선 위원"}) {
            MvcResult r = career(head, ok);
            assertEquals(ok + " " + text(r), 201, r.getResponse().getStatus());
        }
    }

    @Test
    public void 범죄_건강_종교_가족_경조사는_종류별_422이고_비슷한_낱말은_통과한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        String[][] bad = {{"징역", "CRIME"}, {"투병", "HEALTH"}, {"교회 장로", "RELIGION"}, {"배우자", "FAMILY"}, {"별세", "EVENT"}};
        for (String[] b : bad) {
            MvcResult r = career(head, b[0]);
            assertEquals(b[0] + " " + text(r), 422, r.getResponse().getStatus());
            assertEquals(b[1], json(r).path("detail").path("kinds").get(0).path("kind").asText());
            assertNoEcho(r, b[0]);
        }
        for (String ok : new String[]{"자매결연 추진단장", "딸기축제 위원장", "○○신도시 추진단장", "저출산 대책 위원", "다자녀 지원 위원"}) {
            MvcResult r = career(head, ok);
            assertEquals(ok + " " + text(r), 201, r.getResponse().getStatus());
        }
    }

    @Test
    public void 출처_이름과_사유에도_금지_내용_검사가_걸린다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        MvcResult title = add(head, "CAREER", "서울특별시 행정국장", src("더불어민주당 홍보물", null, Times.todayKst(), "HOMEPAGE"));
        assertEquals(text(title), 422, title.getResponse().getStatus());
        assertNoEcho(title, "홍보물");
        long item = addItemOk(INST, T1, itemText(head, "CAREER", "서울특별시 행정국장"), 201);
        MvcResult phone = postJson(headPath(INST) + "/items/" + item + "/void", T1, reason("02-123-4567 로 확인"));
        assertEquals(text(phone), 422, phone.getResponse().getStatus());
        assertNoEcho(phone, "4567");
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < 201; i++) {
            s.append('가');
        }
        MvcResult tooLong = postJson(headPath(INST) + "/items/" + item + "/void", T1, reason(s.toString()));
        assertEquals(text(tooLong), 400, tooLong.getResponse().getStatus());
        assertEquals("값은 그대로", "CONFIRMED", itemState(item));
    }

    @Test
    public void 출처_URL은_http_https만이고_대문자_스킴은_통과한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        for (String bad : new String[]{"javascript:alert(1)", "ftp://h/x", "http://u:p@h/", " http://h/", "http:///x"}) {
            MvcResult r = add(head, "CAREER", "서울특별시 행정국장", src("시험 출처 문서", bad, Times.todayKst(), "HOMEPAGE"));
            assertEquals(bad + " " + text(r), 400, r.getResponse().getStatus());
            assertEquals("SRC_URL_INVALID", code(json(r)));
            assertNoEcho(r, "alert");
        }
        MvcResult ok = add(head, "CAREER", "서울특별시 행정국장", src("시험 출처 문서", "HTTPS://www.example.go.kr/a", Times.todayKst(), "HOMEPAGE"));
        assertEquals(text(ok), 201, ok.getResponse().getStatus());
    }

    @Test
    public void 확인일과_출처_종류_검사() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        for (String bad : new String[]{"2999-01-01", "1999-12-31", "2026-02-30"}) {
            MvcResult r = add(head, "CAREER", "서울특별시 행정국장", src("시험 출처 문서", null, bad, "HOMEPAGE"));
            assertEquals(bad + " " + text(r), 400, r.getResponse().getStatus());
        }
        MvcResult kind = add(head, "CAREER", "서울특별시 행정국장", src("시험 출처 문서", null, Times.todayKst(), "NO_SUCH_KIND"));
        assertEquals(text(kind), 422, kind.getResponse().getStatus());
        assertEquals("SRC_KIND_NOT_ALLOWED", code(json(kind)));
        MvcResult field = add(head, "PHONE", "x", okSrc());
        assertEquals(text(field), 422, field.getResponse().getStatus());
        assertEquals("FIELD_NOT_ALLOWED", code(json(field)));
        assertTrue(count("SELECT COUNT(*) FROM INST_HEAD_ITEM WHERE HEAD_ID=? AND FIELD_CD='CAREER'", head) == 0);
    }
}
