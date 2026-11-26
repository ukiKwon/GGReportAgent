package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.llm.LlmCallException;
import com.kbstar.kgi.ggreport.web.llm.LlmResponse;
import com.kbstar.kgi.ggreport.web.llm.OllamaGuard;
import com.kbstar.kgi.ggreport.web.llm.OllamaLlmClient;
import com.kbstar.kgi.ggreport.web.llm.OllamaProperties;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import com.kbstar.kgi.ggreport.web.web.ApiExceptionHandler;
import com.kbstar.kgi.ggreport.web.web.MenuGuard;
import com.kbstar.kgi.ggreport.web.web.PrepScriptDraftController;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * NEXT 129 ⑤ — AI 초안 컨트롤러·서비스의 판정 순서와 감사 순서. 스프링 컨텍스트 없이 Mockito 협력 객체로 세운다
 * (@MockBean 은 AppTest 의 단일 컨텍스트 규칙을 깬다 — PrepAuditIsolationTest 와 같은 방식). 설계의 PrepScriptDraftOnApiTest 를 대신한다.
 * 같은 service 패키지에 둔 이유: Basis 필드·BoardMaterialAudit.Ctx 생성자가 package-private 이다. 이름·기관은 모두 가상.
 */
public class PrepScriptDraftFlowTest {

    private static final String BID = "b-draft-1";
    private static final String EMP = "3361829";
    private static final String ACT = "SCRIPT_AI_DRAFT";
    private static final String SEND = "SCRIPT_AI_SEND";

    private final ObjectMapper om = new ObjectMapper();
    private PrepService prep;
    private PrepAudit audit;
    private BoardMaterialAudit boardAudit;
    private MenuGuard guard;
    private BoardAccess boardAccess;
    private ScriptDraftBasisReader reader;
    private OllamaLlmClient client;
    private ObjectProvider<OllamaLlmClient> provider;
    private BidPrep bidPrep;
    private ScriptDraftBasisReader.Basis basis;
    private MockMvc mvc;

    @Before
    @SuppressWarnings("unchecked")
    public void 준비() {
        prep = mock(PrepService.class);
        audit = mock(PrepAudit.class);
        boardAudit = mock(BoardMaterialAudit.class);
        guard = mock(MenuGuard.class);
        boardAccess = mock(BoardAccess.class);
        reader = mock(ScriptDraftBasisReader.class);
        client = mock(OllamaLlmClient.class);
        provider = mock(ObjectProvider.class);

        SysUser me = new SysUser();
        me.setEmpNo(EMP);
        me.setStatus("ACTIVE");
        me.setRole("영업팀");
        when(guard.requireActiveUser(any(HttpServletRequest.class))).thenReturn(me);
        when(guard.denied(any(HttpServletRequest.class), any(ApiException.class))).thenAnswer(i -> i.getArgument(1));

        bidPrep = new BidPrep();
        bidPrep.setBidCaseId(BID);
        bidPrep.setInstitutionId("inst-x");
        bidPrep.setInstitutionName("가상구청");
        bidPrep.setStateCd(PrepService.IN_PROGRESS);
        when(prep.requireVisible(any(SysUser.class), eq(BID))).thenReturn(bidPrep);
        when(prep.stateOf(BID)).thenReturn(PrepService.IN_PROGRESS);
        when(boardAccess.canViewCase(EMP, BID)).thenReturn(true);

        when(client.state()).thenReturn(OllamaGuard.State.READY);
        when(provider.getIfAvailable()).thenReturn(client);

        basis = new ScriptDraftBasisReader.Basis();
        basis.instName = "가상구청";
        basis.budget = "예산 1,000억원";
        basis.effect.add("가상 기대효과");
        basis.profit = new BigDecimal("10.14");
        basis.boardId = 7L;
        basis.boardSnap = 1;
        basis.boardConfirmed = true;
        when(reader.read(any(SysUser.class), any(BidPrep.class))).thenReturn(basis);

        when(boardAudit.before("7")).thenReturn(new BoardMaterialAudit.Ctx(7L, BID, null, 1));
        build(0);
    }

