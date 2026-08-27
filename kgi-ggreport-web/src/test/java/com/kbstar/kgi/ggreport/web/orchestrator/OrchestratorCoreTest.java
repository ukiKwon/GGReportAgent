package com.kbstar.kgi.ggreport.web.orchestrator;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.service.BidCaseCommandService;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

/**
 * 오케스트레이터 상태머신의 <b>바닥</b> — 실행 테이블({@code ORCH_RUN})의 제약과
 * 기록 포트({@link DbRecorder}). 단계 4 Task 4.1.
 *
 * <p>노드 로직·라우팅은 아직 없다. 여기서 못 박는 것은 그 위에 얹힐 두 가지 전제다:
 * <b>"한 기관에 실행은 하나"</b>와 <b>"기록에 단계가 함께 남는다"</b>.
 *
 * <p>DB 를 건드리므로 {@code @Transactional} 로 롤백한다(시나리오 테스트와 같은 이유).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class OrchestratorCoreTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DbRecorderFactory recorders;

    @Autowired
    private BidCaseCommandService bidCases;

    private String bidCaseId;

    @Before
    public void setUp() {
        BidCase created = bidCases.create("dobong");
        bidCaseId = created.getBidCaseId();
    }

    // ── ORCH_RUN 제약 ────────────────────────────────────────────────────

    /**
     * ⚠️ <b>원본은 이걸 프로세스 메모리로 지켰다</b>
     * ({@code OrchestratorService._running} 딕셔너리). WAS 는 재기동·다중 인스턴스가
     * 있어 그 방식으로는 못 지키므로 DB 제약으로 옮겼다 — 그 제약이 실제로 무는지 본다.
     */
    @Test
    public void 한_기관에_활성_실행은_하나뿐이다() {
        insertRun("run-a", "dobong", "RUNNING", "dobong");
        try {
            insertRun("run-b", "dobong", "RUNNING", "dobong");
            fail("같은 기관에 활성 실행이 둘 만들어졌다 — UK_ORCH_RUN_ACTIVE 가 안 먹는다");
        } catch (DataIntegrityViolationException expected) {
            // 기대한 실패다.
        }
    }

    /**
     * 끝난 실행은 {@code ACTIVE_INSTITUTION_ID} 가 NULL 이라 <b>몇 건이든 쌓인다.</b>
     *
     * <p>이게 이 설계의 핵심이다 — 복합 UNIQUE 로 만들면 Oracle 이 "일부만 NULL 인"
     * 키를 색인해서 <b>끝난 실행끼리 충돌한다</b>(MySQL 은 안 그렇다). 단일 컬럼이라
     * 두 방언이 같게 동작한다.
     */
    @Test
    public void 끝난_실행은_여러_건_쌓인다() {
        insertRun("run-a", "dobong", "DONE", null);
        insertRun("run-b", "dobong", "DONE", null);
        insertRun("run-c", "dobong", "FAILED", null);
        assertEquals(3, count("SELECT COUNT(*) FROM ORCH_RUN WHERE INSTITUTION_ID = 'dobong'"));
    }

    /** 다른 기관끼리는 동시에 돈다 — 잠금 단위가 기관이라는 뜻이다. */
    @Test
    public void 다른_기관은_동시에_돈다() {
        insertRun("run-a", "dobong", "RUNNING", "dobong");
        insertRun("run-b", "nowon", "RUNNING", "nowon");
        assertEquals(2, count("SELECT COUNT(*) FROM ORCH_RUN WHERE ACTIVE_INSTITUTION_ID IS NOT NULL"));
    }

    // ── DbRecorder ───────────────────────────────────────────────────────

    @Test
    public void 단계를_옮기면_이후_기록에_그_단계가_붙는다() {
        Recorder recorder = recorders.create("dobong", bidCaseId);

        recorder.message("영업", "orchestrator", "단계 이동 전", null, null);
        recorder.setStage(5);
        recorder.message("영업", "orchestrator", "단계 이동 후", null, null);
        recorder.notify("영업팀", "결재요청", "기획승인 대기");

        // 이동 전 기록은 시드 단계(1), 이동 후는 5 — 타임라인의 '단계별 묶기'가
        // 이 값 하나에 의존한다(다른 근거가 없다).
        assertEquals(Integer.valueOf(1), stageOfMessage("단계 이동 전"));
        assertEquals(Integer.valueOf(5), stageOfMessage("단계 이동 후"));
        assertEquals(Integer.valueOf(5), jdbc.queryForObject(
                "SELECT STAGE FROM NOTIFICATIONS WHERE CONTENT = '기획승인 대기'", Integer.class));
        assertEquals(Integer.valueOf(5), jdbc.queryForObject(
                "SELECT STAGE FROM INSTITUTIONS WHERE INSTITUTION_ID = 'dobong'", Integer.class));
    }

    /**
     * {@code taskOpen} 은 <b>자리만</b> 연다. 최종반려로 취합 노드가 다시 돌 때
     * {@code taskUpdate} 를 부르면 사람이 해 둔 것(담당·상태)이 초기화되므로 둘이
     * 나뉘어 있다 — 그 차이를 여기서 못 박는다.
     */
    @Test
    public void taskOpen은_이미_있는_작업을_건드리지_않는다() {
        Recorder recorder = recorders.create("dobong", bidCaseId);

        recorder.taskOpen("취합");
        recorder.taskUpdate("취합", "작성중", 40);
        recorder.taskOpen("취합");           // 두 번째 호출 — 아무것도 안 바꿔야 한다

        Map<String, Object> task = jdbc.queryForMap(
                "SELECT STATUS, PROGRESS_PCT FROM TASKS WHERE BID_CASE_ID = ? AND TEAM = '취합'",
                bidCaseId);
        assertEquals("작성중", task.get("STATUS"));
        assertEquals(40, ((Number) task.get("PROGRESS_PCT")).intValue());
        assertEquals("작업이 두 벌 생겼다", 1,
                count("SELECT COUNT(*) FROM TASKS WHERE BID_CASE_ID = '" + bidCaseId
                        + "' AND TEAM = '취합'"));
    }

    /**
     * 에이전트 단계({@code RFI분석}·{@code 취합}·{@code 검증})도 작업 행을 갖는다 —
     * 사람 작성물은 없지만 <b>로그를 붙일 자리</b>가 필요하다. 작성 3팀으로 제한하면
     * 그 노드들의 기록이 갈 곳을 잃는다.
     */
    @Test
    public void 에이전트_단계도_작업_자리를_갖는다() {
        Recorder recorder = recorders.create("dobong", bidCaseId);
        recorder.message("RFI분석", "orchestrator", "공고문 분석 시작", null, null);

        assertNotNull(jdbc.queryForObject(
                "SELECT TASK_ID FROM TASKS WHERE BID_CASE_ID = ? AND TEAM = 'RFI분석'",
                String.class, bidCaseId));
    }

    // ── 노드 enum ────────────────────────────────────────────────────────

    @Test
    public void 게이트_노드가_셋이다() {
        int gates = 0;
        for (OrchNode node : OrchNode.values()) {
            if (node.isGate()) {
                gates++;
            }
        }
        // 기획승인 · 이관결재 · 최종결재. 늘거나 줄면 결재 화면도 함께 봐야 한다.
        assertEquals(3, gates);
    }

    @Test
    public void 저장된_이름으로_노드를_되찾는다() {
        for (OrchNode node : OrchNode.values()) {
            assertEquals(node, OrchNode.of(node.id()));
        }
        try {
            OrchNode.of("draft_team");
            fail("모르는 노드 이름을 조용히 받아들였다 — 실행이 어디서 멈출지 알 수 없어진다");
        } catch (IllegalArgumentException expected) {
            // 기대한 실패다.
        }
    }

    // ── 도우미 ───────────────────────────────────────────────────────────

    private void insertRun(String runId, String institutionId, String status, String active) {
        jdbc.update("INSERT INTO ORCH_RUN (RUN_ID, INSTITUTION_ID, STATUS, CURRENT_NODE,"
                        + " ACTIVE_INSTITUTION_ID, CREATED_AT, UPDATED_AT)"
                        + " VALUES (?, ?, ?, ?, ?, ?, ?)",
                runId, institutionId, status, OrchNode.RFI.id(), active, "t", "t");
    }

    private Integer stageOfMessage(String content) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT STAGE FROM MESSAGES WHERE CONTENT = ?", content);
        assertEquals("기록이 1건이 아니다: " + content, 1, rows.size());
        Object stage = rows.get(0).get("STAGE");
        return stage == null ? null : Integer.valueOf(((Number) stage).intValue());
    }

    private int count(String sql) {
        Integer n = jdbc.queryForObject(sql, Integer.class);
        return n == null ? 0 : n;
    }

    /** 아무것도 기록하지 않는 구현이 포트를 전부 만족하는지(컴파일 + 무해성). */
    @Test
    public void NullRecorder는_아무것도_안_한다() {
        Recorder recorder = new NullRecorder();
        recorder.setStage(9);
        recorder.taskOpen("영업");
        recorder.taskUpdate("영업", "작성중", 10);
        recorder.message("영업", "agent", "x", null, null);
        recorder.notify("영업팀", "쪽지", "x");
        assertNull(jdbc.queryForObject(
                "SELECT MAX(MESSAGE_ID) FROM MESSAGES WHERE CONTENT = 'x'", String.class));
    }
}
