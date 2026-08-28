package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.dto.TeamStatus;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 결재 라인 — 누구 결재함에 무엇이 뜨는가. Task 5B.2 에서 가장 틀리기 쉬운 부분이다.
 *
 * <p>결재 라인(사용자 확정): 팀원 → <b>그 팀의 팀장</b>,
 * 디자이너 → <b>영업팀장</b> → <b>영업부장</b>(최종).
 *
 * <p>여기서 틀리면 증상이 조용하다 — 카드가 <b>안 뜨거나</b>(결재가 영원히 멈춘다)
 * <b>두 사람에게 동시에 뜬다</b>(누가 봤는지 알 수 없어진다). 둘 다 오류가 아니라서
 * 실행해 봐서는 못 찾는다.
 */
public class ApprovalsQueueTest {

    private static List<String> pairsOf(String role) {
        List<String> out = new ArrayList<>();
        for (TeamStatus pair : ApprovalsService.queueFor(role)) {
            out.add(pair.getTeam() + "/" + pair.getStatus());
        }
        return out;
    }

    @Test
    public void 팀장은_자기_팀의_제출건만_본다() {
        assertEquals(java.util.Collections.singletonList("전산/1차완료"), pairsOf("전산팀장"));
        assertEquals(java.util.Collections.singletonList("예산/1차완료"), pairsOf("예산팀장"));
    }

    /** 디자이너는 영업팀 소속이라 1차 결재를 영업팀장이 받는다. */
    @Test
    public void 영업팀장은_자기팀에_더해_디자이너_1차까지_본다() {
        assertEquals(java.util.Arrays.asList("영업/1차완료", "디자이너/1차완료"),
                pairsOf("영업팀장"));
    }

    /**
     * ⚠️ 영업부장은 <b>디자이너 최종본만</b> 본다. 팀 작업을 겹쳐 가지면 팀장이 이미
     * 본 카드가 부장 결재함에 또 뜬다.
     */
    @Test
    public void 영업부장은_디자이너_최종본만_본다() {
        assertEquals(java.util.Collections.singletonList("디자이너/2차완료"),
                pairsOf(Teams.FINAL_APPROVER));
    }

    /**
     * ⚠️ 상태까지 함께 거르는 이유가 여기 있다. 같은 디자이너 작업이 <b>단계마다 다른
     * 사람</b>에게 간다 — 팀만 보면 팀장과 부장 결재함에 같은 카드가 동시에 뜬다.
     */
    @Test
    public void 디자이너_작업은_단계마다_한_사람에게만_간다() {
        assertTrue("영업팀장은 1차완료를 본다", pairsOf("영업팀장").contains("디자이너/1차완료"));
        assertTrue("영업부장은 2차완료를 본다",
                pairsOf(Teams.FINAL_APPROVER).contains("디자이너/2차완료"));
        assertTrue("영업팀장이 최종본까지 보면 안 된다",
                !pairsOf("영업팀장").contains("디자이너/2차완료"));
        assertTrue("영업부장이 1차까지 보면 안 된다",
                !pairsOf(Teams.FINAL_APPROVER).contains("디자이너/1차완료"));
    }

    /**
     * 결재 권한이 없는 역할은 <b>빈 목록</b>이다.
     *
     * <p>⚠️ 빈 목록으로 질의를 돌리면 안 된다 — 빈 {@code IN} 절은 SQL 오류다.
     * {@code ApprovalsService.forRole} 이 먼저 거른다.
     */
    @Test
    public void 결재권한이_없는_역할은_빈_목록이다() {
        for (String role : new String[]{"영업팀", "전산팀", "예산팀", "디자이너", "", "없는역할"}) {
            assertTrue(role + " 이(가) 결재 대상을 갖는다", ApprovalsService.queueFor(role).isEmpty());
        }
    }
}
