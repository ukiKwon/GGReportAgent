package com.kbstar.kgi.ggreport.web.minutes;

import java.nio.charset.Charset;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/** 회의록 단위 시험 공용 도우미. 시험 데이터는 모두 가상이다(실명·실제 회의 내용 없음). */
final class MinutesTestSupport {
    static final Charset UTF8 = Charset.forName("UTF-8");

    private MinutesTestSupport() {
    }

    /**
     * 코드포인트 하나를 문자열로. 눈에 보이지 않는 문자를 시험 소스에 글자 그대로 적으면 편집기·도구가 지우거나 바꿀 수 있어
     * (보이지도 않는다) 숫자로 적는다.
     */
    static String cp(int codePoint) {
        return new String(Character.toChars(codePoint));
    }

    /** 문자열 → 검사를 마친 줄 배열(실제 업로드와 같은 경로). */
    static String[] lines(String text) {
        return MinutesText.prepare(text.getBytes(UTF8), "t").lines;
    }

    static MinutesBudget budget() {
        return MinutesBudget.standard();
    }

    /** 던져진 MinutesException 의 코드가 같은지 확인하고 예외를 돌려준다. */
    static MinutesException expect(String code, Runnable r) {
        try {
            r.run();
        } catch (MinutesException e) {
            assertEquals(code, e.getCode());
            return e;
        }
        fail("MinutesException " + code + " 가 던져져야 한다");
        return null;
    }
}
