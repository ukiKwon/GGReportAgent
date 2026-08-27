package com.kbstar.kgi.ggreport.web.mapper.handler;

import com.kbstar.kgi.ggreport.web.domain.ParticipationDecisionEntry;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * CLOB 의 JSON 배열 ↔ {@code List<ParticipationDecisionEntry>} 변환. DB 없이 돈다.
 *
 * <p>여기서 보는 것은 <b>"없음"의 세 가지 표현이 전부 빈 목록이 되는가</b>다.
 * 셋 다 실제로 생긴다 — Oracle 은 {@code ''} 를 NULL 로 바꾸고, MySQL 미러는
 * LONGTEXT 에 DEFAULT 를 못 줘서 앱이 값을 안 넣으면 NULL 이 된다. 하나라도
 * {@code null} 로 새어 나가면 골든의 {@code "participation_decision": []} 이 깨진다.
 */
public class ParticipationDecisionTypeHandlerTest {

    @Test
    public void NULL은_빈_목록이다() {
        assertEmpty(ParticipationDecisionTypeHandler.fromJson(null));
    }

    @Test
    public void 빈_문자열은_빈_목록이다() {
        // Oracle 에서는 이 경우가 NULL 로 오지만, MySQL·과거 데이터에서는 그대로 온다.
        assertEmpty(ParticipationDecisionTypeHandler.fromJson(""));
        assertEmpty(ParticipationDecisionTypeHandler.fromJson("   "));
    }

    @Test
    public void 빈_배열은_빈_목록이다() {
        assertEmpty(ParticipationDecisionTypeHandler.fromJson("[]"));
    }

    @Test
    public void null을_저장하면_빈_배열_문자열이_된다() {
        // DB 에 NULL 을 남기지 않는다 — 다음에 읽는 쪽이 또 분기하지 않게 한다.
        assertEquals("[]", ParticipationDecisionTypeHandler.toJson(null));
    }

    @Test
    public void 한글이_이스케이프되지_않는다() {
        // 원본은 json.dumps(..., ensure_ascii=False) 로 저장했다. 저장 모양을 맞춰 두면
        // 파이썬이 쓴 행과 자바가 쓴 행이 DB 에서 섞여도 눈으로 대조할 수 있다.
        List<ParticipationDecisionEntry> decisions = new ArrayList<>();
        decisions.add(entry(1, "영업담당", "alice", "참여"));
        String json = ParticipationDecisionTypeHandler.toJson(decisions);
        assertTrue("한글이 \\uXXXX 로 이스케이프됐다: " + json, json.contains("영업담당"));
    }

    @Test
    public void 왕복해도_값이_같다() {
        List<ParticipationDecisionEntry> decisions = new ArrayList<>();
        decisions.add(entry(1, "영업담당", "alice", "참여"));
        decisions.add(entry(2, "영업팀장", "bob", "참여"));
        decisions.add(entry(3, "영업부장", "carol", "참여"));

        List<ParticipationDecisionEntry> back = ParticipationDecisionTypeHandler.fromJson(
                ParticipationDecisionTypeHandler.toJson(decisions));

        assertEquals(3, back.size());
        assertEquals(3, back.get(2).getTier());
        assertEquals("영업부장", back.get(2).getRole());
        assertEquals("carol", back.get(2).getBy());
        assertEquals("참여", back.get(2).getChoice());
        assertEquals("2026-08-27T00:00:00+00:00", back.get(2).getAt());
        assertEquals(null, back.get(2).getComment());
    }

    /**
     * 파이썬이 쓴 실제 모양(키 6개, 한글, {@code comment: null})을 그대로 읽는다.
     * 골든 {@code 11}~{@code 14} 의 {@code participation_decision} 원소와 같은 키다.
     */
    @Test
    public void 파이썬이_쓴_JSON을_읽는다() {
        String stored = "[{\"tier\": 1, \"role\": \"영업담당\", \"by\": \"alice\", "
                + "\"at\": \"2026-08-27T00:00:00+00:00\", \"choice\": \"참여\", \"comment\": null}]";
        List<ParticipationDecisionEntry> parsed =
                ParticipationDecisionTypeHandler.fromJson(stored);
        assertEquals(1, parsed.size());
        assertEquals("영업담당", parsed.get(0).getRole());
        assertEquals(null, parsed.get(0).getComment());
    }

    /**
     * ⚠️ 모르는 키는 <b>조용히 버리지 않고 터진다</b>(Jackson 기본값). 결재 이력의
     * 일부가 소리 없이 사라지는 것보다 낫다 — 이 CLOB 을 쓰는 곳은 파이썬 원본과
     * 이 핸들러뿐이라 키 6개가 계약이다.
     */
    @Test(expected = IllegalStateException.class)
    public void 모르는_키가_있으면_터진다() {
        ParticipationDecisionTypeHandler.fromJson("[{\"tier\": 1, \"unknown\": 1}]");
    }

    @Test(expected = IllegalStateException.class)
    public void 깨진_JSON이면_터진다() {
        ParticipationDecisionTypeHandler.fromJson("{not json");
    }

    private static void assertEmpty(List<ParticipationDecisionEntry> value) {
        assertNotNull("null 이 새어 나가면 골든의 participation_decision: [] 이 깨진다", value);
        assertTrue(value.isEmpty());
    }

    private static ParticipationDecisionEntry entry(int tier, String role, String by, String choice) {
        ParticipationDecisionEntry e = new ParticipationDecisionEntry();
        e.setTier(tier);
        e.setRole(role);
        e.setBy(by);
        e.setAt("2026-08-27T00:00:00+00:00");
        e.setChoice(choice);
        return e;
    }
}
