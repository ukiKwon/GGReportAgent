package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.kbstar.kgi.ggreport.web.minutes.MinutesTestSupport.UTF8;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 저장 전 발언 수정·화자 라벨 — {@link MinutesParse.Edits}. 이름은 모두 가상이다(가상일·도담). */
public class MinutesParseEditsTest {

    private static final MinutesMasker M = new MinutesMasker(Arrays.asList("가상일", "도담"));

    private static final String T = "참석자 1 / 00:05\n안녕하세요 가상일님 회의를 시작합니다"
            + "\n\n참석자 2 / 00:20\n네 알겠습니다 안건을 보겠습니다"
            + "\n\n참석자 1 / 00:40\n연락처 010-1234-5678 입니다"
            + "\n\n참석자 2 / 01:00\n가상일님과 도담님이 오셨습니다";

    private static MinutesParse parse(Map<Integer, String> labels, Map<Integer, String> utters,
                                      java.util.Collection<String> terms) {
        return MinutesParse.parse(T.getBytes(UTF8), null, null, null, M, terms, null,
                new MinutesParse.Edits(labels, utters), MinutesTestSupport.budget());
    }

    private static MinutesParse parse(Map<Integer, String> labels, Map<Integer, String> utters) {
        return parse(labels, utters, null);
    }

    private static Map<Integer, String> one(int k, String v) {
        Map<Integer, String> m = new LinkedHashMap<Integer, String>();
        m.put(Integer.valueOf(k), v);
        return m;
    }

    private static final Map<Integer, String> NONE = Collections.<Integer, String>emptyMap();

    @Test
    public void 수정_글의_사전_이름과_전화번호도_가려_저장되고_건수에_들어간다() {
        MinutesParse base = parse(NONE, NONE);
        MinutesParse p = parse(NONE, one(2, "네 가상일님 010-9999-8888 확인"));
        String body = p.utterances.get(1).body;
        assertFalse(body.contains("가상일"));
        assertFalse(body.contains("9999"));
        assertTrue(body.contains("[이름]") && body.contains("[가림]"));
        assertTrue(p.utterances.get(1).edited);
        assertFalse(p.utterances.get(0).edited);
        assertEquals(base.maskName + 1, p.maskName);
        assertEquals(base.maskPii + 1, p.maskPii);
        assertEquals(1, p.editedCnt);
    }

    @Test
    public void digest는_수정과_무관하고_editsDigest는_수정이_있을_때만_있다() {
        MinutesParse base = parse(NONE, NONE);
        MinutesParse edited = parse(one(1, "기관 측"), one(2, "가상 수정"));
        MinutesParse other = parse(one(1, "기관 측"), one(2, "다른 수정"));
        assertNull(base.editsDigest);
        assertEquals(base.digest, edited.digest);
        assertEquals(64, edited.editsDigest.length());
        assertNotEquals(edited.editsDigest, other.editsDigest);
        assertEquals("기관 측", edited.labels.get(Integer.valueOf(1)));
    }

    @Test
    public void 원문과_같은_수정은_고친_것으로_치지_않는다() {
        MinutesParse p = parse(NONE, one(2, "네 알겠습니다 안건을 보겠습니다"));
        assertEquals(0, p.editedCnt);
        assertNull(p.editsDigest);
        assertFalse(p.utterances.get(1).edited);
    }

    @Test
    public void 없는_발언과_없는_화자는_422이고_번호를_싣는다() {
        MinutesException a = MinutesTestSupport.expect("EDIT_SEQ_UNKNOWN", new Runnable() {
            @Override
            public void run() {
                parse(NONE, one(99, "가상"));
            }
        });
        assertEquals(99, a.getTargetNo());
        MinutesException b = MinutesTestSupport.expect("LABEL_SPEAKER_UNKNOWN", new Runnable() {
            @Override
            public void run() {
                parse(one(7, "기관 측"), NONE);
            }
        });
        assertEquals(7, b.getTargetNo());
    }

