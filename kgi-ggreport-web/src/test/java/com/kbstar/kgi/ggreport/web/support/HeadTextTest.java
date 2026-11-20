package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 기관장 정보 입력 검사 — URL·날짜·기간·한 줄 글자·확인일. 오류 응답에 입력값이 없다. */
public class HeadTextTest {

    private static String codeOf(ApiException e) {
        return String.valueOf(((Map<?, ?>) e.getDetailObject()).get("code"));
    }

    private static void assertUrlRejected(String url) {
        try {
            HeadText.requireUrl(url);
            fail("거부돼야 한다: " + url);
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
            assertEquals("SRC_URL_INVALID", codeOf(e));
            assertTrue(!String.valueOf(e.getDetailObject()).contains("alert"));
        }
    }

    @Test
    public void URL은_http_https만() {
        assertNull(HeadText.requireUrl(null));
        assertNull(HeadText.requireUrl(""));
        assertEquals("HTTPS://www.example.go.kr/a", HeadText.requireUrl("HTTPS://www.example.go.kr/a"));
        assertEquals("http://example.go.kr/a?b=1#c", HeadText.requireUrl("http://example.go.kr/a?b=1#c"));
        assertUrlRejected("javascript:alert(1)");
        assertUrlRejected("ftp://h/x");
        assertUrlRejected("http://u:p@h/");
        assertUrlRejected(" http://h/");
        assertUrlRejected("http:///x");
        assertUrlRejected("http://h/a b");
        assertUrlRejected("http://h/a\\b");
        StringBuilder longUrl = new StringBuilder("http://h/");
        for (int i = 0; i < 1000; i++) {
            longUrl.append('a');
        }
        assertUrlRejected(longUrl.toString());
    }

    @Test
    public void 날짜는_실재해야_한다() {
        assertEquals("2026-02-28", HeadText.requireDate("d", "2026-02-28"));
        for (String bad : new String[]{"2026-02-30", "2026-13-01", "2026-1-1", "20260101", "", null, "2026-02-28 "}) {
            try {
                HeadText.requireDate("d", bad);
                fail("거부돼야 한다: " + bad);
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
                assertEquals("INVALID_DATE", codeOf(e));
            }
        }
        assertNull(HeadText.optionalDate("d", null));
        assertNull(HeadText.optionalDate("d", ""));
    }

    @Test
    public void 기간은_YYYY_또는_YYYY_MM() {
        assertEquals("1995", HeadText.requirePeriod("p", "1995"));
        assertEquals("1995-03", HeadText.requirePeriod("p", "1995-03"));
        assertNull(HeadText.requirePeriod("p", null));
        assertNull(HeadText.requirePeriod("p", ""));
        for (String bad : new String[]{"1995-13", "1995-00", "95", "1899", "2101", "1995-3", "1995-03-01"}) {
            try {
                HeadText.requirePeriod("p", bad);
                fail("거부돼야 한다: " + bad);
            } catch (ApiException e) {
                assertEquals("INVALID_DATE", codeOf(e));
            }
        }
    }

    @Test
    public void 확인일은_2000년_이후_오늘까지() {
        String today = Times.todayKst();
        assertEquals(today, HeadText.requireCheckedOn(today));
        assertEquals("2000-01-01", HeadText.requireCheckedOn("2000-01-01"));
        for (String bad : new String[]{"1999-12-31", LocalDate.parse(today).plusDays(1).toString(), "2026-02-30"}) {
            try {
                HeadText.requireCheckedOn(bad);
                fail("거부돼야 한다: " + bad);
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
            }
        }
    }

