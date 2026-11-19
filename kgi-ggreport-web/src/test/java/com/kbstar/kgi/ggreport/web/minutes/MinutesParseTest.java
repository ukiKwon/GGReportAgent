package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.UTF8;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/** 원문·시간대별·맞춤 요약을 한 묶음으로 읽는 {@link MinutesParse} — 이름은 모두 가상이다(가상일·도담). */
public class MinutesParseTest {

    private static final MinutesMasker M = new MinutesMasker(Arrays.asList("가상일", "도담"));

    private static final String TRANSCRIPT = "참석자 1 / 00:05\n안녕하세요 가상일님 회의를 시작합니다\n\n참석자 2 / 00:20\n네 알겠습니다 안건을 보겠습니다";
    private static final String TIMELINE = "00:00 ~ 00:30\n가상일, 안건\n- 가상일님이 안건을 설명했다";
    private static final String SUMMARY = "주요 주제\n- 가상일님 안건\n\n다음 할 일\n- 가상일님 자료 정리";

    private static byte[] b(String s) {
        return s.getBytes(UTF8);
    }

    private static MinutesParse parse(String transcript, String timeline, String summary, String title,
                                      java.util.Collection<String> terms, java.util.Collection<String> release) {
        return MinutesParse.parse(b(transcript), timeline == null ? null : b(timeline), summary == null ? null : b(summary),
                title, M, terms, release);
    }

    private static MinutesParse parse() {
        return parse(TRANSCRIPT, TIMELINE, SUMMARY, "가상일 회의록", null, null);
    }

    @Test
    public void 가린_결과_어디에도_이름이_남지_않는다() {
        MinutesParse p = parse();
        assertFalse(p.title.contains("가상일"));
        for (TranscriptParser.Utterance u : p.utterances) {
            assertFalse(u.body.contains("가상일"));
        }
        for (TimelineParser.Segment g : p.segments) {
            assertFalse(g.keywords.contains("가상일"));
            for (String it : g.items) {
                assertFalse(it.contains("가상일"));
            }
        }
        for (SummaryParser.Section s : p.sections) {
            for (String it : s.items) {
                assertFalse(it.contains("가상일"));
            }
        }
        assertTrue(p.maskName >= 6);
        assertEquals(0, p.maskPii);
    }

    @Test
    public void 같은_입력은_같은_digest다() {
        MinutesParse a = parse();
        MinutesParse c = parse();
        assertEquals(64, a.digest.length());
        assertEquals(a.digest, c.digest);
    }

    @Test
    public void 가림_단어와_해제를_바꿔도_digest는_같다() {
        String base = parse().digest;
        assertEquals(base, parse(TRANSCRIPT, TIMELINE, SUMMARY, "가상일 회의록", Collections.singletonList("안건"), null).digest);
        assertEquals(base, parse(TRANSCRIPT, TIMELINE, SUMMARY, "가상일 회의록", null, Collections.singletonList("가상일")).digest);
        assertEquals(base, parse(TRANSCRIPT, TIMELINE, SUMMARY, null, null, null).digest);   // 제목은 값에 안 든다
        // 그러나 글이 달라지면 달라진다
        assertNotEquals(base, parse(TRANSCRIPT + "!", TIMELINE, SUMMARY, null, null, null).digest);
    }

    @Test
    public void 화자_표기의_글자는_digest에_들지_않고_번호만_든다() {
        String a = "가상일 / 00:10\n본문 하나 둘\n\n참석자 2 / 00:20\n본문 셋 넷";
        String c = "도담 / 00:10\n본문 하나 둘\n\n참석자 2 / 00:20\n본문 셋 넷";
        MinutesParse pa = parse(a, null, null, null, null, null);
        MinutesParse pc = parse(c, null, null, null, null, null);
        assertEquals(pa.digest, pc.digest);
        assertEquals(1, pa.maskLabel);
        assertEquals(Integer.valueOf(1), pa.warnings.get("LABEL_RENAMED"));
        assertEquals(3, pa.utterances.get(0).speakerNo);   // 참석자 번호 최댓값(2) 다음
    }

    @Test
    public void 구간_끝이_발언_끝보다_한참_뒤면_SEG_BEYOND_END_경고다() {
        MinutesParse p = parse(TRANSCRIPT, "00:00 ~ 10:00\n주제\n- 항목", null, null, null, null);
        assertEquals(Integer.valueOf(1), p.warnings.get("SEG_BEYOND_END"));
        MinutesParse fine = parse(TRANSCRIPT, "00:00 ~ 00:30\n주제\n- 항목", null, null, null, null);
        assertFalse(fine.warnings.containsKey("SEG_BEYOND_END"));
    }

    @Test
    public void 시각이_거꾸로여도_길이는_가장_늦은_시각이다() {
        MinutesParse p = parse("참석자 1 / 05:00\n하나 하나\n\n참석자 2 / 01:00\n둘 둘 둘", null, null, null, null, null);
        assertEquals(300, p.durationSec);
        assertEquals(Integer.valueOf(1), p.warnings.get("TIME_NOT_SORTED"));
    }

    @Test
    public void 경계에_걸친_긴_주제어와_소제목도_이름이_남지_않는다() {
        StringBuilder kw = new StringBuilder();
        for (int i = 0; i < TimelineParser.MAX_KEYWORD_CHARS - 2; i++) {
            kw.append('x');
        }
        StringBuilder ti = new StringBuilder();
        for (int i = 0; i < SummaryParser.MAX_TITLE_CHARS - 2; i++) {
            ti.append('x');
        }
        MinutesParse p = parse(TRANSCRIPT, "00:00 ~ 00:30\n" + kw + "가상일\n- 항목", ti + "가상일\n- 항목", null, null, null);
        String k = p.segments.get(0).keywords;
        String t = p.sections.get(0).title;
        assertTrue(k.length() <= TimelineParser.MAX_KEYWORD_CHARS);
        assertTrue(t.length() <= SummaryParser.MAX_TITLE_CHARS);
        for (String s : new String[]{k, t}) {
            assertFalse(s, s.contains("가상"));
            assertFalse(s, s.contains("상일"));
        }
    }

    @Test
    public void 본문이_빈_발언은_고정_본문의_잡음으로_센다() {
        MinutesParse p = parse("참석자 1 / 00:01\n\n참석자 2 / 00:02\n안건을 설명드리겠습니다", null, null, null, null, null);
        assertEquals(TranscriptParser.EMPTY_BODY, p.utterances.get(0).body);
        assertTrue(p.utterances.get(0).noise);
        assertEquals(1, p.noiseCnt);
    }
}