    @Test
    public void 추가_가림_단어와_겹치는_라벨은_LABEL_INVALID_term이다() {
        MinutesException e = MinutesTestSupport.expect("LABEL_INVALID", new Runnable() {
            @Override
            public void run() {
                parse(one(1, "은행 측"), NONE, Collections.singletonList("은행"));
            }
        });
        assertEquals(Integer.valueOf(1), e.getKinds().get("term"));
    }

    @Test
    public void 수정_글의_제어_문자는_CONTROL_CHAR이고_칸과_번호를_싣는다() {
        MinutesException e = MinutesTestSupport.expect("CONTROL_CHAR", new Runnable() {
            @Override
            public void run() {
                parse(NONE, one(2, "수정" + MinutesTestSupport.cp(0x202E) + "글"));
            }
        });
        assertEquals("edit", e.getSlot());
        assertEquals(2, e.getTargetNo());
    }

    // ── 가림 토큰 보존(EDIT_MASK_REMOVED) ──

    @Test
    public void 저장_전_가린_이름_자리를_일반_글로_바꾸면_422_EDIT_MASK_REMOVED다() {
        MinutesException e = MinutesTestSupport.expect("EDIT_MASK_REMOVED", new Runnable() {
            @Override
            public void run() {
                parse(NONE, one(1, "안녕하세요 박외부 위원장님 말씀"));   // 원래 가린 자리([이름]) 1곳을 지웠다
            }
        });
        assertEquals("edit", e.getSlot());
        assertEquals(1, e.getTargetNo());
        assertEquals(Integer.valueOf(1), e.getKinds().get("name"));
        assertFalse(e.toDetail().toString().contains("박외부"));
    }

    @Test
    public void 저장_전_전화번호_가림을_지우면_pii가_빠졌다고_422다() {
        MinutesException e = MinutesTestSupport.expect("EDIT_MASK_REMOVED", new Runnable() {
            @Override
            public void run() {
                parse(NONE, one(3, "연락처 입니다"));
            }
        });
        assertEquals(Integer.valueOf(1), e.getKinds().get("pii"));
    }

    @Test
    public void 저장_전_가린_자리에_원래_이름을_다시_적으면_다시_가려지고_통과한다() {
        // 11-23 qa P2-A: 같은 규칙으로 가린 글끼리 비교 — 사전 이름을 다시 적으면 그 자리가 다시 [이름]이 되어 개수가 같고, 저장 본문에 이름이 남지 않는다
        MinutesParse p = parse(NONE, one(4, "[이름]님과 도담님이 오셨습니다"));
        assertEquals(1, p.editedCnt);
        assertFalse(p.utterances.get(3).body.contains("도담"));
    }

    @Test
    public void 저장_전_이름_두_자리_중_하나를_지우면_빠진_수_1이다() {
        MinutesException e = MinutesTestSupport.expect("EDIT_MASK_REMOVED", new Runnable() {
            @Override
            public void run() {
                parse(NONE, one(4, "[이름]님이 오셨습니다"));
            }
        });
        assertEquals(Integer.valueOf(1), e.getKinds().get("name"));
        assertEquals(4, e.getTargetNo());
    }

    @Test
    public void 가림_토큰을_그대로_두고_나머지만_고치면_통과한다() {
        MinutesParse p = parse(NONE, one(4, "[이름]님과 [이름]님이 오셨습니다 모두 반갑습니다"));
        assertEquals(1, p.editedCnt);
        assertTrue(p.utterances.get(3).body.contains("반갑습니다"));
    }

    @Test
    public void 줄_가림_토큰은_고쳐_써도_토큰_수로_비교한다() {
        String masked = "앞 " + MinutesMasker.LINE_TOKEN + " 뒤";
        assertTrue(MinutesMasker.removedTokens(masked, masked).isEmpty());
        assertEquals(Integer.valueOf(1), MinutesMasker.removedTokens(masked, "앞 개인정보 의심 줄 뒤").get("line"));
        assertEquals(Integer.valueOf(1), MinutesMasker.removedTokens("[이름] [이름]", "[이름] 가상").get("name"));
        assertTrue(MinutesMasker.removedTokens("[이름]", "[이름] [이름] [가림]").isEmpty());   // 늘어나는 것은 허용
    }

