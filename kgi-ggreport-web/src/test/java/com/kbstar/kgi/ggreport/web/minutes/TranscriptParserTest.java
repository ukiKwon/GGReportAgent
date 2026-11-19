package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.budget;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.expect;
import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.lines;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class TranscriptParserTest {

    private static TranscriptParser.Result parse(String text) {
        return TranscriptParser.parse(lines(text), budget());
    }

    @Test
    public void 머리줄_세_개는_발언_세_개다() {
        TranscriptParser.Result r = parse("참석자 1 / 00:05\n안녕하세요 회의를 시작합니다\n\n"
                + "참석자 2 / 01:10\n네 안건을 보겠습니다\n\n"
                + "참석자 1 / 02:30\n다음 안건입니다\n둘째 줄도 있습니다\n");
        assertEquals(3, r.utterances.size());
        assertEquals(5, r.utterances.get(0).startSec);
        assertEquals(70, r.utterances.get(1).startSec);
        assertEquals(2, r.utterances.get(1).speakerNo);
        assertEquals("다음 안건입니다\n둘째 줄도 있습니다", r.utterances.get(2).body);
        assertEquals(2, r.speakerCount());
        assertEquals(150, r.durationSec());
        assertEquals(0, r.preambleLines);
    }

    @Test
    public void 시간_표기_두_가지를_모두_읽는다() {
        TranscriptParser.Result r = parse("참석자 1 / 01:02:03\n첫 번째 발언입니다\n\n참석자 1 / 75:00\n두 번째 발언입니다");
        assertEquals(3723, r.utterances.get(0).startSec);
        assertEquals(4500, r.utterances.get(1).startSec);
        assertEquals(0, r.timeNotSorted);
    }

    @Test
    public void 이름으로_바뀐_화자는_참석자_번호로_바꾼다() {
        TranscriptParser.Result r = parse("가상일 / 00:10\n본문 하나\n\n참석자 2 / 00:20\n본문 둘\n\n가상일 / 00:30\n본문 셋");
        assertEquals(3, r.utterances.size());
        assertEquals(3, r.utterances.get(0).speakerNo);   // 최댓값 2 다음 번호
        assertEquals(3, r.utterances.get(2).speakerNo);
        assertEquals(2, r.labelCount);
        for (TranscriptParser.Utterance u : r.utterances) {
            assertFalse(u.body.contains("가상일"));
        }
    }

    @Test
    public void 첫_머리줄_앞의_머리말은_버리고_건수만_알린다() {
        TranscriptParser.Result r = parse("회의 제목 가상\n참석: 가나\n\n참석자 1 / 00:01\n안녕하세요");
        assertEquals(1, r.utterances.size());
        assertEquals(2, r.preambleLines);
    }

    @Test
    public void 발언_끝의_슬래시_시각은_머리줄이_아니다() {
        TranscriptParser.Result r = parse("참석자 1 / 00:01\n이 줄은 앞줄이 비지 않은 설명 / 12:30\n이어서 말합니다");
        assertEquals(1, r.utterances.size());
        assertTrue(r.utterances.get(0).body.contains("/ 12:30"));
    }

    @Test
    public void 짧은_추임새는_잡음으로_표시한다() {
        TranscriptParser.Result r = parse("참석자 1 / 00:01\nNG\n\n참석자 2 / 00:02\n네.\n\n참석자 1 / 00:03\n음음음...\n\n참석자 2 / 00:04\n안건을 설명드리겠습니다");
        assertTrue(r.utterances.get(0).noise);
        assertTrue(r.utterances.get(1).noise);
        assertTrue(r.utterances.get(2).noise);
        assertFalse(r.utterances.get(3).noise);
        assertEquals(3, r.noiseCount());
    }

    @Test
    public void 발언이_없으면_거부한다() {
        expect("TRANSCRIPT_NO_UTTERANCE", new Runnable() {
            @Override
            public void run() {
                parse("그냥 글만 있고 머리줄이 없습니다\n둘째 줄");
            }
        });
    }

    @Test
    public void 시각이_거꾸로_가면_경고만_한다() {
        TranscriptParser.Result r = parse("참석자 1 / 05:00\n하나\n\n참석자 2 / 01:00\n둘 둘 둘");
        assertEquals(2, r.utterances.size());
        assertEquals(1, r.timeNotSorted);
    }

    @Test
    public void 본문이_빈_발언은_고정_본문의_잡음이다() {
        TranscriptParser.Result r = parse("참석자 1 / 00:01\n\n참석자 2 / 00:02\n안건을 설명드리겠습니다\n\n참석자 1 / 00:03\n   \n");
        assertEquals(3, r.utterances.size());
        assertEquals(TranscriptParser.EMPTY_BODY, r.utterances.get(0).body);
        assertTrue(r.utterances.get(0).noise);
        assertFalse(r.utterances.get(1).noise);
        assertEquals(TranscriptParser.EMPTY_BODY, r.utterances.get(2).body);
        assertTrue(r.utterances.get(2).noise);
        assertEquals(2, r.noiseCount());
    }

    @Test
    public void 화자_번호가_999를_넘으면_거부한다() {
        TranscriptParser.Result ok = parse("참석자 999 / 00:01\n본문 하나 둘\n\n참석자 1 / 00:02\n본문 셋 넷");
        assertEquals(999, ok.utterances.get(0).speakerNo);
        // 이름 표기에 붙이는 새 번호가 1000 이 된다
        MinutesException e = expect("LIMIT_SPEAKER", new Runnable() {
            @Override
            public void run() {
                parse("참석자 999 / 00:01\n본문 하나 둘\n\n김가상 / 00:02\n본문 셋 넷");
            }
        });
        assertEquals(4, e.getLine());
        assertEquals("transcript", e.getSlot());
    }

    @Test
    public void 길이는_가장_늦은_시작_시각이다() {
        TranscriptParser.Result r = parse("참석자 1 / 05:00\n하나 하나\n\n참석자 2 / 01:00\n둘 둘 둘");
        assertEquals(300, r.durationSec());
    }

    @Test
    public void 문장_모양_슬래시_시각_줄은_머리줄이_아니고_본문이다() {
        TranscriptParser.Result r = parse("참석자 1 / 00:01\n안녕하세요 시작합니다\n\n다음 회의는 3월 5일 / 10:30\n이어서 말합니다");
        assertEquals(1, r.utterances.size());
        assertTrue(r.utterances.get(0).body.contains("다음 회의는 3월 5일 / 10:30"));
        assertTrue(r.utterances.get(0).body.contains("이어서 말합니다"));
    }

    @Test
    public void 글자와_공백뿐인_이름_표기는_그대로_화자다() {
        TranscriptParser.Result r = parse("Kim Young Soo / 00:10\n본문 하나 둘\n\n참석자 2 / 00:20\n본문 셋 넷");
        assertEquals(2, r.utterances.size());
        assertEquals(1, r.labelCount);
        assertFalse(TranscriptParser.sentenceLike("Kim Young Soo"));
        assertFalse(TranscriptParser.sentenceLike("참석자 12"));
        assertTrue(TranscriptParser.sentenceLike("다음 회의는 3월 5일"));
    }

    @Test
    public void 시간_예산을_넘기면_거부한다() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 300; i++) {
            sb.append("참석자 1 / 00:").append(i % 60 < 10 ? "0" : "").append(i % 60).append("\n내용 ").append(i).append("\n\n");
        }
        final String[] ls = lines(sb.toString());
        expect("PARSE_TIMEOUT", new Runnable() {
            @Override
            public void run() {
                TranscriptParser.parse(ls, new MinutesBudget(-1L));
            }
        });
    }
}
