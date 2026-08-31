package com.kbstar.kgi.ggreport.web.orchestrator;

import com.kbstar.kgi.ggreport.web.AppTest;
import com.kbstar.kgi.ggreport.web.domain.BidCase;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.mapper.OrchMapper;
import com.kbstar.kgi.ggreport.web.service.BidCaseCommandService;
import com.kbstar.kgi.ggreport.web.service.InstitutionService;
import com.kbstar.kgi.ggreport.web.service.OrchestratorService;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 상태머신의 <b>재개 의미론</b> — 설계가 "그래프 자체는 129줄이지만 재개 의미론이
 * 본질"이라 부른 부분이다(§6-B). 3단 게이트를 실제로 돌려 본다.
 *
 * <p>본문이 사내 LLM 에 기대는 네 노드({@code rfi}·{@code draft}·{@code packager}·
 * {@code verifier})는 <b>테스트에서만</b> 무해한 구현으로 갈아 끼운다
 * ({@link NodeHandlers#override}). 그래야 엔진의 라우팅·멈춤·재개를 <b>따로</b> 볼 수
 * 있다 — 운영 배선은 여전히 {@link NotYetMigratedHandler} 라 실수로 통과하지 않는다
 * ({@link #운영_배선은_아직_LLM_노드에서_멈춘다()} 가 그걸 지킨다).
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class OrchestratorEngineTest {

    @Autowired
    private OrchestratorService orchestrator;

    @Autowired
    private InstitutionService institutions;

    @Autowired
    private BidCaseCommandService bidCases;

    @Autowired
    private OrchMapper orch;

    @Autowired
    private NodeHandlers handlers;

    @Autowired
    private JdbcTemplate jdbc;

    /** 실행이 밟은 노드 순서 — 라우팅을 눈으로 보는 자리다. */
    private final List<String> visited = new ArrayList<String>();

    private Institution dobong;

    @Before
    public void setUp() {
        dobong = institutions.require("dobong");
        BidCase created = bidCases.create("dobong");
        assertEquals("dobong", created.getInstitutionId());

        for (OrchNode node : new OrchNode[]{
                OrchNode.RFI, OrchNode.DRAFT, OrchNode.PACKAGER, OrchNode.VERIFIER}) {
            handlers.override(node, recording(node));
        }
    }

    @After
    public void tearDown() {
        // ⚠️ NodeHandlers 는 싱글턴 빈이고 컨텍스트는 캐시된다 — 되돌리지 않으면
        //    다음 테스트가 이 테스트의 배선을 물려받는다.
        for (OrchNode node : new OrchNode[]{
                OrchNode.RFI, OrchNode.DRAFT, OrchNode.PACKAGER, OrchNode.VERIFIER}) {
            handlers.override(node, new NotYetMigratedHandler(node));
        }
    }

    // ── 멈춤과 재개 ──────────────────────────────────────────────────────

    @Test
    public void 첫_게이트에서_멈추고_결재를_기다린다() {
        OrchRun run = orchestrator.start(dobong);

        assertEquals(OrchRun.PENDING_APPROVAL, run.getStatus());
        assertEquals("기획승인", run.getPendingGate());
        assertEquals(OrchNode.GATE_PLAN.id(), run.getCurrentNode());

        // 화면이 읽는 값도 같아야 한다 — "도는 중"이 아니라 "사람 차례"다.
        assertFalse("게이트 대기를 실행 중으로 표시하면 아무도 결재하지 않는다",
                orchestrator.isRunning("dobong"));
        assertEquals("기획승인", orchestrator.pendingGate("dobong"));
        assertFalse(orchestrator.hasFailed("dobong"));

        // 팬아웃은 **부모 1 + 자식 3**을 남긴다(순차 실행이어도 기록의 모양은 같다).
        assertEquals(4, countSteps(run.getRunId(), OrchNode.DRAFT));
        assertEquals(3, countChildren(run.getRunId()));
        assertEquals("영업/전산/예산", String.join("/", visited("draft-role")));
    }

    /** 3단 게이트를 전부 승인하면 끝까지 간다. <b>결재 한 번에 게이트 하나씩</b>이다. */
    @Test
    public void 세_게이트를_모두_승인하면_완료된다() {
        orchestrator.start(dobong);

        assertEquals("기획승인", orchestrator.pendingGate("dobong"));
        orchestrator.resume("dobong", true, "boss", null);

        assertEquals("이관결재", orchestrator.pendingGate("dobong"));
        orchestrator.resume("dobong", true, "boss", null);

        assertEquals("최종결재", orchestrator.pendingGate("dobong"));
        OrchRun done = orchestrator.resume("dobong", true, "boss", null);

        assertEquals(OrchRun.DONE, done.getStatus());
        assertNull("끝난 실행은 게이트를 안 물고 있어야 한다", done.getPendingGate());
        assertNull("끝났으면 활성 자리를 비워야 다음 실행이 시작된다",
                done.getActiveInstitutionId());
        assertEquals("9단계 제출 대기까지 가야 한다", Integer.valueOf(9),
                jdbc.queryForObject("SELECT STAGE FROM INSTITUTIONS WHERE INSTITUTION_ID='dobong'",
                        Integer.class));
    }

    /**
     * ⚠️ <b>결재 판정은 한 번만 쓴다.</b> 상태에 남겨 두면 다음 게이트가 앞의 승인을
     * 자기 것으로 읽어 <b>3단 결재가 1번으로 끝난다</b>. 위 테스트가 이미 그걸 보지만,
     * 실패했을 때 원인이 한 줄로 보이게 따로 확인한다.
     */
    @Test
    public void 한_번_승인으로_두_게이트가_통과되지_않는다() {
        orchestrator.start(dobong);
        orchestrator.resume("dobong", true, "boss", null);

        assertEquals("승인 한 번에 게이트 둘이 통과됐다", "이관결재",
                orchestrator.pendingGate("dobong"));
    }

    // ── 반려의 되돌림 ────────────────────────────────────────────────────

    /** 기획반려는 <b>3팀 재작성</b>으로 돌아간다 — 그래서 다시 기획승인에서 멈춘다. */
    @Test
    public void 기획반려는_3팀_재작성으로_되돌아간다() {
        OrchRun run = orchestrator.start(dobong);
        int draftsBefore = countSteps(run.getRunId(), OrchNode.DRAFT);

        orchestrator.resume("dobong", false, "boss", "배점 근거가 없다");

        assertEquals("반려했는데 다음 게이트로 넘어갔다", "기획승인",
                orchestrator.pendingGate("dobong"));
        assertEquals("3팀이 다시 쓰지 않았다(부모 1 + 자식 3)",
                draftsBefore + 4, countSteps(run.getRunId(), OrchNode.DRAFT));
    }

    /** 이관반려는 <b>기획승인</b>으로 돌아간다(3팀 재작성이 아니다). */
    @Test
    public void 이관반려는_기획승인으로_되돌아간다() {
        OrchRun run = orchestrator.start(dobong);
        orchestrator.resume("dobong", true, "boss", null);
        int draftsBefore = countSteps(run.getRunId(), OrchNode.DRAFT);

        orchestrator.resume("dobong", false, "boss", "예산 근거 부족");

        assertEquals("기획승인", orchestrator.pendingGate("dobong"));
        assertEquals("이관반려인데 3팀이 다시 썼다 — 되돌림 지점이 게이트마다 다르다",
                draftsBefore, countSteps(run.getRunId(), OrchNode.DRAFT));
    }

    /** 최종반려는 <b>취합</b>으로 돌아간다. */
    @Test
    public void 최종반려는_취합으로_되돌아간다() {
        OrchRun run = orchestrator.start(dobong);
        orchestrator.resume("dobong", true, "boss", null);
        orchestrator.resume("dobong", true, "boss", null);
        int packagedBefore = countSteps(run.getRunId(), OrchNode.PACKAGER);

        orchestrator.resume("dobong", false, "boss", "표지 수정 요망");

        assertEquals("최종결재", orchestrator.pendingGate("dobong"));
        assertEquals("취합을 다시 하지 않았다",
                packagedBefore + 1, countSteps(run.getRunId(), OrchNode.PACKAGER));
    }

    // ── 제약과 실패 ──────────────────────────────────────────────────────

    @Test
    public void 도는_중에_또_시작하면_409다() {
        orchestrator.start(dobong);
        try {
            orchestrator.start(dobong);
            fail("한 기관에 실행이 둘 만들어졌다");
        } catch (com.kbstar.kgi.ggreport.web.web.ApiException e) {
            assertEquals(409, e.getStatus());
            assertEquals("already running", e.getMessage());
        }
    }

    @Test
    public void 기다리는_게이트가_없으면_409다() {
        try {
            orchestrator.resume("dobong", true, "boss", null);
            fail("실행도 없는데 재개가 됐다");
        } catch (com.kbstar.kgi.ggreport.web.web.ApiException e) {
            assertEquals(409, e.getStatus());
            assertEquals("no pending gate", e.getMessage());
        }
    }

    /**
     * <b>운영 배선은 아직 LLM 노드에서 멈춘다</b> — 이게 사실이어야 한다.
     * 빈 구현으로 통과시키면 실행이 끝까지 돌아 화면에는 <b>정상 완료로 보이고</b>,
     * 아무도 배점표가 비었다는 것을 모른 채 제출일을 맞는다.
     */
    @Test
    public void 운영_배선은_아직_LLM_노드에서_멈춘다() {
        handlers.override(OrchNode.RFI, new NotYetMigratedHandler(OrchNode.RFI));

        OrchRun run = orchestrator.start(dobong);

        assertEquals(OrchRun.FAILED, run.getStatus());
        assertTrue("사유가 안 남았다: " + run.getFailureReason(),
                run.getFailureReason() != null && run.getFailureReason().contains("이관 전"));
        assertTrue("직전 실행 실패가 화면에 안 보인다", orchestrator.hasFailed("dobong"));
        assertNull("실패한 실행이 활성 자리를 물고 있으면 다시 시작할 수 없다",
                run.getActiveInstitutionId());
    }

    /** 실패한 뒤에는 다시 시작할 수 있어야 한다(활성 자리가 비었으므로). */
    @Test
    public void 실패한_뒤에는_다시_시작할_수_있다() {
        handlers.override(OrchNode.RFI, new NotYetMigratedHandler(OrchNode.RFI));
        orchestrator.start(dobong);

        handlers.override(OrchNode.RFI, recording(OrchNode.RFI));
        OrchRun retried = orchestrator.start(dobong);

        assertEquals(OrchRun.PENDING_APPROVAL, retried.getStatus());
        assertFalse("새 실행이 시작됐는데 '직전 실패'가 남아 있다",
                orchestrator.hasFailed("dobong"));
    }

    // ── 도우미 ───────────────────────────────────────────────────────────

    /** 밟은 노드를 기록만 하는 무해한 본문. */
    private NodeHandler recording(final OrchNode node) {
        return new NodeHandler() {
            @Override
            public Map<String, Object> run(Map<String, Object> state, Recorder recorder) {
                visited.add(node.id());
                if (node == OrchNode.DRAFT) {
                    visited.add("draft-role:" + state.get("role"));
                }
                return Collections.emptyMap();
            }
        };
    }

    private List<String> visited(String prefix) {
        List<String> out = new ArrayList<String>();
        for (String entry : visited) {
            if (entry.startsWith(prefix + ":")) {
                out.add(entry.substring(prefix.length() + 1));
            }
        }
        return out;
    }

    /** 팬아웃 자식 — {@code PARENT_STEP_ID} 가 붙은 것. 조인 판정의 근거다. */
    private int countChildren(String runId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ORCH_STEP WHERE RUN_ID = ? AND PARENT_STEP_ID IS NOT NULL",
                Integer.class, runId);
        return n == null ? 0 : n;
    }

    private int countSteps(String runId, OrchNode node) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ORCH_STEP WHERE RUN_ID = ? AND NODE = ?",
                Integer.class, runId, node.id());
        return n == null ? 0 : n;
    }

    /** 컴파일 경고 방지용 — 상태 맵 타입이 바뀌면 여기서 먼저 드러난다. */
    @SuppressWarnings("unused")
    private static Map<String, Object> emptyState() {
        return new LinkedHashMap<String, Object>();
    }
}
