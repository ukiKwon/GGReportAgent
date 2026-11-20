package com.kbstar.kgi.ggreport.web.minutes;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 발화자 역할 라벨 — 서버 고정 어휘만 받는다(자유 글·실명 불가). 이름은 모두 가상이다. */
public class SpeakerLabelsTest {

    private static final MinutesMasker EMPTY = new MinutesMasker(null);

    @Test
    public void 어휘_안의_라벨은_공백을_정리해_받는다() {
        assertEquals("구청장", SpeakerLabels.normalize("구청장", 1));
        assertEquals("기관 측", SpeakerLabels.normalize("기관 측", 1));
        assertEquals("은행 측 2", SpeakerLabels.normalize("은행 측 2", 1));
        assertEquals("외부 위원장", SpeakerLabels.normalize(" 외부  위원장 ", 1));
        assertEquals("담당자 9", SpeakerLabels.normalize("담당자 9", 1));
    }

    @Test
    public void 어휘_밖의_글은_LABEL_INVALID_form이고_값을_싣지_않는다() {
        String[] bad = {"측", "홍길동", "김 부장", "은행 측 10", "기관 기관 측", "구청장구청장구청장구청장구청장구청장구청장구청장"};
        for (final String s : bad) {
            MinutesException e = MinutesTestSupport.expect("LABEL_INVALID", new Runnable() {
                @Override
                public void run() {
                    SpeakerLabels.normalize(s, 3);
                }
            });
            assertEquals(Integer.valueOf(1), e.getKinds().get("form"));
            assertEquals(3, e.getTargetNo());
            assertEquals(422, e.getStatus());
            assertTrue(!e.toDetail().toString().contains(s));
        }
    }

    @Test
    public void 빈_값은_라벨_없음이다() {
        assertNull(SpeakerLabels.normalize(null, 1));
        assertNull(SpeakerLabels.normalize("", 1));
        assertNull(SpeakerLabels.normalize("   ", 1));
    }

    @Test
    public void 어휘_전_조합이_가림_검사에_걸리지_않는다() {
        List<String> affils = new ArrayList<String>(Arrays.asList(""));
        affils.addAll(SpeakerLabels.AFFILIATIONS);
        for (String a : affils) {
            for (String r : SpeakerLabels.ROLES) {
                if (SpeakerLabels.SIDE.equals(r) && a.isEmpty()) {
                    continue;   // '측' 은 소속이 있어야 한다
                }
                for (int n = 0; n <= SpeakerLabels.MAX_ORDINAL; n++) {
                    String label = (a.isEmpty() ? "" : a + " ") + r + (n == 0 ? "" : " " + n);
                    assertEquals(label, label, SpeakerLabels.normalize(label, 1));
                    assertTrue(label, EMPTY.check(label, MinutesTestSupport.budget()).isEmpty());
                    assertEquals(label, label, EMPTY.newSession(null, null, MinutesTestSupport.budget()).mask(label));
                }
            }
        }
    }

    @Test
    public void 사전에_같은_이름이_있으면_LABEL_INVALID_name이다() {
        final MinutesMasker m = new MinutesMasker(Arrays.asList("이사장"));
        MinutesException e = MinutesTestSupport.expect("LABEL_INVALID", new Runnable() {
            @Override
            public void run() {
                SpeakerLabels.requireClean(m, "이사장", 2, MinutesTestSupport.budget());
            }
        });
        assertTrue(e.getKinds().containsKey("name"));
        assertEquals(2, e.getTargetNo());
    }

    @Test
    public void 은행_직책도_어휘에_있다() {
        for (String r : Arrays.asList("영업부장", "영업팀장", "지점장", "본부장", "행장", "부장", "차장", "대리")) {
            assertTrue(r, SpeakerLabels.ROLES.contains(r));
            assertEquals("은행 " + r, SpeakerLabels.normalize("은행 " + r, 1));
        }
    }
}
