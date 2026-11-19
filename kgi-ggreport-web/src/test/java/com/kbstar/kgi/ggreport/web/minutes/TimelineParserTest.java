package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.budget;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.expect;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.lines;
import static org.junit.Assert.assertEquals;

public class TimelineParserTest {

    private static TimelineParser.Result parse(String text) {
        return TimelineParser.parse(lines(text), budget());
    }

    private static String threeTier(int count) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            int s = i * 300;
            int e = s + 299;
            sb.append(String.format("%02d:%02d ~ %02d:%02d\n", s / 60, s % 60, e / 60, e % 60));
            sb.append("주제어").append(i).append(", 가상 키워드\n");
            sb.append("- 첫째 항목 ").append(i).append('\n');
            sb.append("- 둘째 항목 ").append(i).append("\n\n");
        }
        return sb.toString();
    }

    @Test
    public void 세_단_구조_열_구간을_읽는다() {
        TimelineParser.Result r = parse(threeTier(10));
        assertEquals(10, r.segments.size());
        TimelineParser.Segment s = r.segments.get(1);
        assertEquals(2, s.segNo);
        assertEquals(300, s.startSec);
        assertEquals(599, s.endSec);
        assertEquals("주제어1, 가상 키워드", s.keywords);
        assertEquals(2, s.keywordList().size());
        assertEquals(2, s.items.size());
        assertEquals("첫째 항목 1", s.items.get(0));
        assertEquals(0, r.overlapCount);
    }

    @Test
    public void 한_줄_옛_형식을_받는다() {
        TimelineParser.Result r = parse("00:00 ~ 05:00 가상 주제, 다른 주제\n- 항목 하나\n05:00 ~ 10:00 셋째 주제\n- 항목 둘");
        assertEquals(2, r.segments.size());
        assertEquals("가상 주제, 다른 주제", r.segments.get(0).keywords);
        assertEquals(1, r.segments.get(1).items.size());
    }

    @Test
    public void 긴_주제어는_가리기_전에_자르지_않는다() {
        // 500자 경계에 이름이 걸쳐도 파서는 자르지 않는다 — 자르기는 가린 뒤 MinutesParse 에서만
        StringBuilder x = new StringBuilder();
        for (int i = 0; i < MAX_KW - 2; i++) {
            x.append('x');
        }
        String kw = x + "가상일";
        TimelineParser.Result two = parse("00:00 ~ 05:00\n" + kw + "\n- 항목");
        assertEquals(kw, two.segments.get(0).keywords);
        assertEquals(MAX_KW + 1, two.segments.get(0).keywords.length());
        TimelineParser.Result one = parse("00:00 ~ 05:00 " + kw + "\n- 항목");   // 옛 한 줄 형식도 같다
        assertEquals(kw, one.segments.get(0).keywords);
    }

    private static final int MAX_KW = TimelineParser.MAX_KEYWORD_CHARS;

    @Test
    public void 이어_쓰기_줄은_앞_항목에_붙인다() {
        TimelineParser.Result r = parse("00:00 ~ 05:00\n주제어\n- 앞 문장입니다\n뒤 문장입니다\n- 다음 항목");
        TimelineParser.Segment s = r.segments.get(0);
        assertEquals(2, s.items.size());
        assertEquals("앞 문장입니다 뒤 문장입니다", s.items.get(0));
    }

    @Test
    public void 시작이_끝보다_늦으면_줄_번호와_함께_거부한다() {
        MinutesException e = expect("TIMELINE_RANGE", new Runnable() {
            @Override
            public void run() {
                parse("00:00 ~ 05:00\n주제\n- 항목\n\n10:00 ~ 07:00\n주제\n- 항목");
            }
        });
        assertEquals(5, e.getLine());
    }

    @Test
    public void 겹치는_구간은_경고만_하고_발언은_첫_구간에_붙는다() {
        TimelineParser.Result r = parse("00:00 ~ 05:00\n주제\n- 항목\n\n04:00 ~ 08:00\n주제\n- 항목");
        assertEquals(1, r.overlapCount);
        TranscriptParser.Utterance u = new TranscriptParser.Utterance(1, 1, 270, false, "가상 발언");
        SegmentLinker.Link link = SegmentLinker.link(r.segments, java.util.Collections.singletonList(u));
        assertEquals(Integer.valueOf(1), link.segNoOf(0));
    }

    @Test
    public void 구간이_없거나_원문을_올렸으면_거부한다() {
        expect("TIMELINE_FORMAT", new Runnable() {
            @Override
            public void run() {
                parse("그냥 글 하나\n둘째 줄");
            }
        });
        expect("TIMELINE_LOOKS_TRANSCRIPT", new Runnable() {
            @Override
            public void run() {
                parse("참석자 1 / 00:05\n안녕하세요\n\n참석자 2 / 00:10\n네 알겠습니다");
            }
        });
    }

    @Test
    public void 첫_구간_앞_일반_줄이_다섯_줄을_넘으면_거부한다() {
        final String text = "가\n나\n다\n라\n마\n바\n00:00 ~ 01:00\n주제\n- 항목";
        expect("TIMELINE_FORMAT", new Runnable() {
            @Override
            public void run() {
                parse(text);
            }
        });
        TimelineParser.Result ok = parse("가\n나\n00:00 ~ 01:00\n주제\n- 항목");
        assertEquals(2, ok.preambleLines);
    }
}
