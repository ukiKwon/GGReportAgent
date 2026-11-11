package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 충돌 해소 권한 — 확정·기각 × 충돌 여부 × 팀원·팀장·부장 × 본인 여부 × 충돌 상대 확정값 입력자 여부 전 조합(NEXT 72·77, M6·Q1·Q2). */
public class HeadRulesTest {

    private static final String ACTOR = "1111111";
    private static final String OTHER = "2222222";

    private static Set<String> owners(boolean actorOwns) {
        return actorOwns ? new HashSet<String>(java.util.Arrays.asList(ACTOR, OTHER)) : Collections.singleton(OTHER);
    }

    @Test
    public void 전_조합이_표와_같다() {
        String[] roles = {"영업팀", "영업팀장", "영업부장"};
        for (HeadRules.Action a : HeadRules.Action.values()) {
            for (String role : roles) {
                for (boolean conflict : new boolean[]{false, true}) {
                    for (boolean self : new boolean[]{false, true}) {
                        for (boolean owns : new boolean[]{false, true}) {
                            String proposer = self ? ACTOR : OTHER;
                            String got = HeadRules.blockCode(a, role, ACTOR, proposer, owners(owns), conflict);
                            String want;
                            boolean lead = !"영업팀".equals(role);
                            if (a == HeadRules.Action.REJECT && self) {
                                want = null;                  // 본인 후보 회수는 언제나
                            } else if (!conflict) {
                                want = null;                  // 충돌 없으면 누구나(본인 포함)
                            } else if (!lead) {
                                want = "LEAD_ONLY";
                            } else if (a == HeadRules.Action.CONFIRM && self) {
                                want = "SELF_RESOLVE";
                            } else if (a == HeadRules.Action.REJECT && owns) {
                                want = "OWN_VALUE_GUARD";
                            } else {
                                want = null;
                            }
                            assertEquals(a + "/" + role + "/conflict=" + conflict + "/self=" + self + "/owns=" + owns, want, got);
                        }
                    }
                }
            }
        }
    }

    @Test
    public void 대표_사례() {
        // 확정값 입력자(팀장)가 남의 후보를 '확정'하는 것(자기 값 양보)은 허용, '기각'은 차단
        assertNull(HeadRules.blockCode(HeadRules.Action.CONFIRM, "영업팀장", ACTOR, OTHER, owners(true), true));
        assertEquals("OWN_VALUE_GUARD", HeadRules.blockCode(HeadRules.Action.REJECT, "영업팀장", ACTOR, OTHER, owners(true), true));
        // 부장은 팀장과 같은 자격·같은 제한
        assertEquals("SELF_RESOLVE", HeadRules.blockCode(HeadRules.Action.CONFIRM, "영업부장", ACTOR, ACTOR, owners(false), true));
        assertNull(HeadRules.blockCode(HeadRules.Action.REJECT, "영업부장", ACTOR, OTHER, owners(false), true));
        // 팀원은 충돌 앞에서 LEAD_ONLY, 본인 후보 회수만 예외
        assertEquals("LEAD_ONLY", HeadRules.blockCode(HeadRules.Action.REJECT, "영업팀", ACTOR, OTHER, owners(false), true));
        assertNull(HeadRules.blockCode(HeadRules.Action.REJECT, "영업팀", ACTOR, ACTOR, owners(false), true));
    }

    @Test
    public void 무효_권한과_역할_판정() {
        assertTrue(HeadRules.canVoid("영업팀장", ACTOR, OTHER));
        assertTrue(HeadRules.canVoid("영업부장", ACTOR, OTHER));
        assertTrue(HeadRules.canVoid("영업팀", ACTOR, ACTOR));
        assertFalse(HeadRules.canVoid("영업팀", ACTOR, OTHER));
        assertTrue(HeadRules.isSales(" 영업팀 "));
        assertTrue(HeadRules.isSales("영업팀장"));
        assertTrue(HeadRules.isSales("영업부장"));
        assertFalse(HeadRules.isSales("디자이너"));
        assertFalse(HeadRules.isSales(null));
        assertTrue(HeadRules.isLead("영업부장"));
        assertFalse(HeadRules.isLead("영업팀"));
    }
}