    private void build(int cooldownSeconds) {
        OllamaProperties props = new OllamaProperties();
        props.setCooldownSeconds(cooldownSeconds);
        buildWith(new ScriptDraftService(prep, boardAccess, reader, provider, props));
    }

    private void buildWith(ScriptDraftService drafts) {
        PrepScriptDraftController ctl = new PrepScriptDraftController(prep, audit, boardAudit, guard, drafts, provider, boardAccess);
        mvc = MockMvcBuilders.standaloneSetup(ctl).setControllerAdvice(new ApiExceptionHandler(false)).build();
    }

    private static ScriptDraftOut out(String intro, String effect) {
        ScriptDraftOut o = new ScriptDraftOut();
        o.intro = intro;
        o.effect = effect;
        return o;
    }

    private void llmReturns(String intro, String effect) {
        doReturn(new LlmResponse<ScriptDraftOut>(out(intro, effect), "test-model", false)).when(client).draft(any());
    }

    private MockHttpServletResponse draft() throws Exception {
        return mvc.perform(post("/bidcases/" + BID + "/prep/board-script-draft").header("X-Emp-No", EMP)
                .header("X-Screen-Id", "prep_detail").header("X-Button-Id", "script_ai_draft")).andReturn().getResponse();
    }

    private JsonNode json(MockHttpServletResponse r) throws Exception {
        return om.readTree(r.getContentAsString(StandardCharsets.UTF_8));
    }

    private void verifyAct(String outcome, String state) {
        verify(audit).record(eq(BID), eq(ACT), eq(outcome), eq(state), eq("T6"), any(), any());
    }

    // ── 정상 · 감사 순서 ───────────────────────────────────────

    @Test
    public void 확정_이사회_자료는_보내기_전_감사_다음_호출_다음_결과_감사_순서다() throws Exception {
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        MockHttpServletResponse r = draft();
        assertEquals(r.getContentAsString(), 200, r.getStatus());
        JsonNode j = json(r);
        assertEquals("OK", j.path("state").asText());
        assertEquals("순이익은 10.14억원입니다.", j.path("fields").path("effect").asText());
        assertEquals("test-model", j.path("model").asText());
        assertTrue(j.path("ai_draft").asBoolean());
        assertEquals("CONFIRMED", j.path("basis").path("board").asText());
        assertFalse("확정 자료만 실렸으면 확정 전 기준이 아니다", j.path("basis").path("draft").asBoolean(true));

        Iterator<String> keys = j.path("fields").fieldNames();
        assertEquals("intro", keys.next());
        assertEquals("effect", keys.next());
        assertFalse(keys.hasNext());

        InOrder o = inOrder(boardAudit, client, audit);
        o.verify(boardAudit).record(any(), eq(SEND), eq("OK"), any(), any());
        o.verify(client).draft(any());
        o.verify(audit).record(eq(BID), eq(ACT), eq("OK"), eq(PrepService.IN_PROGRESS), eq("T6"), any(), any());
        o.verify(boardAudit).record(any(), eq(ACT), eq("OK"), any(), any());

        ArgumentCaptor<BoardUiIds.Ui> ui = ArgumentCaptor.forClass(BoardUiIds.Ui.class);
        verify(boardAudit).record(any(), eq(SEND), eq("OK"), any(), ui.capture());
        assertEquals("prep_detail", ui.getValue().getScreen());
        assertEquals("script_ai_draft", ui.getValue().getButton());
        assertTrue(ui.getValue().isValid());
    }

    @Test
    public void 호출_실패는_200_EMPTY_사유코드이고_결과_감사는_ERROR() throws Exception {
        doThrow(new LlmCallException(LlmCallException.TIMEOUT, 0)).when(client).draft(any());
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        JsonNode j = json(r);
        assertEquals("EMPTY", j.path("state").asText());
        assertEquals("TIMEOUT", j.path("reason").asText());
        assertEquals("", j.path("fields").path("intro").asText("x"));
        verify(boardAudit).record(any(), eq(SEND), eq("OK"), any(), any());
        verifyAct("ERROR", PrepService.IN_PROGRESS);
        verify(boardAudit).record(any(), eq(ACT), eq("ERROR"), any(), any());
    }