    @Test
    public void 기준_가림은_별도_세션이라_본_세션의_건수와_이름_후보를_바꾸지_않는다() {
        MinutesParse base = parse(NONE, NONE);
        assertEquals(Integer.valueOf(2), base.nameCandidates.get("가상일"));   // 발언 1·4
        // 발언 1 을 가린 자리를 그대로 둔 채 고친다 — 본 세션은 발언 1 의 원문을 보지 않으므로 가상일 적중이 1 줄어야 한다
        MinutesParse p = parse(NONE, one(1, "안녕하세요 [이름]님 시작합니다"));
        assertEquals(base.maskName - 1, p.maskName);
        assertEquals(Integer.valueOf(1), p.nameCandidates.get("가상일"));
        assertEquals(base.released, p.released);
    }

    private static MinutesParse parseText(String tx, java.util.Collection<String> terms,
                                          java.util.Collection<String> release, Map<Integer, String> utters) {
        return MinutesParse.parse(tx.getBytes(UTF8), null, null, null, M, terms, release,
                new MinutesParse.Edits(NONE, utters), MinutesTestSupport.budget());
    }

    private static final String T2 = "참석자 1 / 00:05\n박외부 말씀\n\n참석자 2 / 00:20\n네 알겠습니다";

    @Test
    public void 고친_뒤_가릴_단어를_더해도_지우지_않은_자리는_422가_아니다() {
        MinutesParse p = parseText(T2, Collections.singletonList("박외부"), null, one(1, "박외부 말씀 고침"));
        assertEquals(1, p.editedCnt);
        assertEquals("[이름] 말씀 고침", p.utterances.get(0).body);
        assertFalse(p.utterances.get(0).body.contains("박외부"));
    }

    @Test
    public void 가리지_않기를_풀고_다시_올려도_고친_글의_그_이름은_가려지고_422가_아니다() {
        String edit = "안녕하세요 가상일님 다시 시작합니다";
        MinutesParse first = parseText(T, null, Collections.singletonList("가상일"), one(1, edit));
        assertTrue(first.utterances.get(0).body.contains("가상일"));
        MinutesParse second = parseText(T, null, null, one(1, edit));
        assertFalse(second.utterances.get(0).body.contains("가상일"));
        assertTrue(second.utterances.get(0).body.contains("[이름]"));
        assertEquals(1, second.editedCnt);
    }

    @Test
    public void 옮기기는_막지_않는다_종류별_개수_검사라서() {
        // 개수 검사의 한계를 고정한다 — [이름] 위치를 바꾸는 것은 통과한다(실수 방지 목적, 위치·짝은 보지 않음)
        MinutesParse p = parse(NONE, one(1, "님 안녕 [이름]"));
        assertEquals(1, p.editedCnt);
        assertTrue(p.utterances.get(0).body.contains("[이름]"));
    }

    @Test
    public void 가릴_단어를_더한_뒤에도_진짜_삭제는_422다() {
        MinutesException e = MinutesTestSupport.expect("EDIT_MASK_REMOVED", new Runnable() {
            @Override
            public void run() {
                parseText(T2, Collections.singletonList("박외부"), null, one(1, "말씀"));
            }
        });
        assertEquals("edit", e.getSlot());
        assertEquals(1, e.getTargetNo());
        assertEquals(Integer.valueOf(1), e.getKinds().get("name"));
        assertFalse(e.toDetail().toString().contains("박외부"));
    }

    @Test
    public void 이름_자리를_지우면_release_없이도_422다() {
        MinutesException e = MinutesTestSupport.expect("EDIT_MASK_REMOVED", new Runnable() {
            @Override
            public void run() {
                parseText(T, null, null, one(1, "안녕하세요 님 회의를 시작합니다"));
            }
        });
        assertEquals(Integer.valueOf(1), e.getKinds().get("name"));
    }
}
