package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.llm.LlmCallException;
import com.kbstar.kgi.ggreport.web.llm.LlmException;
import com.kbstar.kgi.ggreport.web.llm.LlmModelUnavailableException;
import com.kbstar.kgi.ggreport.web.llm.LlmRequest;
import com.kbstar.kgi.ggreport.web.llm.LlmResponse;
import com.kbstar.kgi.ggreport.web.llm.OllamaGuard;
import com.kbstar.kgi.ggreport.web.llm.OllamaLlmClient;
import com.kbstar.kgi.ggreport.web.llm.OllamaProperties;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 발표 대본 '보고 전 사전 설명'·'기대효과' 2칸 AI 초안(NEXT 129 ⑤, 이 PC 시범, 사용자 11-26 A-1). 저장하지 않는다.
 * 순서: prepare(404 → 403 비담당 → 409 상태 → 503 꺼짐 → 근거 읽기) → reserve(동시 1건·사번별 쿨다운) → [컨트롤러가 보내기 전 감사] → call → release.
 * 사용 범위 = BoardAccess.canViewCase(그 건 활성 담당 영업 ∪ 활성 영업부장) ∧ TASK_STATES(사용자 A-4). ⚠️ 사번은 X-Emp-No 자기신고 — 업무 규칙이지 사칭 방지가 아니다.
 * 근거 없는 칸은 묻지 않고 비운다. 응답의 숫자가 그 칸의 허용 숫자 집합에 없으면 그 칸을 비운다(가짜 값 차단). 개인정보 패턴이 나오면 비운다.
 * LLM 실패(LlmException 외 RuntimeException 포함)는 예외가 아니라 200 EMPTY + 사유 코드. 트랜잭션 없음 — 입력은 ScriptDraftBasisReader 의 읽기 전용 트랜잭션에서 읽고, 끝난 뒤 LLM 을 부른다.
 * <p>한계(숫자 검사): 출력은 NFKC 로 정규화한 뒤 아라비아 숫자만 허용 집합과 대조한다. 한글 수사·단위("삼억", "이십 퍼센트")나 단위를 바꿔 쓴 표현
 * ("1억"→"10,000만")은 이 검사로 못 잡는다 — 사람이 확인하는 초안이라는 전제(화면 문구)에 기댄다.
 */
@Service
public class ScriptDraftService {

    private static final Logger LOG = LoggerFactory.getLogger(ScriptDraftService.class);
    public static final List<String> FIELDS = Collections.unmodifiableList(Arrays.asList("intro", "effect"));
    static final int MAX_LINES = 12;
    static final int MAX_LINE = 300;
    static final int MAX_TOTAL = 1000;
    private static final Pattern NUMBER = Pattern.compile("[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?");

    public static final class Plan {
        final ScriptDraftBasisReader.Basis basis;
        final Set<String> ask;
        final ScriptDraftPrompt.Facts facts;   // ask 가 비면 null
        final String prompt;

        Plan(ScriptDraftBasisReader.Basis basis, Set<String> ask, ScriptDraftPrompt.Facts facts, String prompt) {
            this.basis = basis;
            this.ask = ask;
            this.facts = facts;
            this.prompt = prompt;
        }

        public boolean isEmpty() { return ask.isEmpty(); }
        public ScriptDraftBasisReader.Basis getBasis() { return basis; }

        /** 확정 이사회 자료의 숫자가 프롬프트에 실리는가 — 보내기 전 BOARD_MATERIAL_ACT 대상(security 하-3). */
        public boolean sendsConfirmedBoard() {
            return facts != null && facts.boardSent && basis.boardConfirmed && basis.boardId != null;
        }
    }

    public static final class Result {
        final String state;
        final String reason;
        final Map<String, String> fields;
        final Map<String, String> emptyReasons;
        final Plan plan;
        final String model;
        final long ms;
        final boolean llmCalled;

