package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.PlanCollectReq;
import com.kbstar.kgi.ggreport.web.mapper.PlanCollectMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.PlanCsv;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 사업계획 수집 요청(045). 1차 핵심 = '개발부서에 어떤 기관 사업계획이 필요한지 넘어가는 것'(요청 → 기관 단위 묶음 → 알림 → 상태 → 반입 시 자동 반영 → 감사).
 * 외부 호출 없이도 완결된다: 개발부서는 목록을 내려받아(사번 없음) 망 밖에서 수집하고, 내보낸 건을 '수집 중'으로 표시한다.
 * agent 직접 호출({@link #runAgent})은 설정이 있을 때만 켜지는 시험용이다(내부망 = 503 BLOCKED_NO_URL).
 * <ul>
 *   <li>기관당 열린 요청 1건 — INSTITUTIONS 행 FOR UPDATE 로 직렬화, UQ_PCR_OPEN 이 마지막 방어선(409).</li>
 *   <li>상태 전이는 조건부 UPDATE. 감사(INST_PLAN_ACT)는 같은 트랜잭션 — 감사 없이 상태가 바뀌지 않는다.</li>
 *   <li>agent 호출: ① REQUESTED→RUNNING + '시작' 감사 커밋 ② 트랜잭션 밖 HTTP(동시 1건) ③ 결과를 RUNNING 조건부 UPDATE 로.</li>
 * </ul>
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다. 요청·실행 권한은 업무 규칙이지 사칭 방지가 아니다.
 */
@Service
public class PlanCollectService {

    private static final Logger LOG = LoggerFactory.getLogger(PlanCollectService.class);

    public static final String REQUESTED = "REQUESTED";
    public static final String RUNNING = "RUNNING";
    public static final String APPLIED = "APPLIED";
    public static final String FAILED = "FAILED";
    public static final String CANCELED = "CANCELED";
    public static final String EXCLUDED = "EXCLUDED";

    public static final String ACTION_REQUEST = "COLLECT_REQUEST";
    public static final String ACTION_CANCEL = "COLLECT_CANCEL";
    public static final String ACTION_EXPORT = "COLLECT_EXPORT";
    public static final String ACTION_RUN = "COLLECT_RUN";
    public static final String ACTION_EXCLUDE = "COLLECT_EXCLUDE";
    public static final String ACTION_FAIL = "COLLECT_FAIL";
    public static final String ACTION_APPLY = "COLLECT_APPLY";

    static final String MODE_AGENT = "AGENT";
    static final String MODE_MANUAL = "MANUAL";
    static final String KIND_REQUEST = "수집요청";
    static final String KIND_RESULT = "수집결과";
    static final String IT_TEAM = "전산";   // 화면 이름은 '개발부서'
    /** 전산팀원(역할 '전산팀')과 전산팀장 화면이 각자 자기 역할 이름으로 쪽지를 조회한다(store.myRecipients) — 두 앞으로 한 통씩. */
    static final List<String> IT_INBOXES = Collections.unmodifiableList(Arrays.asList(IT_TEAM + Teams.TEAM_SUFFIX, Teams.leadOf(IT_TEAM)));
    static final int MAX_KEYS = 50;
    static final int MAX_RUN_KEYS = 10;
    static final int REASON_MAX = 100;
    static final int CLOSED_MAX = 200;
    private static final Pattern KEY = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final List<String> OPEN = Collections.unmodifiableList(Arrays.asList(REQUESTED, RUNNING));
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final PlanCollectMapper mapper;
    private final PlanAudit audit;
    private final NotificationCommandService notes;
    private final PlanAgentClient agent;
    private final TransactionTemplate tx;

    public PlanCollectService(PlanCollectMapper mapper, PlanAudit audit, NotificationCommandService notes,
                              PlanAgentClient agent, PlatformTransactionManager txm) {
        this.mapper = mapper;
        this.audit = audit;
        this.notes = notes;
        this.agent = agent;
        this.tx = new TransactionTemplate(txm);
    }

    /** 요청 자격 — 영업부서(영업팀·팀장·부장)·개발부서(전산팀·팀장, 마스터 포함). 디자이너·재무부서(예산팀) 제외(nav PLANS_TEAMS 와 같은 범위). */
    public static boolean canRequest(String role) {
        String r = role == null ? "" : role.trim();
        if (Teams.DESIGNER_TEAM.equals(r)) return false;
        String team = Teams.teamOf(r);
        return Teams.DESIGNER_HOME_TEAM.equals(team) || IT_TEAM.equals(team);
    }

    // ── 요청하는 쪽 ──
    public Map<String, Object> request(String rawId, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.collectRequest();
        String inst = rawId;
        try {
            final String id = canonicalId(rawId);
            inst = id;
            return tx.execute(st -> doRequest(id, actor, ui));
        } catch (DuplicateKeyException e) {
            failed(inst, ACTION_REQUEST, "BLOCKED", actor, ui);
            throw new ApiException(409, "같은 기관 요청이 동시에 처리되었습니다. 다시 눌러 주세요.");
        } catch (ApiException e) {
            failed(inst, ACTION_REQUEST, HeadAudit.outcomeOf(e.getStatus()), actor, ui);
            throw e;
        }
    }

    private Map<String, Object> doRequest(String id, Actor actor, BoardUiIds.Ui ui) {
        if (mapper.lockInstitution(id) == null) throw ApiException.notFound("institution not found");
        String now = Times.nowIso();
        int v = actor.isVerified() ? 1 : 0;
        PlanCollectReq open = mapper.selectOpenByInst(id);
        boolean created = false;
        String outcome;
        if (open == null) {
            open = new PlanCollectReq();
            open.setInstitutionId(id);
            open.setReqSeq(mapper.nextSeq(id));
            open.setReqKey(UUID.randomUUID().toString());
            open.setStatusCd(REQUESTED);
            open.setOpenInstId(id);
            open.setPrevDomains(PlanCollectRules.joinDomains(mapper.selectLatestSrcUrls(id)));
            open.setRequestedBy(actor.getEmpNo());
            open.setRequestedAt(now);
            open.setReqVerified(v);
            mapper.insertReq(open);
            mapper.insertRequester(id, open.getReqSeq(), actor.getEmpNo(), now, v);
            created = true;
            outcome = "OK";
        } else {
            Map<String, Object> mine = mapper.selectRequester(id, open.getReqSeq(), actor.getEmpNo());
            if (mine == null) {
                mapper.insertRequester(id, open.getReqSeq(), actor.getEmpNo(), now, v);
                outcome = "JOINED";
            } else if (mine.get("CANCELED_AT") != null) {
                mapper.reviveRequester(id, open.getReqSeq(), actor.getEmpNo(), now, v);
                outcome = "JOINED";
            } else {
                outcome = "DUPLICATE";
            }
        }
        audit.record(id, null, ACTION_REQUEST, outcome, null, null, actor, ui);   // 같은 트랜잭션 — 감사 없이 요청이 생기지 않는다
        if (created) {   // 덧붙임에는 보내지 않는다(같은 기관 알림이 쌓이지 않게)
            String text = "[사업계획 수집 요청] " + label(id) + " — 사업계획 수집 요청이 새로 들어왔습니다. 개발부서 처리 화면에서 확인해 주세요.";
            for (String inbox : IT_INBOXES) {
                notes.create(inbox, KIND_REQUEST, text, null);   // institution_id 를 싣지 않는다 — 입찰 흐름 타임라인(selectTimeline)에 섞이지 않게
            }
        }
        Map<String, Object> out = mineJson(open, mapper.countActiveRequesters(id, open.getReqSeq()), true);
        out.put("created", created);
        out.put("outcome", outcome);
        return out;
    }

    public Map<String, Object> cancel(String rawId, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.collectCancel();
        String inst = rawId;
        try {
            final String id = canonicalId(rawId);
            inst = id;
            return tx.execute(st -> doCancel(id, actor, ui));
        } catch (ApiException e) {
            failed(inst, ACTION_CANCEL, HeadAudit.outcomeOf(e.getStatus()), actor, ui);
            throw e;
        }
    }

    private Map<String, Object> doCancel(String id, Actor actor, BoardUiIds.Ui ui) {
        if (mapper.lockInstitution(id) == null) throw ApiException.notFound("institution not found");
        PlanCollectReq open = mapper.selectOpenByInst(id);
        Map<String, Object> mine = open == null ? null : mapper.selectRequester(id, open.getReqSeq(), actor.getEmpNo());
        if (mine == null || mine.get("CANCELED_AT") != null) throw ApiException.notFound("취소할 요청이 없습니다.");
        if (!REQUESTED.equals(open.getStatusCd())) throw new ApiException(409, "수집이 이미 시작되어 취소할 수 없습니다.");
        String now = Times.nowIso();
        mapper.cancelRequester(id, open.getReqSeq(), actor.getEmpNo(), now);
        int left = mapper.countActiveRequesters(id, open.getReqSeq());
        if (left == 0) {   // 마지막 요청자가 취소하면 요청 자체를 닫는다
            if (mapper.closeReq(open.getReqKey(), CANCELED, Collections.singletonList(REQUESTED), now, actor.getEmpNo(), null) != 1) {
                throw new ApiException(409, "요청 상태가 바뀌었습니다. 새로고침해 주세요.");
            }
            open.setStatusCd(CANCELED);
        }
        audit.record(id, null, ACTION_CANCEL, "OK", null, null, actor, ui);
        return mineJson(open, left, false);
    }

    /** 기관 사업계획 화면용 — 열린 요청만, 요청자 수와 '내가 요청했나'(사번·이름은 싣지 않는다). */
    @Transactional(readOnly = true)
    public Map<String, Object> status(String empNo, boolean canRequest) {
        Map<String, Integer> counts = new HashMap<>();
        Map<String, Boolean> mine = new HashMap<>();
        for (Map<String, Object> q : mapper.selectOpenRequesters()) {
            String inst = str(q.get("INSTITUTION_ID"));
            counts.merge(inst, 1, Integer::sum);
            if (empNo != null && empNo.equals(str(q.get("EMP_NO")))) mine.put(inst, Boolean.TRUE);
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (PlanCollectReq r : mapper.selectOpenList()) {
            String inst = r.getInstitutionId();
            items.add(mineJson(r, counts.getOrDefault(inst, 0), mine.containsKey(inst)));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("can_request", canRequest);
        out.put("items", items);
        return out;
    }

    // ── 처리 화면(개발부서) ──
    @Transactional(readOnly = true)
    public Map<String, Object> adminList(String scope) {
        boolean closed = "closed".equals(scope);
        if (scope != null && !closed && !"open".equals(scope)) throw ApiException.badRequest("scope 는 open 또는 closed 입니다.");
        List<PlanCollectReq> rows = closed ? mapper.selectClosedList(new RowBounds(0, CLOSED_MAX)) : mapper.selectOpenList();
        Map<String, List<String>> names = new HashMap<>();
        if (!rows.isEmpty()) {
            List<String> keys = new ArrayList<>();
            for (PlanCollectReq r : rows) keys.add(r.getReqKey());
            for (Map<String, Object> q : mapper.selectRequestersOfKeys(keys)) {
                String n = str(q.get("NAME"));
                names.computeIfAbsent(str(q.get("REQ_KEY")), k -> new ArrayList<>()).add(n == null ? "(미등록)" : n);
            }
        }
        List<Map<String, Object>> items = new ArrayList<>();
        int req = 0, run = 0;
        for (PlanCollectReq r : rows) {
            List<String> who = names.getOrDefault(r.getReqKey(), Collections.<String>emptyList());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("req_key", r.getReqKey());
            m.put("institution_id", r.getInstitutionId());
            m.put("name_ko", r.getNameKo());
            m.put("status_cd", r.getStatusCd());
            m.put("requester_count", who.size());
            m.put("requester_names", who);   // 사번은 싣지 않는다
            m.put("first_requested_at", r.getRequestedAt());
            m.put("first_requested_on", dayOf(r.getRequestedAt()));
            m.put("prev_domains", PlanCollectRules.splitDomains(r.getPrevDomains()));
            m.put("run_domains", PlanCollectRules.splitDomains(r.getRunDomains()));
            m.put("last_import_at", r.getLastImportAt());
            m.put("run_mode", r.getRunMode());
            m.put("run_at", r.getRunAt());
            m.put("run_by_name", r.getRunByName());
            m.put("run_result_cd", r.getRunResultCd());
            m.put("job_id", r.getJobId());
            m.put("closed_at", r.getClosedAt());
            m.put("close_reason", r.getCloseReason());
            m.put("applied_import_id", r.getAppliedImportId());
            items.add(m);
            if (REQUESTED.equals(r.getStatusCd())) req++;
            if (RUNNING.equals(r.getStatusCd())) run++;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scope", closed ? "closed" : "open");
        out.put("agent_state", agent.state().name());
        out.put("agent_enabled", agent.state() == PlanAgentClient.State.READY);
        if (!closed) {
            out.put("requested_count", req);
            out.put("running_count", run);
        }
        out.put("items", items);
        return out;
    }

    /** 메뉴 배지용(GET …/status — 접근 이력 폴링 규칙으로 남지 않는다). */
    @Transactional(readOnly = true)
    public Map<String, Object> adminStatus() {
        int req = 0, run = 0;
        for (Map<String, Object> m : mapper.countOpenByStatus()) {
            int c = ((Number) m.get("CNT")).intValue();
            String s = str(m.get("STATUS_CD"));
            if (REQUESTED.equals(s)) req = c;
            else if (RUNNING.equals(s)) run = c;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requested_count", req);
        out.put("running_count", run);
        out.put("open_count", req + run);
        out.put("agent_state", agent.state().name());
        return out;
    }

    /** ② 망 밖 수집용 목록. 열; 기관ID·기관명·이전 출처 도메인·요청자 수·최초 요청일·상태·올릴 파일 이름. 사번·이름 없음. 응답 전에 감사(실패하면 500). */
    public InstitutionPlanService.CsvOut exportCsv(List<String> raw, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.collectExport();
        List<String> keys;
        try {
            keys = keys(raw, MAX_KEYS);
        } catch (ApiException e) {
            failed(null, ACTION_EXPORT, "INVALID", actor, ui);
            throw e;
        }
        Map<String, Integer> counts = new HashMap<>();
        for (Map<String, Object> q : mapper.selectRequestersOfKeys(keys)) counts.merge(str(q.get("REQ_KEY")), 1, Integer::sum);
        StringBuilder sb = new StringBuilder("\uFEFF");
        line(sb, "기관ID", "기관명", "이전 출처 도메인", "요청자 수", "최초 요청일", "상태", "올릴 파일 이름");
        int n = 0;
        for (PlanCollectReq r : mapper.selectByKeys(keys)) {
            if (!OPEN.contains(r.getStatusCd())) continue;   // 닫힌 요청은 내보내지 않는다
            String dom = r.getRunDomains() != null ? r.getRunDomains() : r.getPrevDomains();
            line(sb, r.getInstitutionId(), r.getNameKo(), dom == null ? "" : dom.replace(",", " "),
                    String.valueOf(counts.getOrDefault(r.getReqKey(), 0)), dayOf(r.getRequestedAt()),
                    REQUESTED.equals(r.getStatusCd()) ? "요청됨" : "수집 중(반입 대기)", r.getInstitutionId() + "_YYYYMMDD_plan.csv");
            n++;
        }
        audit.record(null, null, ACTION_EXPORT, "OK", n, null, actor, ui);
        return new InstitutionPlanService.CsvOut(sb.toString().getBytes(StandardCharsets.UTF_8), n);
    }

    /** ② 내보낸 건을 '수집 중(반입 대기)'으로(수동). 요청됨에서만. */
    public Map<String, Object> markRunning(List<String> raw, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.collectMark();
        List<String> keys;
        try {
            keys = keys(raw, MAX_KEYS);
        } catch (ApiException e) {
            failed(null, ACTION_RUN, "INVALID", actor, ui);
            throw e;
        }
        List<Map<String, Object>> rs = new ArrayList<>();
        for (final String key : keys) {
            rs.add(tx.execute(st -> {
                PlanCollectReq row = mapper.selectByKey(key);
                if (row == null) return item(key, null, "NOT_FOUND");
                String inst = row.getInstitutionId();
                mapper.lockInstitution(inst);
                String d = PlanCollectRules.joinDomains(mapper.selectLatestSrcUrls(inst));
                int n = mapper.markRunning(key, MODE_MANUAL, actor.getEmpNo(), Times.nowIso(), actor.isVerified() ? 1 : 0, d);
                audit.record(inst, null, ACTION_RUN, n == 1 ? "MANUAL" : "DUPLICATE", null, null, actor, ui);
                return item(key, inst, n == 1 ? "OK" : "NOT_REQUESTED");
            }));
        }
        return results(rs);
    }

    /** 제외(요청됨·수집 중) / 실패 표시(수집 중만). 사유 필수(개인정보 거름). 요청자 전원에게 쪽지. */
    public Map<String, Object> close(List<String> raw, String rawReason, boolean exclude, Actor actor) {
        final String to = exclude ? EXCLUDED : FAILED;
        final String action = exclude ? ACTION_EXCLUDE : ACTION_FAIL;
        final BoardUiIds.Ui ui = exclude ? PlanUiIds.collectExclude() : PlanUiIds.collectFail();
        final List<String> from = exclude ? OPEN : Collections.singletonList(RUNNING);
        final List<String> keys;
        final String reason;
        try {
            keys = keys(raw, MAX_KEYS);
            reason = reason(rawReason);
        } catch (ApiException e) {
            failed(null, action, "INVALID", actor, ui);
            throw e;
        }
        List<Map<String, Object>> rs = new ArrayList<>();
        for (final String key : keys) {
            rs.add(tx.execute(st -> {
                PlanCollectReq row = mapper.selectByKey(key);
                if (row == null) return item(key, null, "NOT_FOUND");
                String inst = row.getInstitutionId();
                mapper.lockInstitution(inst);
                row = mapper.selectByKey(key);   // 잠금 뒤 다시 읽는다
                if (!from.contains(row.getStatusCd())) {
                    audit.record(inst, null, action, "BLOCKED", null, null, actor, ui);
                    return item(key, inst, exclude ? "NOT_OPEN" : "NOT_RUNNING");
                }
                List<String> emps = mapper.selectActiveRequesterEmpNos(inst, row.getReqSeq());
                if (mapper.closeReq(key, to, from, Times.nowIso(), actor.getEmpNo(), reason) != 1) {
                    audit.record(inst, null, action, "BLOCKED", null, null, actor, ui);
                    return item(key, inst, "CONFLICT");
                }
                audit.record(inst, null, action, "OK", emps.size(), null, actor, ui);
                String text = exclude
                        ? "[사업계획 수집 제외] " + label(inst) + " 수집 요청을 개발부서에서 제외했습니다. 사유: " + reason
                        : "[사업계획 수집 실패] " + label(inst) + " 수집을 마치지 못했습니다. 사유: " + reason + " 필요하면 다시 요청해 주세요.";
                for (String e : emps) notes.create(e, KIND_RESULT, text, null);
                return item(key, inst, "OK");
            }));
        }
        return results(rs);
    }

    /** ③ 시험용 agent 직접 호출. 설정이 없으면 503(BLOCKED_NO_URL·BLOCKED_BAD_CONFIG), 다른 실행 중이면 409 BUSY. */
    public Map<String, Object> runAgent(List<String> raw, Actor actor) {
        BoardUiIds.Ui ui = PlanUiIds.collectRun();
        List<String> keys;
        try {
            keys = keys(raw, MAX_RUN_KEYS);
        } catch (ApiException e) {
            failed(null, ACTION_RUN, "INVALID", actor, ui);
            throw e;
        }
        PlanAgentClient.State s = agent.state();
        if (s != PlanAgentClient.State.READY) {
            String code = s == PlanAgentClient.State.BAD_CONFIG ? PlanAgentClient.BAD_CONFIG : PlanAgentClient.NO_URL;
            failed(null, ACTION_RUN, code, actor, ui);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("code", code);
            d.put("message", s == PlanAgentClient.State.OFF
                    ? "수집 실행 주소가 설정되지 않아 실행할 수 없습니다. 목록을 내려받아 진행해 주세요."
                    : "수집 실행 설정이 올바르지 않아 실행을 막았습니다. 개발부서 설정을 확인해 주세요.");
            throw ApiException.withDetail(503, d);
        }
        if (!agent.tryAcquire()) {
            failed(null, ACTION_RUN, "BUSY", actor, ui);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("code", "BUSY");
            d.put("message", "다른 수집 실행이 진행 중입니다. 잠시 후 다시 눌러 주세요.");
            throw ApiException.withDetail(409, d);
        }
        try {
            List<Map<String, Object>> rs = new ArrayList<>();
            for (String key : keys) rs.add(runOne(key, actor, ui));
            return results(rs);
        } finally {
            agent.release();
        }
    }

    private Map<String, Object> runOne(final String key, final Actor actor, final BoardUiIds.Ui ui) {
        final PlanCollectReq[] prep = new PlanCollectReq[1];
        final String[] ctx = new String[2];   // [0] 보낼 도메인, [1] 기관명
        // ① 상태 전이 + '실행 시작' 감사를 한 트랜잭션으로 커밋한 뒤에만 부른다(감사 실패면 롤백 → 호출하지 않는다)
        String early = tx.execute(st -> {
            PlanCollectReq row = mapper.selectByKey(key);
            if (row == null) return "NOT_FOUND";
            prep[0] = row;
            String inst = row.getInstitutionId();
            mapper.lockInstitution(inst);
            String d = PlanCollectRules.joinDomains(mapper.selectLatestSrcUrls(inst));
            if (mapper.markRunning(key, MODE_AGENT, actor.getEmpNo(), Times.nowIso(), actor.isVerified() ? 1 : 0, d) != 1) {
                audit.record(inst, null, ACTION_RUN, "DUPLICATE", null, null, actor, ui);
                return "NOT_REQUESTED";
            }
            audit.record(inst, null, ACTION_RUN, "STARTED", null, null, actor, ui);
            ctx[0] = d != null ? d : row.getPrevDomains();
            ctx[1] = mapper.selectInstitutionName(inst);
            return null;
        });
        String inst = prep[0] == null ? null : prep[0].getInstitutionId();
        if (early != null) return item(key, inst, early);
        // ② 트랜잭션 밖 호출. 보내는 값은 요청 키·기관 ID·기관명·이전 도메인뿐(서버가 저장된 행에서 읽는다 — 요청 본문 값이 아니다)
        final PlanAgentClient.Result r = agent.send(key, inst, ctx[1] == null ? inst : ctx[1], PlanCollectRules.splitDomains(ctx[0]));
        // ③ 결과는 RUNNING 조건부 UPDATE. 실패면 요청됨으로 되돌려 다시 실행할 수 있게
        try {
            tx.execute(st -> {
                if (r.isSent()) mapper.recordSent(key, r.getJobId());
                else mapper.revertRunning(key, r.getCode());
                audit.record(inst, null, ACTION_RUN, r.getCode(), null, null, actor, ui);
                return null;
            });
        } catch (RuntimeException e) {
            LOG.error("plan-collect run result not recorded code={}", r.getCode());   // 상태는 RUNNING 그대로 — 관리자가 실패 표시로 정리
        }
        return item(key, inst, r.getCode());
    }

    /**
     * 수집 반입(IMPORT) 판이 생긴 직후 — InstitutionPlanService.apply 의 같은 트랜잭션에서 부른다(기관 행은 이미 잠김). SEED 는 부르지 않는다.
     * 열린 요청(요청됨·수집 중)을 반영됨으로 닫고 요청자 전원에게 쪽지. 요청됨도 닫는 이유: 내보내기 흐름은 수동이라 '수집 중' 표시를 빠뜨려도 필요한 판은 이미 들어왔다(사용자 Q4).
     */
    void onImported(String instId, Long importId, Actor actor) {
        PlanCollectReq open = mapper.selectOpenByInst(instId);
        if (open == null) return;
        List<String> emps = mapper.selectActiveRequesterEmpNos(instId, open.getReqSeq());
        if (mapper.applyOpen(instId, importId, Times.nowIso(), actor.getEmpNo()) != 1) return;
        audit.record(instId, importId, ACTION_APPLY, "OK", emps.size(), null, actor, PlanUiIds.upload());
        String text = "[사업계획 수집 반영] " + label(instId) + " 사업계획이 새로 반입되었습니다. 기관 사업계획 화면에서 확인해 주세요.";
        for (String e : emps) notes.create(e, KIND_RESULT, text, null);
    }

    // ── 보조 ──
    private String canonicalId(String raw) {
        if (!PlanCsv.validId(raw)) throw ApiException.notFound("institution not found");
        List<String> hit = mapper.selectIdsIgnoreCase(raw);
        if (hit.contains(raw)) return raw;
        if (hit.size() == 1) return hit.get(0);
        throw ApiException.notFound("institution not found");
    }

    static List<String> keys(List<String> raw, int max) {
        if (raw == null || raw.isEmpty() || raw.size() > max) throw ApiException.badRequest("요청 키는 1~" + max + "개여야 합니다.");
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String s : raw) {
            if (s == null || !KEY.matcher(s).matches()) throw ApiException.badRequest("요청 키 형식이 올바르지 않습니다.");
            out.add(s);
        }
        return new ArrayList<>(out);
    }

    static String reason(String raw) {
        String t = raw == null ? "" : raw.trim();
        if (t.isEmpty()) throw ApiException.badRequest("사유를 적어 주세요.");
        if (t.length() > REASON_MAX) throw ApiException.badRequest("사유는 100자 이하로 적어 주세요.");
        for (int i = 0; i < t.length(); i++) {
            if (Character.isISOControl(t.charAt(i))) throw ApiException.badRequest("사유에 쓸 수 없는 글자가 있습니다.");
        }
        if (!Pii.scanLoose(t).isEmpty()) throw ApiException.badRequest("사유에 개인정보(전화번호·주민번호·이메일 등)를 적지 마세요.");
        return t;
    }

    private String label(String inst) {
        String n = mapper.selectInstitutionName(inst);
        return n == null ? inst : n + "(" + inst + ")";
    }

    private static Map<String, Object> mineJson(PlanCollectReq r, int count, boolean byMe) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("institution_id", r.getInstitutionId());
        m.put("status_cd", r.getStatusCd());
        m.put("requester_count", count);
        m.put("requested_by_me", byMe);
        m.put("first_requested_at", r.getRequestedAt());
        m.put("run_at", r.getRunAt());
        return m;
    }

    private static Map<String, Object> item(String key, String inst, String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("req_key", key);
        m.put("institution_id", inst);
        m.put("result_cd", code);
        return m;
    }

    private static Map<String, Object> results(List<Map<String, Object>> rs) {
        int ok = 0;
        for (Map<String, Object> r : rs) {
            Object c = r.get("result_cd");
            if ("OK".equals(c) || PlanAgentClient.SENT.equals(c)) ok++;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok_count", ok);
        out.put("results", rs);
        return out;
    }

    private static void line(StringBuilder sb, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(InstitutionPlanService.csvCell(cells[i]));
        }
        sb.append("\r\n");
    }

    static String dayOf(String iso) {
        if (iso == null) return null;
        try {
            return OffsetDateTime.parse(iso).atZoneSameInstant(SEOUL).toLocalDate().toString();
        } catch (DateTimeParseException e) {
            return iso.length() >= 10 ? iso.substring(0, 10) : iso;
        }
    }

    private void failed(String inst, String action, String outcome, Actor actor, BoardUiIds.Ui ui) {
        try {
            audit.record(inst, null, action, outcome, null, null, actor, ui);
        } catch (RuntimeException ex) {
            LOG.error("plan-collect audit failed action={} outcome={}", action, outcome);   // 값 없음
        }
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
}