    @Test
    public void 한_줄_글자는_제어문자와_길이를_본다() {
        assertEquals("홍 길동", HeadText.requireLine("name", "  홍   길동 ", 30, false));
        for (String bad : new String[]{"줄\n바꿈", "탭\t포함", "방향" + (char) 0x202E + "문자", "", "   ", null}) {
            try {
                HeadText.requireLine("career", bad, 60, false);
                fail("거부돼야 한다: " + bad);
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
                assertEquals("INVALID_TEXT", codeOf(e));
            }
        }
        try {
            HeadText.requireLine("name", "홍길동1", 30, true);
            fail("이름의 숫자는 거부");
        } catch (ApiException e) {
            assertEquals("INVALID_TEXT", codeOf(e));
        }
        StringBuilder s61 = new StringBuilder();
        for (int i = 0; i < 61; i++) {
            s61.append('가');
        }
        try {
            HeadText.requireLine("career", s61.toString(), 60, false);
            fail("61자는 거부");
        } catch (ApiException e) {
            assertEquals("INVALID_TEXT", codeOf(e));
        }
    }

    @Test
    public void 비교_키는_공백을_없앤다() {
        assertEquals("홍길동", HeadText.compareKey(" 홍 길  동 "));
        assertEquals("ABC", HeadText.compareKey("ＡＢＣ"));   // NFKC
        assertEquals("", HeadText.compareKey(null));
    }

    @Test
    public void 사유는_길이와_금지내용을_본다() {
        assertEquals("값이 잘못 입력됨", HeadText.requireReason("값이 잘못 입력됨"));
        try {
            HeadText.requireReason("02-123-4567 로 확인");
            fail("전화번호는 거부");
        } catch (ApiException e) {
            assertEquals(422, e.getStatus());
        }
        StringBuilder s201 = new StringBuilder();
        for (int i = 0; i < 201; i++) {
            s201.append('가');
        }
        try {
            HeadText.requireReason(s201.toString());
            fail("201자는 거부");
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
        }
    }

    @Test
    public void 생년월일_상한은_윤년_오늘에서_18년_전날로_본다() {
        LocalDate today = LocalDate.of(2044, 2, 29);   // 상한 2026-02-28
        assertEquals("2026-02-28", HeadText.requireBirthDate("2026-02-28", today));
        try {
            HeadText.requireBirthDate("2026-03-01", today);
            fail();
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
        }
    }

    @Test
    public void 생년월일_출처에_같은_날짜만_막고_다른_날짜는_통과() {
        for (String t : new String[]{"1970-05-17 자료", "1970.5.17", "1970/05/17", "1970년 5월 17일", "인사 19700517", "１９７０-０５-１７"}) {
            try {
                HeadText.noSameDate("1970-05-17", t);
                fail(t);
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
            }
        }
        HeadText.noSameDate("1970-05-17", "2026-07-01 취임식", "1970-05-18", "1970-05-170", null, "https://example.go.kr/a");
        HeadText.noSameDate(null, "1970-05-17");   // 생년월일이 없으면 검사하지 않는다
    }

    @Test
    public void 학력_경력_시작은_년월_필수() {
        assertEquals("2018-07", HeadText.requireStartMonth("2018-07"));
        for (String bad : new String[]{null, "", "2018", "2018-7", "2018-13", "1899-12", "18-07"}) {
            try {
                HeadText.requireStartMonth(bad);
                fail(String.valueOf(bad));
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
            }
        }
    }

    @Test
    public void 나이_표기는_막고_비슷한_정상_문구는_통과한다() {
        String[] ok = {"구청장", "제8대 구청장", "저출생대응과장", "2022.07.01 취임", "2020년 생산성 향상", "2020년 생활체육회장", "2018년 생명과학연구소", "2019년 생태도시과장", null};
        for (String v : ok) {
            assertEquals(v, HeadText.noAge(v));
        }
        String[] bad = {"1965년생 구청장", "１９６５년생", "만 61세", "생년월일 1965-03-02", "1965 년 생"};
        for (String v : bad) {
            try {
                HeadText.noAge(v);
                fail(v);
            } catch (ApiException e) {
                assertEquals(400, e.getStatus());
                assertTrue(e.getMessage() == null || !e.getMessage().contains("1965"));
            }
        }
    }
}