        Result(String state, String reason, Map<String, String> fields, Map<String, String> emptyReasons,
               Plan plan, String model, long ms, boolean llmCalled) {
            this.state = state;
            this.reason = reason;
            this.fields = fields;
            this.emptyReasons = emptyReasons;
            this.plan = plan;
            this.model = model;
            this.ms = ms;
            this.llmCalled = llmCalled;
        }

        public String getState() { return state; }
        public String getReason() { return reason; }
        public long getMs() { return ms; }
        /** LLM 에 실제로 보냈는가 — 접근 이력 DETAIL 의 llm=Y|N 용(BUSY·자리 못 잡음·BASIS_CHANGED 는 N). */
        public boolean isLlmCalled() { return llmCalled; }

        /** BID_PREP_ACT 결과 — 답을 받았으면 OK(일부 칸이 비어도), 부르지 않았으면 BLOCKED, 호출 실패는 ERROR. */
        public String outcome() {
            if ("OK".equals(state) || "ALL_BLANKED".equals(reason)) return "OK";
            if ("NO_BASIS".equals(reason) || "BUSY".equals(reason) || "COOLDOWN".equals(reason)) return "BLOCKED";
            return "ERROR";
        }

        /** 확정 전 자료 기준인가 — 프롬프트에 실은 자료 중 확정 아닌 것이 있으면 true(사용자 A-2, 화면 표시용). */
        public boolean draftBasis() {
            ScriptDraftPrompt.Facts f = plan.facts;
            ScriptDraftBasisReader.Basis b = plan.basis;
            return f != null && ((f.boardSent && !b.boardConfirmed) || (f.summarySent && !b.summaryConfirmed));
        }

        public Map<String, Object> toMap() {
            ScriptDraftPrompt.Facts f = plan.facts;
            ScriptDraftBasisReader.Basis b = plan.basis;
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("state", state);
            m.put("reason", reason);
            m.put("fields", fields);
            m.put("empty_reasons", emptyReasons);
            Map<String, Object> bs = new LinkedHashMap<String, Object>();
            bs.put("board", f != null && f.boardSent ? (b.boardConfirmed ? "CONFIRMED" : "CURRENT") : "NONE");
            bs.put("summary", f != null && f.summarySent ? (b.summaryConfirmed ? "CONFIRMED" : "CURRENT") : "NONE");
            bs.put("notice", f != null && !f.notice.isEmpty() ? "USED" : "NONE");
            bs.put("draft", draftBasis());
            m.put("basis", bs);
            m.put("model", model);
            m.put("elapsed_ms", ms);
            m.put("ai_draft", true);
            return m;
        }
    }

    private final PrepService prep;
    private final BoardAccess boardAccess;
    private final ScriptDraftBasisReader reader;
    private final ObjectProvider<OllamaLlmClient> ollama;
    private final long cooldownNs;
    private final Semaphore gate = new Semaphore(1);
    private final ConcurrentHashMap<String, Long> lastStart = new ConcurrentHashMap<String, Long>();

    public ScriptDraftService(PrepService prep, BoardAccess boardAccess, ScriptDraftBasisReader reader,
                              ObjectProvider<OllamaLlmClient> ollama, OllamaProperties props) {
        this.prep = prep;
        this.boardAccess = boardAccess;
        this.reader = reader;
        this.ollama = ollama;
        this.cooldownNs = Math.max(0, props.getCooldownSeconds()) * 1_000_000_000L;
    }

    public Plan prepare(SysUser me, String bid) {
        BidPrep p = prep.requireVisible(me, bid);                                  // 404 — 존재 은닉이 먼저
        if (!boardAccess.canViewCase(me.getEmpNo(), p.getBidCaseId())) {
            throw coded(403, "SCRIPT_DRAFT_NOT_ALLOWED", "AI 초안은 이 건의 담당 영업과 영업부장만 만들 수 있습니다.");
        }
        if (!PrepService.TASK_STATES.contains(p.getStateCd())) {
            throw coded(409, "SCRIPT_DRAFT_STATE", "지금 상태의 건에서는 AI 초안을 만들 수 없습니다.");
        }
        OllamaLlmClient c = ollama.getIfAvailable();
        if (c == null || c.state() != OllamaGuard.State.READY) {
            throw coded(503, "LLM_OFF", "이 PC에서 AI 초안 기능이 꺼져 있습니다.");
        }
        ScriptDraftBasisReader.Basis b = reader.read(me, p);
        Set<String> ask = askable(b);
        if (ask.isEmpty()) {
            return new Plan(b, ask, null, null);
        }
        ScriptDraftPrompt.Facts f = ScriptDraftPrompt.facts(b, ask);
        return new Plan(b, ask, f, ScriptDraftPrompt.build(f, ask));
    }

