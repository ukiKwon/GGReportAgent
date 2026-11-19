package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.budget;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.expect;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.lines;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class SummaryParserTest {

    private static SummaryParser.Result parse(String text) {
        return SummaryParser.parse(lines(text), budget());
    }

    @Test
    public void 소제목_변형을_분류한다() {
        SummaryParser.Result r = parse("주요 주제:\n- 가상 안건 하나\n- 가상 안건 둘\n\n다음에 할 일\n- 자료 정리\n\n할 일 :\n- 일정 확인");
        assertEquals(3, r.sections.size());
        assertEquals(SummaryParser.Kind.TOPIC, r.sections.get(0).kind);
        assertEquals(2, r.sections.get(0).items.size());
        assertEquals(SummaryParser.Kind.TODO, r.sections.get(1).kind);
        assertEquals(SummaryParser.Kind.TODO, r.sections.get(2).kind);
        assertEquals(4, r.itemCount());
    }

    @Test
    public void 소제목은_정확히_그_말일_때만_주요_주제_다음_할_일로_본다() {
        SummaryParser.Result r = parse("주요 주제 ::\n- 하나\n\n다음 할 일 :\n- 둘\n\n다음할일\n- 셋");
        assertEquals(SummaryParser.Kind.TOPIC, r.sections.get(0).kind);
        assertEquals(SummaryParser.Kind.TODO, r.sections.get(1).kind);
        assertEquals(SummaryParser.Kind.TODO, r.sections.get(2).kind);
        // 말이 더 붙은 제목은 OTHER(제목 보존)
        SummaryParser.Result o = parse("할 일 없음 관련 논의\n- 하나\n\n다음 할 일 정리\n- 둘\n\n주요 주제 요약\n- 셋");
        assertEquals(3, o.sections.size());
        for (SummaryParser.Section s : o.sections) {
            assertEquals(SummaryParser.Kind.OTHER, s.kind);
        }
        assertEquals("할 일 없음 관련 논의", o.sections.get(0).title);
    }

    @Test
    public void 긴_소제목은_가리기_전에_자르지_않는다() {
        StringBuilder x = new StringBuilder();
        for (int i = 0; i < SummaryParser.MAX_TITLE_CHARS - 2; i++) {
            x.append('x');
        }
        String title = x + "가상일";
        SummaryParser.Result r = parse(title + "\n- 항목");
        assertEquals(title, r.sections.get(0).title);
        assertEquals(SummaryParser.MAX_TITLE_CHARS + 1, r.sections.get(0).title.length());
    }

    @Test
    public void 그_밖의_소제목은_OTHER_묶음이_된다() {
        // 소제목 없이 시작한 항목은 제목 없는 OTHER 묶음이 된다
        SummaryParser.Result r = parse("- 제목 없는 항목\n\n회의 분위기\n- 차분했다\n\n기타 의견:\n- 의견 하나\n- 의견 둘");
        assertEquals(3, r.sections.size());
        assertEquals(SummaryParser.Kind.OTHER, r.sections.get(0).kind);
        assertNull(r.sections.get(0).title);
        assertEquals(1, r.sections.get(0).sectionNo);
        assertEquals("회의 분위기", r.sections.get(1).title);
        assertEquals(2, r.sections.get(1).sectionNo);
        assertEquals("기타 의견", r.sections.get(2).title);
        assertEquals(3, r.sections.get(2).sectionNo);
        assertEquals(2, r.sections.get(2).items.size());
    }

    @Test
    public void 들여쓴_줄은_앞_항목에_붙고_항목_없는_소제목은_버린다() {
        SummaryParser.Result r = parse("빈 소제목\n주요 주제\n- 앞 문장\n   뒤 문장");
        assertEquals(1, r.sections.size());
        assertEquals("앞 문장 뒤 문장", r.sections.get(0).items.get(0));
    }

    @Test
    public void 한_줄로_붙은_옛_형식은_항목이_없어_거부한다() {
        MinutesException e = expect("SUMMARY_NO_ITEMS", new Runnable() {
            @Override
            public void run() {
                parse("주요 주제: 가상 안건, 다른 안건 다음 할 일: 자료 정리");
            }
        });
        assertEquals("summary", e.getSlot());
    }

    @Test
    public void 시간대별_요약을_올렸으면_거부한다() {
        expect("SUMMARY_LOOKS_TIMELINE", new Runnable() {
            @Override
            public void run() {
                parse("00:00 ~ 05:00\n주제\n- 항목");
            }
        });
    }
}