    @Test
    public void 확정_전_이사회_자료는_이사회_감사_줄이_없고_확정_전_기준으로_표시한다() throws Exception {
        basis.boardConfirmed = false;
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        assertEquals("CURRENT", json(r).path("basis").path("board").asText());
        assertTrue(json(r).path("basis").path("draft").asBoolean());
        verify(boardAudit, never()).record(any(), any(), any(), any(), any());
        verifyAct("OK", PrepService.IN_PROGRESS);
    }

    @Test
    public void 자료에_없는_숫자는_그_칸만_비운다() throws Exception {
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 99억원입니다.");
        JsonNode j = json(draft());
        assertEquals("OK", j.path("state").asText());
        assertEquals("", j.path("fields").path("effect").asText("x"));
        assertEquals("NUMBER_NOT_IN_BASIS", j.path("empty_reasons").path("effect").asText());
        assertTrue(j.path("fields").path("intro").asText().startsWith("가상구청"));
    }

    // ── 판정 순서 404 → 403 → 409 → 503 ───────────────────────

    @Test
    public void 못_보는_건은_404이고_HIDDEN이며_읽지도_부르지도_않는다() throws Exception {
        when(prep.requireVisible(any(SysUser.class), eq(BID))).thenThrow(new ApiException(404, "없음"));
        assertEquals(404, draft().getStatus());
        verifyAct("HIDDEN", PrepService.IN_PROGRESS);
        verify(reader, never()).read(any(), any());
        verify(client, never()).draft(any());
    }

    @Test
    public void 담당_영업이나_부장이_아니면_403이고_꺼져_있어도_503이_아니다() throws Exception {
        when(boardAccess.canViewCase(EMP, BID)).thenReturn(false);
        when(provider.getIfAvailable()).thenReturn(null);   // 꺼짐 — 그래도 403 이 먼저
        MockHttpServletResponse r = draft();
        assertEquals(403, r.getStatus());
        assertEquals("SCRIPT_DRAFT_NOT_ALLOWED", json(r).path("detail").path("code").asText());
        verifyAct("DENIED", PrepService.IN_PROGRESS);
        verify(guard).denied(any(HttpServletRequest.class), any(ApiException.class));
        verify(reader, never()).read(any(), any());
    }

    @Test
    public void 확정_개설대기_중단_상태는_409_BLOCKED() throws Exception {
        for (String st : new String[]{PrepService.CONFIRMED, PrepService.OPEN_PENDING, PrepService.CANCELLED}) {
            bidPrep.setStateCd(st);
            MockHttpServletResponse r = draft();
            assertEquals(st, 409, r.getStatus());
            assertEquals("SCRIPT_DRAFT_STATE", json(r).path("detail").path("code").asText());
        }
        verify(audit, times(3)).record(eq(BID), eq(ACT), eq("BLOCKED"), any(), eq("T6"), any(), any());
        verify(client, never()).draft(any());
    }

    @Test
    public void 꺼져_있으면_503_LLM_OFF_BLOCKED() throws Exception {
        when(provider.getIfAvailable()).thenReturn(null);
        MockHttpServletResponse r = draft();
        assertEquals(503, r.getStatus());
        assertEquals("LLM_OFF", json(r).path("detail").path("code").asText());
        verifyAct("BLOCKED", PrepService.IN_PROGRESS);
    }

    @Test
    public void 설정이_막힌_상태_BAD_CONFIG도_503() throws Exception {
        when(client.state()).thenReturn(OllamaGuard.State.BAD_CONFIG);
        assertEquals(503, draft().getStatus());
    }

    // ── 근거 없음 · 쿨다운 · 감사 실패 ─────────────────────────