    /** 자리 잡기 — null 이면 잡았다(반드시 release). 아니면 BUSY|COOLDOWN(감사 쓰기·LLM 호출 전에 판정). */
    public String reserve(String empNo) {
        long now = System.nanoTime();
        Long last = lastStart.get(empNo);
        if (cooldownNs > 0 && last != null && now - last < cooldownNs) return "COOLDOWN";
        if (!gate.tryAcquire()) return "BUSY";
        lastStart.put(empNo, now);
        if (lastStart.size() > 256) {
            lastStart.entrySet().removeIf(e -> now - e.getValue() >= cooldownNs);
        }
        return null;
    }

    public void release() { gate.release(); }

    public Result skipped(Plan plan, String reason) { return empty(plan, reason, false, 0L); }

    public Result call(Plan plan) {
        OllamaLlmClient c = ollama.getIfAvailable();
        long t0 = System.nanoTime();
        if (c == null) return empty(plan, "LLM_ERROR", false, 0L);
        LlmResponse<ScriptDraftOut> r;
        try {
            r = c.draft(LlmRequest.of(plan.prompt, ScriptDraftOut.class));
        } catch (LlmException e) {
            String why = reasonOf(e);
            return empty(plan, why, !"BUSY".equals(why), (System.nanoTime() - t0) / 1_000_000L);
        } catch (RuntimeException e) {          // LlmException 이 아닌 예외도 감사 줄이 ERROR 로 남게 — 로그는 예외 클래스 이름만(메시지·주소 없음)
            LOG.warn("AI 초안 호출 중 예상 밖 예외: cause={}", e.getClass().getSimpleName());
            return empty(plan, "LLM_ERROR", true, (System.nanoTime() - t0) / 1_000_000L);
        }
        return finish(plan, r.getValue(), r.getModel(), (System.nanoTime() - t0) / 1_000_000L);
    }

    static Set<String> askable(ScriptDraftBasisReader.Basis b) {
        Set<String> s = new LinkedHashSet<String>();
        if (b.instName != null && (!b.overview.isEmpty() || b.supervisor != null || b.staff != null
                || b.budget != null || b.currentBank != null || !b.competition.isEmpty())) s.add("intro");
        if (!b.effect.isEmpty() || !b.competition.isEmpty()) s.add("effect");   // 이사회 숫자만으로는 묻지 않는다
        return s;
    }

    static Result finish(Plan plan, ScriptDraftOut out, String model, long ms) {
        Map<String, String> fields = new LinkedHashMap<String, String>();
        Map<String, String> why = new LinkedHashMap<String, String>();
        boolean any = false;
        for (String k : FIELDS) {
            String v = "";
            String reason;
            if (!plan.ask.contains(k)) {
                reason = "NO_BASIS";
            } else {
                String s = tidy(out == null ? null : out.get(k));
                if (s.isEmpty()) reason = "EMPTY_OUTPUT";
                else if (!numbersAllowed(s, plan.facts.allowed.get(k))) reason = "NUMBER_NOT_IN_BASIS";
                else if (piiFound(s)) reason = "PII";
                else { v = s; reason = null; any = true; }
            }
            fields.put(k, v);
            if (reason != null) why.put(k, reason);
        }
        return new Result(any ? "OK" : "EMPTY", any ? null : "ALL_BLANKED", fields, why, plan, model, ms, true);
    }

