package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.llm.LlmCallException;
import com.kbstar.kgi.ggreport.web.llm.LlmModelUnavailableException;
import com.kbstar.kgi.ggreport.web.llm.OllamaProperties;
import org.junit.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** NEXT 129 ⑤ — 발표 대본 AI 초안 서비스의 순수 함수(묻는 칸·허용 숫자·정리·사유 매핑·자리 잡기). DB·서버 없음. */
public class ScriptDraftServiceTest {

    private static Set<String> set(String... k) {
        return new LinkedHashSet<String>(Arrays.asList(k));
    }

    private static ScriptDraftBasisReader.Basis basis() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        b.instName = "가상구청";
        b.budget = "예산 1,000억원";
        b.staff = "임직원 350명";
        return b;
    }

    private static ScriptDraftService.Plan plan(ScriptDraftBasisReader.Basis b, Set<String> ask) {
        ScriptDraftPrompt.Facts f = ScriptDraftPrompt.facts(b, ask);
        return new ScriptDraftService.Plan(b, ask, f, ScriptDraftPrompt.build(f, ask));
    }

    private static ScriptDraftOut out(String intro, String effect) {
        ScriptDraftOut o = new ScriptDraftOut();
        o.intro = intro;
        o.effect = effect;
        return o;
    }

    @Test
    public void 묻는_칸은_근거가_있을_때만() {
        ScriptDraftBasisReader.Basis b = new ScriptDraftBasisReader.Basis();
        b.instName = "가상구청";
        b.budget = "1,000억원";
        assertEquals(set("intro"), ScriptDraftService.askable(b));

        ScriptDraftBasisReader.Basis e = new ScriptDraftBasisReader.Basis();
        e.effect.add("가상 기대효과");
        assertEquals(set("effect"), ScriptDraftService.askable(e));

        ScriptDraftBasisReader.Basis money = new ScriptDraftBasisReader.Basis();
        money.instName = "가상구청";
        money.amountTotal = new BigDecimal("6.00");
        money.profit = new BigDecimal("10.14");
        assertTrue("이사회 숫자만으로는 묻지 않는다", ScriptDraftService.askable(money).isEmpty());
    }

    @Test
    public void 경쟁_동향이_있으면_사전_설명도_묻는다() {
        ScriptDraftBasisReader.Basis c = new ScriptDraftBasisReader.Basis();
        c.instName = "가상구청";
        c.competition.add("가상 경쟁은행 동향");
        assertEquals(set("intro", "effect"), ScriptDraftService.askable(c));

        ScriptDraftBasisReader.Basis noName = new ScriptDraftBasisReader.Basis();
        noName.competition.add("가상 경쟁은행 동향");
        assertEquals("기관명이 없으면 intro 는 묻지 않는다", set("effect"), ScriptDraftService.askable(noName));
    }

    @Test
    public void 경쟁_동향은_한_번만_싣고_두_칸의_허용_숫자에_모두_들어간다() {
        ScriptDraftBasisReader.Basis b = basis();
        b.competition.add("경쟁은행 3곳이 참여 예상");
        b.effect.add("가상 기대효과");
        ScriptDraftService.Plan p = plan(b, set("intro", "effect"));
        String key = "경쟁은행 동향 및 중점 제안 사항";
        int idx = p.prompt.indexOf(key);
        assertTrue(idx >= 0);
        assertEquals("같은 키는 한 번만", -1, p.prompt.indexOf(key, idx + 1));
        assertTrue(p.facts.allowed.get("intro").contains("3"));
        assertTrue(p.facts.allowed.get("effect").contains("3"));
    }

    @Test
    public void 칸별_허용_숫자_집합() {
        ScriptDraftBasisReader.Basis b = basis();
        b.competition.add("경쟁은행 3곳");
        b.effect.add("가상 기대효과");
        b.profit = new BigDecimal("10.1400");
        ScriptDraftService.Plan p = plan(b, set("intro", "effect"));

        // intro 에 순이익 숫자 — intro 집합에 없다
        ScriptDraftService.Result r = ScriptDraftService.finish(p, out("순이익은 10.14억원입니다.", "순이익은 10.14억원입니다."), "test-model", 5L);
        assertEquals("", r.fields.get("intro"));
        assertEquals("NUMBER_NOT_IN_BASIS", r.emptyReasons.get("intro"));
        assertEquals("effect 의 10.14 는 통과", "순이익은 10.14억원입니다.", r.fields.get("effect"));
        assertEquals("OK", r.state);

        // 임직원 수 350 은 intro 에서만
        r = ScriptDraftService.finish(p, out("임직원 350명 규모입니다.", "임직원 350명 규모입니다."), "test-model", 5L);
        assertEquals("임직원 350명 규모입니다.", r.fields.get("intro"));
        assertEquals("", r.fields.get("effect"));
        assertEquals("NUMBER_NOT_IN_BASIS", r.emptyReasons.get("effect"));

        // 연도는 어느 집합에도 없다
        r = ScriptDraftService.finish(p, out("2026년 건입니다.", "2026년 건입니다."), "test-model", 5L);
        assertEquals("", r.fields.get("intro"));
        assertEquals("", r.fields.get("effect"));
        assertEquals("EMPTY", r.state);
        assertEquals("ALL_BLANKED", r.reason);
        assertEquals("답을 받았으니 결과는 OK", "OK", r.outcome());
    }

    @Test
    public void 같은_값은_표기가_달라도_같게_본다() {
        Set<String> allowed = new LinkedHashSet<String>();
        ScriptDraftService.collect("합계 6.00억원, 1,234천원", allowed);
        assertTrue(ScriptDraftService.numbersAllowed("6억원", allowed));
        assertTrue(ScriptDraftService.numbersAllowed("1234천원", allowed));
        assertFalse(ScriptDraftService.numbersAllowed("99억원", allowed));
        assertTrue(ScriptDraftService.numbersAllowed("숫자 없는 문장", allowed));
    }

    @Test
    public void 묻지_않은_칸에_모델이_글을_넣어도_비우고_NO_BASIS() {
        ScriptDraftBasisReader.Basis b = basis();   // intro 만 묻는다
        ScriptDraftService.Plan p = plan(b, set("intro"));
        ScriptDraftService.Result r = ScriptDraftService.finish(p, out("가상구청은 예산 1,000억원 규모입니다.", "끼워 넣은 기대효과"), "test-model", 5L);
        assertEquals("", r.fields.get("effect"));
        assertEquals("NO_BASIS", r.emptyReasons.get("effect"));
        assertTrue(r.fields.get("intro").startsWith("가상구청"));
    }

    @Test
    public void 개인정보_모양이_나오면_그_칸을_비운다() {
        ScriptDraftBasisReader.Basis b = basis();
        ScriptDraftService.Plan p = plan(b, set("intro"));
        ScriptDraftService.Result r = ScriptDraftService.finish(p, out("문의는 test@example.com 으로 하세요.", ""), "test-model", 5L);
        assertEquals("", r.fields.get("intro"));
        assertEquals("PII", r.emptyReasons.get("intro"));
    }

    @Test
    public void tidy는_상한과_제어문자를_다룬다() {
        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 13; i++) {
            many.append("줄").append(i).append('\n');
        }
        assertEquals(12, ScriptDraftService.tidy(many.toString()).split("\n").length);

        StringBuilder wide = new StringBuilder();
        for (int i = 0; i < 1200; i++) {
            wide.append((char) ('가' + (i % 10)));
            if (i % 250 == 249) {
                wide.append('\n');
            }
        }
        assertTrue(ScriptDraftService.tidy(wide.toString()).length() <= 1000 + 12);

        assertEquals("a b", ScriptDraftService.tidy("a\tb"));
        assertEquals("ab", ScriptDraftService.tidy(new String(new char[]{'a', (char) 0x202e, 'b'})).replace(" ", ""));
        assertEquals("", ScriptDraftService.tidy(null));
    }

    @Test
    public void 실패_예외는_사유_코드로_바뀐다() {
        assertEquals("MODEL_MISSING", ScriptDraftService.reasonOf(new LlmModelUnavailableException(LlmCallException.MODEL_MISSING, 404, "m")));
        assertEquals("BUSY", ScriptDraftService.reasonOf(new LlmCallException(LlmCallException.BUSY, 0)));
        assertEquals("TIMEOUT", ScriptDraftService.reasonOf(new LlmCallException(LlmCallException.TIMEOUT, 0)));
        assertEquals("UNREACHABLE", ScriptDraftService.reasonOf(new LlmCallException(LlmCallException.UNREACHABLE, 0)));
        assertEquals("BAD_OUTPUT", ScriptDraftService.reasonOf(new LlmCallException(LlmCallException.BAD_OUTPUT, 200)));
        assertEquals("BAD_OUTPUT", ScriptDraftService.reasonOf(new LlmCallException(LlmCallException.TRUNCATED, 200)));
        assertEquals("LLM_ERROR", ScriptDraftService.reasonOf(new LlmCallException(LlmCallException.HTTP, 500)));
    }

    // ── 자리 잡기 ─────────────────────────────────────────────

    private static ScriptDraftService service(int cooldownSeconds) {
        OllamaProperties p = new OllamaProperties();
        p.setCooldownSeconds(cooldownSeconds);
        return new ScriptDraftService(null, null, null, null, p);
    }

    @Test
    public void 같은_사번은_COOLDOWN_다른_사번_동시는_BUSY_release_뒤에는_잡힌다() {
        ScriptDraftService s = service(60);
        assertNull(s.reserve("1111111"));
        assertEquals("COOLDOWN", s.reserve("1111111"));
        assertEquals("BUSY", s.reserve("2222222"));
        s.release();
        assertNull("release 뒤 다른 사번은 잡힌다", s.reserve("2222222"));
        s.release();
        assertEquals("앞 요청 시작부터 쿨다운", "COOLDOWN", s.reserve("1111111"));
    }

    @Test
    public void 쿨다운_0이면_COOLDOWN이_없다() {
        ScriptDraftService s = service(0);
        assertNull(s.reserve("1111111"));
        s.release();
        assertNull(s.reserve("1111111"));
        s.release();
    }

    // ── 응답 모양 ─────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    public void 응답의_basis_draft는_실린_자료가_확정_전일_때_true() {
        ScriptDraftBasisReader.Basis b = basis();
        b.effect.add("가상 기대효과");
        b.profit = new BigDecimal("10.14");
        b.boardId = 7L;
        b.boardConfirmed = false;
        ScriptDraftService.Plan p = plan(b, set("intro", "effect"));
        ScriptDraftService.Result r = ScriptDraftService.finish(p, out("가상구청입니다.", "순이익은 10.14억원입니다."), "test-model", 5L);
        Map<String, Object> m = r.toMap();
        Map<String, Object> bs = (Map<String, Object>) m.get("basis");
        assertEquals("CURRENT", bs.get("board"));
        assertEquals(Boolean.TRUE, bs.get("draft"));
        assertEquals("NONE", bs.get("notice"));
        assertEquals(Boolean.TRUE, m.get("ai_draft"));
        assertEquals(Arrays.asList("intro", "effect"), Arrays.asList(((Map<String, String>) m.get("fields")).keySet().toArray()));

        // effect 를 묻지 않으면 이사회 자료는 실리지 않는다
        ScriptDraftService.Plan onlyIntro = plan(b, set("intro"));
        Map<String, Object> bs2 = (Map<String, Object>) ScriptDraftService.finish(onlyIntro, out("가상구청입니다.", ""), "test-model", 5L)
                .toMap().get("basis");
        assertEquals("NONE", bs2.get("board"));
        assertEquals(Boolean.FALSE, bs2.get("draft"));
        assertFalse(onlyIntro.sendsConfirmedBoard());
    }

    @Test
    public void 확정_이사회_숫자를_싣는_계획만_보내기_전_감사_대상() {
        ScriptDraftBasisReader.Basis b = basis();
        b.effect.add("가상 기대효과");
        b.profit = new BigDecimal("10.14");
        b.boardId = 7L;
        b.boardConfirmed = true;
        assertTrue(plan(b, set("intro", "effect")).sendsConfirmedBoard());
        assertFalse(plan(b, Collections.singleton("intro")).sendsConfirmedBoard());
    }
}