    @Test
    public void 근거가_없으면_NO_BASIS이고_LLM도_이사회_감사도_없다() throws Exception {
        ScriptDraftBasisReader.Basis empty = new ScriptDraftBasisReader.Basis();
        when(reader.read(any(SysUser.class), any(BidPrep.class))).thenReturn(empty);
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        assertEquals("NO_BASIS", json(r).path("reason").asText());
        verify(client, never()).draft(any());
        verify(boardAudit, never()).record(any(), any(), any(), any(), any());
        verifyAct("BLOCKED", PrepService.IN_PROGRESS);
    }

    @Test
    public void 같은_사번_즉시_재요청은_COOLDOWN이고_두번째_몫의_이사회_감사는_없다() throws Exception {
        build(60);
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        assertEquals("OK", json(draft()).path("state").asText());
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        assertEquals("COOLDOWN", json(r).path("reason").asText());
        verify(client, times(1)).draft(any());
        verify(boardAudit, times(1)).record(any(), eq(SEND), eq("OK"), any(), any());
        verify(audit).record(eq(BID), eq(ACT), eq("BLOCKED"), any(), eq("T6"), any(), any());
    }

    @Test
    public void 보내기_전_감사가_실패하면_500이고_LLM을_부르지_않으며_자리를_돌려준다() throws Exception {
        doThrow(new IllegalStateException("db-secret")).when(boardAudit).record(any(), eq(SEND), any(), any(), any());
        MockHttpServletResponse r = draft();
        assertEquals(500, r.getStatus());
        assertFalse(r.getContentAsString(StandardCharsets.UTF_8).contains("db-secret"));
        verify(client, never()).draft(any());
        verifyAct("ERROR", PrepService.IN_PROGRESS);

        // 자리를 돌려줬는지 — 쿨다운 0 이라 바로 다시 요청이 들어가고 BUSY 가 아니다
        org.mockito.Mockito.reset(boardAudit);
        when(boardAudit.before("7")).thenReturn(new BoardMaterialAudit.Ctx(7L, BID, null, 1));
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        assertEquals("OK", json(draft()).path("state").asText());
    }

    @Test
    public void 결과_감사가_실패하면_500이다() throws Exception {
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        doThrow(new IllegalStateException("db-secret")).when(audit).record(eq(BID), eq(ACT), eq("OK"), any(), eq("T6"), any(), any());
        MockHttpServletResponse r = draft();
        assertEquals(500, r.getStatus());
        assertFalse(r.getContentAsString(StandardCharsets.UTF_8).contains("db-secret"));
    }

    // ── 독립 검토 반영(11-27) ──────────────────────────────────

    @Test
    public void 읽은_뒤_확정이_풀려_before가_null이면_LLM을_부르지_않고_ERROR_한_줄_BASIS_CHANGED이며_자리를_돌려준다() throws Exception {
        when(boardAudit.before("7")).thenReturn(null);
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        JsonNode j = json(r);
        assertEquals("EMPTY", j.path("state").asText());
        assertEquals("BASIS_CHANGED", j.path("reason").asText());
        verify(client, never()).draft(any());
        verifyAct("ERROR", PrepService.IN_PROGRESS);
        verify(boardAudit, never()).record(any(), any(), any(), any(), any());

        // 자리를 돌려줬는지 — 쿨다운 0 이라 바로 다시 요청이 들어가고 BUSY 가 아니다
        when(boardAudit.before("7")).thenReturn(new BoardMaterialAudit.Ctx(7L, BID, null, 1));
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        assertEquals("OK", json(draft()).path("state").asText());
    }

    @Test
    public void LlmException이_아닌_RuntimeException도_LLM_ERROR_200이고_결과_감사는_ERROR_한_줄() throws Exception {
        doThrow(new IllegalStateException("boom-secret")).when(client).draft(any());
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        JsonNode j = json(r);
        assertEquals("LLM_ERROR", j.path("reason").asText());
        assertFalse(r.getContentAsString(StandardCharsets.UTF_8).contains("boom-secret"));
        verifyAct("ERROR", PrepService.IN_PROGRESS);
        verify(boardAudit).record(any(), eq(ACT), eq("ERROR"), any(), any());
    }