    private static Result empty(Plan plan, String reason, boolean called, long ms) {
        Map<String, String> fields = new LinkedHashMap<String, String>();
        Map<String, String> why = new LinkedHashMap<String, String>();
        for (String k : FIELDS) {
            fields.put(k, "");
            why.put(k, reason);
        }
        return new Result("EMPTY", reason, fields, why, plan, null, ms, called);
    }

    /** 개인정보 패턴(Pii.scan + 유선전화·가림 변형까지 보는 Pii.scanExternal). 검사가 마감을 넘기면 안전하게 '있음'으로 본다. */
    static boolean piiFound(String s) {
        try {
            return !Pii.scan(s).isEmpty() || !Pii.scanExternal(s).isEmpty();
        } catch (Pii.ScanTimeoutException e) {
            return true;
        }
    }

    /**
     * 줄바꿈만 남기고 제어문자 제거 → 12줄·줄당 300자·합계 1,000자(PrepScriptService.lines 와 같은 상한 — 넘으면 자른다).
     * 먼저 NFKC 로 정규화한다 — 전각 숫자(１２３)가 숫자 검사를 비껴가지 못하게(정규화 '뒤' 검사).
     */
    static String tidy(String raw) {
        if (raw == null) return "";
        String norm = Normalizer.normalize(raw, Normalizer.Form.NFKC).replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder clean = new StringBuilder();
        for (int i = 0; i < norm.length(); ) {
            int cp = norm.codePointAt(i);
            i += Character.charCount(cp);
            int t = Character.getType(cp);
            boolean bad = cp != '\n' && (t == Character.CONTROL || t == Character.FORMAT || t == Character.SURROGATE
                    || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR || t == Character.PRIVATE_USE
                    || t == Character.UNASSIGNED || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C);
            clean.appendCodePoint(bad ? ' ' : cp);
        }
        List<String> lines = new ArrayList<String>();
        int total = 0;
        for (String part : clean.toString().split("\n", -1)) {
            String s = part.replaceAll("[ \\t]+", " ").trim();
            if (s.isEmpty()) continue;
            if (s.length() > MAX_LINE) s = cut(s, MAX_LINE);
            if (total + s.length() > MAX_TOTAL) s = cut(s, MAX_TOTAL - total);
            if (s.isEmpty()) break;
            lines.add(s);
            total += s.length();
            if (lines.size() >= MAX_LINES || total >= MAX_TOTAL) break;
        }
        StringBuilder sb = new StringBuilder();
        for (String s : lines) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(s);
        }
        return sb.toString();
    }

    private static String cut(String s, int n) {
        if (n <= 0) return "";
        if (s.length() <= n) return s;
        int end = Character.isHighSurrogate(s.charAt(n - 1)) ? n - 1 : n;
        return s.substring(0, end).trim();
    }

    /** 칸별 허용 숫자 집합에 글 속 숫자를 모은다(ScriptDraftPrompt 가 쓴다). */
    static void collect(String s, Set<String> out) {
        Matcher m = NUMBER.matcher(s);
        while (m.find()) {
            String n = norm(m.group());
            if (n != null) out.add(n);
        }
    }

    static boolean numbersAllowed(String s, Set<String> allowed) {
        Matcher m = NUMBER.matcher(s);
        while (m.find()) {
            String n = norm(m.group());
            if (n == null || !allowed.contains(n)) return false;
        }
        return true;
    }

    static String norm(String raw) {
        try {
            return new BigDecimal(raw.replace(",", "")).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String reasonOf(LlmException e) {
        if (e instanceof LlmModelUnavailableException) return "MODEL_MISSING";
        if (e instanceof LlmCallException) {
            String c = ((LlmCallException) e).getCode();
            if (LlmCallException.BUSY.equals(c)) return "BUSY";
            if (LlmCallException.TIMEOUT.equals(c)) return "TIMEOUT";
            if (LlmCallException.UNREACHABLE.equals(c)) return "UNREACHABLE";
            if (LlmCallException.BAD_OUTPUT.equals(c) || LlmCallException.TRUNCATED.equals(c)) return "BAD_OUTPUT";
        }
        return "LLM_ERROR";
    }

    private static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<String, Object>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
