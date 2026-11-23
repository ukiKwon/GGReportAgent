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

    /**
     * 현재 동작의 기록(어휘는 바꾸지 않는다): 직원 명단에 성+한 글자 두 글자 이름이 '차장'·'위원'·'감사'와 같게 들어 있으면
     * (가상 이름 — 실제 명단과의 대조는 data-auditor 몫) 그 어휘 라벨은 저장 단계(requireClean)에서 LABEL_INVALID{name}으로 막힌다.
     * 두 글자 이름은 앞 글자 앞이 한글이 아니고 뒤가 끝·공백이면 가려지기 때문이다(MinutesMasker.boundaryOk).
     * 어휘 검사(normalize)는 통과하므로 막힘은 명단에 같은 이름이 있는 경우에만 생긴다.
     */
    @Test
    public void 사전에_두_글자_이름이_어휘_직책과_같으면_그_어휘_라벨은_LABEL_INVALID_name으로_막힌다() {
        for (final String role : Arrays.asList("차장", "위원", "감사")) {
            assertEquals(role, SpeakerLabels.normalize(role, 1));   // 어휘로는 유효
            final MinutesMasker m = new MinutesMasker(Arrays.asList(role));
            MinutesException e = MinutesTestSupport.expect("LABEL_INVALID", new Runnable() {
                @Override
                public void run() {
                    SpeakerLabels.requireClean(m, role, 4, MinutesTestSupport.budget());
                }
            });
            assertEquals(role, Integer.valueOf(1), e.getKinds().get("name"));
            assertEquals(4, e.getTargetNo());
            assertTrue(role, !e.toDetail().toString().contains(role));
            // 소속·번호가 붙어도 같다(앞은 공백, 뒤는 끝·공백)
            final String withAffil = "은행 " + role + " 2";
            MinutesException e2 = MinutesTestSupport.expect("LABEL_INVALID", new Runnable() {
                @Override
                public void run() {
                    SpeakerLabels.requireClean(m, withAffil, 4, MinutesTestSupport.budget());
                }
            });
            assertTrue(withAffil, e2.getKinds().containsKey("name"));
        }
    }

    @Test
    public void 은행_직책도_어휘에_있다() {
        for (String r : Arrays.asList("영업부장", "영업팀장", "지점장", "본부장", "행장", "부장", "차장", "대리")) {
            assertTrue(r, SpeakerLabels.ROLES.contains(r));
            assertEquals("은행 " + r, SpeakerLabels.normalize("은행 " + r, 1));
        }
    }
}