    @Test
    public void 자리를_못_잡은_BUSY_갈래는_release를_부르지_않는다() throws Exception {
        OllamaProperties props = new OllamaProperties();
        props.setCooldownSeconds(0);
        ScriptDraftService drafts = org.mockito.Mockito.spy(new ScriptDraftService(prep, boardAccess, reader, provider, props));
        doReturn("BUSY").when(drafts).reserve(any());
        buildWith(drafts);
        MockHttpServletResponse r = draft();
        assertEquals(200, r.getStatus());
        assertEquals("BUSY", json(r).path("reason").asText());
        verify(drafts, never()).release();
        verify(client, never()).draft(any());
        verify(boardAudit, never()).record(any(), any(), any(), any(), any());
        verifyAct("BLOCKED", PrepService.IN_PROGRESS);
    }

    @Test
    public void 자리를_잡은_갈래는_release를_한_번_부른다() throws Exception {
        OllamaProperties props = new OllamaProperties();
        props.setCooldownSeconds(0);
        ScriptDraftService drafts = org.mockito.Mockito.spy(new ScriptDraftService(prep, boardAccess, reader, provider, props));
        buildWith(drafts);
        llmReturns("가상구청은 예산 1,000억원 규모입니다.", "순이익은 10.14억원입니다.");
        assertEquals("OK", json(draft()).path("state").asText());
        verify(drafts, times(1)).release();
    }

    // ── 상태 조회 ──────────────────────────────────────────────

    @Test
    public void 상태_조회_probe_성공은_reachable과_model_ready를_싣고_겹치면_키를_뺀다() throws Exception {
        when(boardAccess.isSalesWriter(EMP)).thenReturn(true);
        when(client.probe()).thenReturn(new OllamaLlmClient.Probe(true, true));
        MockHttpServletResponse r = mvc.perform(get("/llm/script-draft/status").param("probe", "1").header("X-Emp-No", EMP)).andReturn().getResponse();
        assertEquals(200, r.getStatus());
        JsonNode j = json(r);
        assertTrue(j.path("reachable").asBoolean(false));
        assertTrue(j.path("model_ready").asBoolean(false));

        when(client.probe()).thenReturn(new OllamaLlmClient.Probe(true, false));
        JsonNode j2 = json(mvc.perform(get("/llm/script-draft/status").param("probe", "1").header("X-Emp-No", EMP)).andReturn().getResponse());
        assertTrue(j2.path("reachable").asBoolean(false));
        assertFalse(j2.path("model_ready").asBoolean(true));

        when(client.probe()).thenReturn(null);   // 다른 확인이 진행 중 — '닿지 않음'이 아니라 모름
        JsonNode j3 = json(mvc.perform(get("/llm/script-draft/status").param("probe", "1").header("X-Emp-No", EMP)).andReturn().getResponse());
        assertTrue(j3.path("enabled").asBoolean());
        assertTrue(j3.path("reachable").isMissingNode());
        assertTrue(j3.path("model_ready").isMissingNode());
    }

    @Test
    public void 상태_조회는_영업_계열이_아니면_probe를_무시한다() throws Exception {
        when(boardAccess.isSalesWriter(EMP)).thenReturn(false);
        when(boardAccess.isViewAll(EMP)).thenReturn(false);
        MockHttpServletResponse r = mvc.perform(get("/llm/script-draft/status").param("probe", "1").header("X-Emp-No", EMP)).andReturn().getResponse();
        assertEquals(200, r.getStatus());
        JsonNode j = json(r);
        assertTrue(j.path("enabled").asBoolean());
        assertEquals("READY", j.path("state").asText());
        assertEquals("LOCAL_TRIAL", j.path("mode").asText());
        assertTrue(j.path("reachable").isMissingNode());
        verify(client, never()).probe();
    }
}
