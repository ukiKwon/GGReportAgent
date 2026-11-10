package com.kbstar.kgi.ggreport.web.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kbstar.kgi.ggreport.web.boarddoc.BoardDocSpec;
import com.kbstar.kgi.ggreport.web.domain.ApprovalRequest;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialAct;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialAssignee;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialLogView;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialSnap;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BoardMaterialIn;
import com.kbstar.kgi.ggreport.web.dto.BoardWriteIn;
import com.kbstar.kgi.ggreport.web.mapper.ApprovalRequestMapper;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.Pii;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.apache.ibatis.session.RowBounds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 이사회 자료 저장·제출·확정(020). 자료 1건 = 입찰 건 소속의 기관+연도. 값은 '버전 저장'을 누를 때만 저장하고 원본 xlsx·파일명은 저장하지 않는다.
 * 흐름: 준비 중(PREP) → 작성 중(DRAFT) → 제출(SUBMITTED, 결재 중·값 수정 불가) → 확정(CONFIRMED, 값 수정 불가).
 * 결과(RESULT_CD)는 확정 뒤 담당자가 바꾼다. 영업부장은 제출 이후 자료를 '재작성 요구'로 DRAFT 로 되돌릴 수 있다.
 *
 * <p>접근(사용자 확정 2026-11-10): 쓰기·열람은 그 입찰 건의 현재 담당자만({@link BoardAccess}, 관리자·팀장·부장 예외 없음).
 * 담당이 아니면 목록에서 빠지고 상세·버전·이력은 없는 번호와 같은 404 다. 결재자는 {@link #review} 로만 읽는다(읽기 전용).
 * 쓰기 거부(403)의 접근 이력 DENIED 기록은 컨트롤러가, 확정 건의 감사 기록은 {@link BoardMaterialAudit} 가 한다.
 *
 * <p>⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다(Actor). 이 규칙은 실수 방지용 업무 규칙이다. 이력의 emp_verified 는
 * "앞단 인증 주체였나"의 사실만 적는다. 값·메모·사유는 접근 이력에 넣지 않는다.
 */
@Service
public class BoardMaterialService {

    static final int MAX_SNAPS = 200;
    static final int MAX_JSON_BYTES = 262144;
    static final int MAX_TABLES = 20;
    static final int MAX_CELLS = 500;
    static final int MAX_NOTE = 200;
    static final int MAX_REASON = 200;
    static final int LIST_CAP = 300;
    static final int ACT_CAP = 500;
    static final int YEAR_MIN = 2000;
    static final int YEAR_MAX = 2100;

    /** 숫자 칸(엑셀 연결 칸): 부호 포함 정수부 13자리(천원 단위로 9,999조 원까지), 소수 2자리까지(비율·환산 칸). */
    static final int NUM_INT_DIGITS = 13;
    static final int NUM_FRAC_DIGITS = 2;
    /** 쉼표 묶음은 정수부 13자리를 넘지 않는 모양만: 1~3자리+(,ddd)×1~3(최대 12자리) 또는 1자리+(,ddd)×4(13자리). */
    private static final Pattern NUM = Pattern.compile(
            "-?(?:\\d{1,13}|\\d{1,3}(?:,\\d{3}){1,3}|\\d(?:,\\d{3}){4})(?:\\.\\d{1,2})?");
    private static final String NUM_MSG = "숫자 칸에는 숫자(정수부 " + NUM_INT_DIGITS + "자리, 소수 " + NUM_FRAC_DIGITS
            + "자리 이내)만 입력할 수 있습니다.";
    /** 응답 detail.cells 의 최대 개수와 칸 식별자 허용 모양(클라이언트가 보낸 임의 문자열을 되돌려 싣지 않는다). */
    static final int MAX_MARKS = 50;
    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_]{1,40}");

    static final String PREP = "PREP";
    static final String DRAFT = "DRAFT";
    static final String SUBMITTED = "SUBMITTED";
    static final String CONFIRMED = "CONFIRMED";
    static final String SCHEDULED = "SCHEDULED";
    static final String PASSED = "PASSED";
    static final String REJECTED = "REJECTED";
    static final Set<String> STATUSES = new HashSet<>(Arrays.asList(PREP, DRAFT, SUBMITTED, CONFIRMED));
    static final Set<String> RESULTS = new HashSet<>(Arrays.asList(SCHEDULED, PASSED, REJECTED));

    static final String NOT_FOUND = "이사회 자료를 찾을 수 없습니다.";
    static final String WRITE_DENIED = "이 이사회 자료를 작성할 권한이 없습니다.";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final BoardMaterialMapper mapper;
    private final BoardAccess access;
    private final BoardFormService forms;
    private final BidAssignmentService assignments;
    private final ApprovalRequestMapper requests;
    private final SysUserMapper users;

    public BoardMaterialService(BoardMaterialMapper mapper, BoardAccess access, BoardFormService forms,
                                BidAssignmentService assignments, ApprovalRequestMapper requests, SysUserMapper users) {
        this.mapper = mapper;
        this.access = access;
        this.forms = forms;
        this.assignments = assignments;
        this.requests = requests;
        this.users = users;
    }

    // ── 조회(담당자) ──

    /** 목록 — 내가 담당인 입찰 건의 자료만. 영업 계열이 아니면 SQL 없이 빈 목록(403 아님). */
    @Transactional(readOnly = true)
    public Map<String, Object> list(SysUser me, String q, String status, String year, String assignee,
                                    String meetingFrom, String meetingTo) {
        String st = blankToNull(status);
        if (st != null && !STATUSES.contains(st)) {
            throw new ApiException(400, "상태 값이 올바르지 않습니다.");
        }
        Integer y = parseYear(year, false);
        String from = optDate(meetingFrom);
        String to = optDate(meetingTo);
        String like1 = like(q);
        String like2 = like(assignee);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean all = access.isViewAll(me.getEmpNo());   // 영업부장: 모든 상태·전체(읽기 전용)
        if (!all && !access.isSalesWriter(me.getEmpNo())) {
            out.put("items", new ArrayList<Map<String, Object>>());
            out.put("truncated", false);
            return out;
        }
        List<BoardMaterial> rows = mapper.selectList(me.getEmpNo(), all, like1, st, y, from, to, like2,
                new RowBounds(0, LIST_CAP + 1));
        boolean truncated = rows.size() > LIST_CAP;
        if (truncated) {
            rows = new ArrayList<>(rows.subList(0, LIST_CAP));
        }
        Map<String, List<Map<String, Object>>> byCase = assigneesByCase(rows);
        List<Map<String, Object>> items = new ArrayList<>();
        for (BoardMaterial m : rows) {
            Map<String, Object> it = header(m);
            List<Map<String, Object>> as = byCase.get(m.getBidCaseId());
            it.put("assignees", as == null ? new ArrayList<Map<String, Object>>() : as);
            it.put("can_write", !all);   // 영업부장은 읽기 전용, 그 외 목록은 SQL 이 내 담당 건만 고른다
            items.add(it);
        }
        out.put("items", items);
        out.put("truncated", truncated);
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> detail(SysUser me, String id) {
        BoardMaterial m = loadVisible(me, id);
        Map<String, Object> out = body(m);
        out.put("viewer", viewer(m, access.canWriteCase(me.getEmpNo(), m.getBidCaseId())));
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> snapshots(SysUser me, String id) {
        BoardMaterial m = loadVisible(me, id);
        List<Map<String, Object>> items = new ArrayList<>();
        for (BoardMaterialSnap s : mapper.selectSnaps(m.getMaterialId())) {
            items.add(snapView(s, false));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("material_id", m.getMaterialId());
        out.put("current_snap", m.getCurSnap());
        out.put("items", items);
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> snapshot(SysUser me, String id, String snapNo) {
        BoardMaterial m = loadVisible(me, id);
        Long n = parseId(snapNo);
        BoardMaterialSnap s = n == null || n < 1 || n > MAX_SNAPS ? null : mapper.selectSnap(m.getMaterialId(), n.intValue());
        if (s == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        Map<String, Object> out = snapView(s, true);
        out.put("form", forms.structureForStored(m.getFormId(), m.getFormVer()));   // 부장·담당자 모두 이것으로 읽기 전용 표를 그린다
        return out;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(SysUser me, String id) {
        return logOf(loadVisible(me, id));
    }

    // ── 조회(결재 경로) ──

    /**
     * 검토 열람(읽기 전용) — ⓐ그 자료의 제출 결재선에 결재자로 있었던 사람 ⓑ활성 영업부장(제출 이후 SUBMITTED·CONFIRMED 만).
     * 담당자는 detail 을 쓴다. 그 외·준비 중·작성 중 자료는 404(없는 번호와 같음).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> review(SysUser me, String id) {
        BoardMaterial m = loadReviewable(me, id);
        Map<String, Object> out = body(m);
        out.put("viewer", viewer(m, false));
        return out;
    }

    /** 감사 기록 열람 — 검토 열람 가능한 사람 또는 담당자. 최근 500건. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> acts(SysUser me, String id) {
        BoardMaterial m = canReviewQuiet(me, id);
        if (m == null) {
            m = loadVisible(me, id);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (BoardMaterialAct a : mapper.selectActs(m.getMaterialId(), new RowBounds(0, ACT_CAP))) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("action_cd", a.getActionCd());
            x.put("outcome", a.getOutcome());
            x.put("status_cd", a.getStatusCd());
            x.put("result_cd", a.getResultCd());
            x.put("snap_no", a.getSnapNo());
            x.put("actor_emp_no", a.getActorEmpNo());
            x.put("actor_name", a.getActorName());
            x.put("emp_verified", a.getEmpVerified() == 1);
            x.put("screen_id", a.getScreenId());
            x.put("button_id", a.getButtonId());
            x.put("ui_valid", a.getUiValid() == 1);
            x.put("logged_at", a.getLoggedAt());
            out.add(x);
        }
        return out;
    }

    // ── 쓰기(담당자) ──

    /** 자료 만들기 — 그 입찰 건의 현재 담당자만(403, 입찰 건 존재 여부는 알리지 않는다). 첫 문장이 배정 머리 잠금(security P3). */
    @Transactional
    public Map<String, Object> create(SysUser me, Actor actor, BoardMaterialIn.Create in) {
        if (in == null) {
            throw new ApiException(400, "요청 내용이 없습니다.");
        }
        String bid = in.getBidCaseId() == null ? "" : in.getBidCaseId().trim();
        if (bid.isEmpty() || bid.length() > 64) {
            throw new ApiException(400, "입찰 건을 지정하세요.");
        }
        mapper.lockAssignCase(bid);
        if (!access.canWriteCase(me.getEmpNo(), bid)) {
            throw new ApiException(403, WRITE_DENIED);
        }
        Integer year = parseYear(in.getYear() == null ? null : String.valueOf(in.getYear()), true);
        String inst = mapper.selectCaseInstitution(bid);
        if (inst == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        List<Long> same = mapper.selectIdsByCaseYear(bid, year);   // 잠금 안·잠금 읽기 — 동시 생성·두 번 누름도 여기서 걸린다
        if (!same.isEmpty()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("code", "ALREADY_EXISTS");
            d.put("message", "이 입찰 건의 해당 연도 이사회 자료가 이미 있습니다.");
            d.put("material_id", same.get(0));   // 이미 담당 자격 검사를 지난 호출자 — 그 건 자료는 어차피 볼 수 있다(존재 은닉 새로 깨지지 않음)
            throw ApiException.withDetail(409, d);
        }
        String formId = blankToNull(in.getFormId()) == null ? BoardDocSpec.DEFAULT_ID : in.getFormId().trim();
        BoardFormService.WriteTarget target = forms.formForWrite(me.getEmpNo(), formId,
                in.getFormVersion() == null ? null : String.valueOf(in.getFormVersion()));
        String now = Times.nowIso();
        BoardMaterial m = new BoardMaterial();
        m.setBidCaseId(bid);
        m.setInstitutionId(inst);
        m.setBoardYear(year);
        m.setStatusCd(PREP);
        m.setFormId(String.valueOf(target.getId()));
        m.setFormVer(target.getVersion() == null ? 0 : target.getVersion());
        m.setCreatedBy(me.getEmpNo());
        m.setCreatedAt(now);
        m.setUpdatedBy(me.getEmpNo());
        m.setUpdatedAt(now);
        mapper.insertMaterial(m);
        mapper.insertLog(m.getMaterialId(), "CREATE", null, PREP, null, null, null, null, null, null, null,
                me.getEmpNo(), verified(actor), now);
        return detail(me, String.valueOf(m.getMaterialId()));
    }

    /**
     * 버전 저장 — 담당자만. 순서: 보임(404) → 쓰기 자격(403) → 잠김(409 MATERIAL_LOCKED) → 입력(400) → 개인정보(422) → 크기(400) → 충돌(409).
     * base_snap_no 가 현재와 다르면 409 CONFLICT, 같은 값이면 새 버전 없이 changed=false. PREP 이면 첫 저장 때 DRAFT 로 간다.
     */
    @Transactional
    public Map<String, Object> saveSnapshot(SysUser me, Actor actor, String id, BoardMaterialIn.Save in) {
        BoardMaterial m = loadVisible(me, id);
        requireWriter(me, m);
        if (!PREP.equals(m.getStatusCd()) && !DRAFT.equals(m.getStatusCd())) {
            throw coded(409, "MATERIAL_LOCKED", "제출했거나 확정된 자료는 값을 고칠 수 없습니다.");
        }
        if (in == null || in.getBaseSnapNo() == null || in.getBaseSnapNo() < 0) {
            throw coded(400, "BAD_REQUEST", "기준 버전(base_snap_no)이 필요합니다.");
        }
        String note = checkedText(in.getNote(), MAX_NOTE, "메모", false);
        String json = toJson(checkedValues(me.getEmpNo(), m, in.getTables()));
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_BYTES) {
            throw coded(400, "BAD_VALUE", "저장할 내용이 너무 큽니다.");
        }
        if (in.getBaseSnapNo() != m.getCurSnap()) {
            throw coded(409, "CONFLICT", "다른 사람이 먼저 저장했습니다. 새로 고친 뒤 다시 저장해 주세요.");
        }
        if (m.getCurSnap() > 0) {
            BoardMaterialSnap cur = mapper.selectSnap(m.getMaterialId(), m.getCurSnap());
            if (cur != null && json.equals(cur.getValuesJson())) {
                Map<String, Object> same = new LinkedHashMap<>();
                same.put("material_id", m.getMaterialId());
                same.put("snap_no", m.getCurSnap());
                same.put("changed", false);
                return same;
            }
        }
        if (m.getCurSnap() >= MAX_SNAPS) {
            throw coded(400, "TOO_MANY_VERSIONS", "저장 이력이 너무 많아 더 저장할 수 없습니다.");
        }
        int next = m.getCurSnap() + 1;
        String now = Times.nowIso();
        if (mapper.updateCurSnap(m.getMaterialId(), m.getCurSnap(), next, me.getEmpNo(), now) != 1) {
            throw coded(409, "CONFLICT", "다른 사람이 먼저 저장했거나 자료가 제출되었습니다. 새로 고친 뒤 다시 확인해 주세요.");
        }
        if (PREP.equals(m.getStatusCd())) {
            mapper.updateStartDraft(m.getMaterialId(), me.getEmpNo(), now);
        }
        BoardMaterialSnap s = new BoardMaterialSnap();
        s.setMaterialId(m.getMaterialId());
        s.setSnapNo(next);
        s.setValuesJson(json);
        s.setNote(note);
        s.setSavedBy(me.getEmpNo());
        s.setSavedAt(now);
        mapper.insertSnap(s);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("material_id", m.getMaterialId());
        out.put("snap_no", next);
        out.put("changed", true);
        out.put("saved_at", now);
        return out;
    }

    /** 결과 변경(의결 예정·가결·부결·개최일) — 확정된 자료에서 담당자만. 값(버전)은 건드리지 않는다. */
    @Transactional
    public Map<String, Object> changeResult(SysUser me, Actor actor, String id, BoardMaterialIn.Result in) {
        BoardMaterial m = loadVisible(me, id);
        requireWriter(me, m);
        if (!CONFIRMED.equals(m.getStatusCd())) {
            throw coded(409, "NOT_CONFIRMED", "확정된 자료만 의결 결과를 입력할 수 있습니다.");
        }
        if (in == null || blankToNull(in.getResult()) == null || !RESULTS.contains(in.getResult().trim())) {
            throw coded(400, "BAD_REQUEST", "의결 결과(result)가 올바르지 않습니다.");
        }
        String to = in.getResult().trim();
        String meeting = optDate(in.getMeetingDate());
        if (SCHEDULED.equals(to) && meeting == null) {
            throw coded(400, "MEETING_DATE_REQUIRED", "의결 예정이면 개최일을 입력하세요.");
        }
        String now = Times.nowIso();
        if (mapper.updateResult(m.getMaterialId(), m.getResultCd(), to, meeting, me.getEmpNo(), now) != 1) {
            throw coded(409, "CONFLICT", "다른 사람이 먼저 바꿨습니다. 새로 고친 뒤 다시 시도해 주세요.");
        }
        mapper.insertLog(m.getMaterialId(), "RESULT", null, null, m.getResultCd(), to, meeting, null, null, null, null,
                me.getEmpNo(), verified(actor), now);
        return detail(me, id);
    }

    // ── 제출 흐름(결재 연계 — ApprovalRequestService 가 호출한다) ──

    /** 제출 계획 — 검증과 결재자 계산(쓰기 없음). */
    public static final class SubmitPlan {
        private final BoardMaterial material;
        private final SysUser approver;

        SubmitPlan(BoardMaterial material, SysUser approver) {
            this.material = material;
            this.approver = approver;
        }

        public BoardMaterial getMaterial() { return material; }
        public SysUser getApprover() { return approver; }
    }

    /** 제출 검증: 보임(404) → 담당자(403) → 상태·버전(409) → 결재자(400 APPROVER_NOT_RESOLVED). */
    @Transactional(readOnly = true)
    public SubmitPlan planSubmit(String id, SysUser me) {
        BoardMaterial m = loadVisible(me, id);
        requireWriter(me, m);
        if (SUBMITTED.equals(m.getStatusCd())) {
            throw coded(409, "ALREADY_SUBMITTED", "이미 제출해 결재 중인 자료입니다.");
        }
        if (CONFIRMED.equals(m.getStatusCd())) {
            throw coded(409, "MATERIAL_LOCKED", "이미 확정된 자료입니다.");
        }
        if (!DRAFT.equals(m.getStatusCd()) || m.getCurSnap() < 1) {
            throw coded(409, "NO_SNAPSHOT", "저장한 버전이 있어야 제출할 수 있습니다. 먼저 '버전 저장'을 하세요.");
        }
        boolean leadInvolved = BidAssignmentService.LEAD_ROLE.equals(BoardAccess.role(me))
                || assignments.anyActiveLead(m.getBidCaseId());
        return new SubmitPlan(m, assignments.resolveApprover(me, leadInvolved));
    }

    /** 결재 요청 행을 만든 뒤 호출 — 자료를 SUBMITTED 로 선점한다. 0행이면 409(호출 트랜잭션이 요청 행째 롤백). */
    @Transactional
    public void claimSubmit(SubmitPlan plan, Long reqId, SysUser me, Actor actor) {
        BoardMaterial m = plan.getMaterial();
        String now = Times.nowIso();
        if (mapper.claimSubmit(m.getMaterialId(), m.getCurSnap(), reqId, me.getEmpNo(), now) != 1) {
            throw coded(409, "CONFLICT", "자료가 그 사이 바뀌어 제출하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
        }
        mapper.insertLog(m.getMaterialId(), "SUBMIT", DRAFT, SUBMITTED, null, null, null, null, null, reqId, null,
                me.getEmpNo(), verified(actor), now);
    }

    /** 회수 검증: 담당자(누구나) ∧ SUBMITTED. 돌려주는 값은 취소할 결재 요청 번호. */
    @Transactional(readOnly = true)
    public Long planWithdraw(String id, SysUser me) {
        BoardMaterial m = loadVisible(me, id);
        requireWriter(me, m);
        if (!SUBMITTED.equals(m.getStatusCd()) || m.getSubmitReqId() == null) {
            throw coded(409, "NOT_SUBMITTED", "결재 중인 자료만 회수할 수 있습니다.");
        }
        return m.getSubmitReqId();
    }

    /** 회수·취소·반려 공통 후처리: SUBMITTED + 그 요청 → DRAFT. 0행이면 409(호출 트랜잭션 롤백). */
    @Transactional
    public void afterSubmitEnded(Long reqId, String materialId, String event, String actorEmp, int verified) {
        Long mid = parseId(materialId);
        String now = Times.nowIso();
        if (mid == null || mapper.backToDraftByReq(mid, reqId, actorEmp, now) != 1) {
            throw coded(409, "CONFLICT", "이미 처리된 요청입니다.");
        }
        mapper.insertLog(mid, event, SUBMITTED, DRAFT, null, null, null, null, null, reqId, null, actorEmp, verified, now);
    }

    /** 승인 후처리(같은 트랜잭션 — 예외를 던지면 승인까지 되돌아간다). */
    @Transactional
    public String applyConfirm(ApprovalRequest r, SysUser decider, Actor actor) {
        JsonNode p = readPayload(r.getPayload());
        Long mid = parseId(p.path("material_id").asText(""));
        BoardMaterial m = mid == null ? null : mapper.selectOne(mid);
        if (m == null) {
            throw coded(409, "CONFLICT", "이미 처리된 요청입니다.");
        }
        String d = decider.getEmpNo();
        String dRole = BoardAccess.role(decider);
        if ((!BidAssignmentService.LEAD_ROLE.equals(dRole) && !BidAssignmentService.HEAD_ROLE.equals(dRole))
                || assignments.isActiveAssignee(m.getBidCaseId(), d)) {
            throw new ApiException(403, "이 이사회 자료 제출을 승인할 수 없습니다.");   // 승인자=담당자 방어
        }
        SysUser requester = users.selectByEmpNo(r.getRequesterEmpNo());
        boolean leadInvolved = requester == null || BidAssignmentService.LEAD_ROLE.equals(BoardAccess.role(requester))
                || assignments.anyActiveLead(m.getBidCaseId());
        if (leadInvolved && !BidAssignmentService.HEAD_ROLE.equals(dRole)) {
            throw coded(409, "APPROVER_ROLE_MISMATCH",
                    "영업팀장이 관련된 제출은 영업부장만 승인할 수 있습니다. 반려하거나 취소하고 다시 제출하세요.");
        }
        String now = Times.nowIso();
        if (mapper.confirm(m.getMaterialId(), r.getReqId(), d, now) != 1) {
            throw coded(409, "CONFLICT", "이미 처리된 요청입니다.");
        }
        mapper.insertLog(m.getMaterialId(), "CONFIRM", SUBMITTED, CONFIRMED, null, null, null, null, null, r.getReqId(),
                null, d, verified(actor), now);
        return "이사회 자료 확정";
    }

    // ── 재작성 요구(영업부장) ──

    public static final class ReworkPlan {
        private final BoardMaterial material;
        private final String reason;

        ReworkPlan(BoardMaterial material, String reason) {
            this.material = material;
            this.reason = reason;
        }

        public BoardMaterial getMaterial() { return material; }
        public String getReason() { return reason; }
    }

    /** 재작성 요구 검증: 활성 영업부장 ∧ 검토 열람 가능 ∧ SUBMITTED·CONFIRMED ∧ 사유 1~200자. */
    @Transactional(readOnly = true)
    public ReworkPlan planRework(String id, SysUser me, BoardMaterialIn.Rework in) {
        if (!"ACTIVE".equals(me.getStatus()) || !BoardAccess.isHead(me)) {
            throw new ApiException(403, "재작성 요구는 영업부장만 할 수 있습니다.");
        }
        BoardMaterial m = loadReviewable(me, id);
        if (!SUBMITTED.equals(m.getStatusCd()) && !CONFIRMED.equals(m.getStatusCd())) {
            throw coded(409, "NOT_APPLICABLE", "아직 제출하지 않은 자료는 재작성을 요구할 수 없습니다.");   // 준비 중·작성 중은 되돌릴 것이 없다
        }
        String reason = checkedText(in == null ? null : in.getReason(), MAX_REASON, "사유", true);
        return new ReworkPlan(m, reason);
    }

    /** 결재 요청이 있으면(SUBMITTED) 그 요청 번호, 없으면(CONFIRMED) null. 호출 순서: 요청 종료 → applyRework. */
    public Long reworkReqId(ReworkPlan plan) {
        return SUBMITTED.equals(plan.getMaterial().getStatusCd()) ? plan.getMaterial().getSubmitReqId() : null;
    }

    @Transactional
    public Map<String, Object> applyRework(ReworkPlan plan, SysUser me, Actor actor) {
        BoardMaterial m = plan.getMaterial();
        String now = Times.nowIso();
        int rows = SUBMITTED.equals(m.getStatusCd())
                ? mapper.backToDraftByReq(m.getMaterialId(), m.getSubmitReqId(), me.getEmpNo(), now)
                : mapper.backToDraftFromConfirmed(m.getMaterialId(), me.getEmpNo(), now);
        if (rows != 1) {
            throw coded(409, "CONFLICT", "자료 상태가 그 사이 바뀌었습니다. 새로 고친 뒤 다시 시도해 주세요.");
        }
        mapper.insertLog(m.getMaterialId(), "REWORK", m.getStatusCd(), DRAFT, m.getResultCd(), null, null, null, null,
                m.getSubmitReqId(), plan.getReason(), me.getEmpNo(), verified(actor), now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("material_id", m.getMaterialId());
        out.put("status_cd", DRAFT);
        return out;
    }

    // ── 담당자 인계(BidAssignmentService.applyChange 가 호출) ──

    /** 접근 이력·감사용 상태 조회 — 보임 여부와 무관하게 자료 한 행(없으면 null). 컨트롤러·감사만 쓴다. */
    @Transactional(readOnly = true)
    public BoardMaterial peek(String id) {
        Long n = parseId(id);
        return n == null ? null : mapper.selectOne(n);
    }

    // ── 내부 ──

    private BoardMaterial loadVisible(SysUser me, String id) {
        Long n = parseId(id);
        BoardMaterial m = n == null ? null : mapper.selectOne(n);
        if (m == null || !access.canViewCase(me.getEmpNo(), m.getBidCaseId())) {
            throw ApiException.notFound(NOT_FOUND);   // 없는 번호와 같게 — 존재를 숨긴다
        }
        return m;
    }

    /** 결재 경로 열람 가능한 자료 또는 404. */
    private BoardMaterial loadReviewable(SysUser me, String id) {
        BoardMaterial m = canReviewQuiet(me, id);
        if (m == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return m;
    }

    /** 검토 열람 가능하면 자료, 아니면 null(예외 없음). 담당자 본인은 제외(detail 을 쓴다). */
    private BoardMaterial canReviewQuiet(SysUser me, String id) {
        Long n = parseId(id);
        BoardMaterial m = n == null ? null : mapper.selectOne(n);
        if (m == null || !"ACTIVE".equals(me.getStatus())) {
            return null;
        }
        if (BoardAccess.isHead(me)) {   // 영업부장은 모든 상태를 읽는다(사용자 확정 2026-11-10)
            return m;
        }
        boolean lineSeen = mapper.countApprovalStep(m.getMaterialId(), me.getEmpNo()) > 0;
        return lineSeen ? m : null;
    }

    private void requireWriter(SysUser me, BoardMaterial m) {
        if (!access.canWriteCase(me.getEmpNo(), m.getBidCaseId())) {
            throw new ApiException(403, WRITE_DENIED);   // 해제된 사람. 컨트롤러가 DENIED 로 남긴다
        }
    }

    private Map<String, Object> viewer(BoardMaterial m, boolean assignee) {
        Map<String, Object> v = new LinkedHashMap<>();
        boolean editable = PREP.equals(m.getStatusCd()) || DRAFT.equals(m.getStatusCd());
        v.put("is_assignee", assignee);
        v.put("can_write", assignee && editable);
        v.put("can_submit", assignee && DRAFT.equals(m.getStatusCd()) && m.getCurSnap() > 0);
        v.put("can_withdraw", assignee && SUBMITTED.equals(m.getStatusCd()));
        v.put("can_set_result", assignee && CONFIRMED.equals(m.getStatusCd()));
        v.put("can_rework", !assignee && (SUBMITTED.equals(m.getStatusCd()) || CONFIRMED.equals(m.getStatusCd())));
        return v;
    }

    private Map<String, Object> body(BoardMaterial m) {
        Map<String, Object> out = header(m);
        List<Map<String, Object>> as = assigneesByCase(Collections.singletonList(m)).get(m.getBidCaseId());
        out.put("assignees", as == null ? new ArrayList<Map<String, Object>>() : as);
        BoardMaterialSnap s = m.getCurSnap() > 0 ? mapper.selectSnap(m.getMaterialId(), m.getCurSnap()) : null;
        out.put("snapshot", s == null ? null : snapView(s, true));
        out.put("form", forms.structureForStored(m.getFormId(), m.getFormVer()));
        return out;
    }

    private List<Map<String, Object>> logOf(BoardMaterial m) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BoardMaterialLogView l : mapper.selectLog(m.getMaterialId())) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("event_cd", l.getEventCd());
            x.put("from_status", l.getFromStatus());
            x.put("from_status_name", l.getFromStatusName());
            x.put("to_status", l.getToStatus());
            x.put("to_status_name", l.getToStatusName());
            x.put("from_result_name", l.getFromResultName());
            x.put("to_result_name", l.getToResultName());
            x.put("meeting_date", l.getMeetingDate());
            x.put("from_emp_no", l.getFromEmpNo());
            x.put("from_name", l.getFromName());
            x.put("to_emp_no", l.getToEmpNo());
            x.put("to_name", l.getToName());
            x.put("req_id", l.getReqId());
            x.put("reason", l.getReason());
            x.put("actor_emp_no", l.getActorEmpNo());
            x.put("actor_name", l.getActorName());
            x.put("emp_verified", l.getEmpVerified() == 1);   // false = 자기신고(위조 가능)
            x.put("logged_at", l.getLoggedAt());
            out.add(x);
        }
        return out;
    }

    private static Map<String, Object> header(BoardMaterial m) {
        Map<String, Object> x = new LinkedHashMap<>();
        x.put("material_id", m.getMaterialId());
        x.put("bid_case_id", m.getBidCaseId());
        x.put("institution_id", m.getInstitutionId());
        x.put("institution_name", m.getInstitutionName());
        x.put("year", m.getBoardYear());
        x.put("status_cd", m.getStatusCd());
        x.put("status_name", m.getStatusName());
        x.put("result_cd", m.getResultCd());
        x.put("result_name", m.getResultName());
        x.put("meeting_date", m.getMeetingDate());
        x.put("form_id", m.getFormId());
        x.put("form_version", m.getFormVer() == 0 ? null : m.getFormVer());
        x.put("current_snap", m.getCurSnap());
        x.put("confirmed_snap", m.getConfirmedSnap());
        x.put("confirmed_at", m.getConfirmedAt());
        x.put("created_by", m.getCreatedBy());
        x.put("last_saved_by", m.getLastSavedBy());
        x.put("last_saved_at", m.getLastSavedAt());
        x.put("created_at", m.getCreatedAt());
        x.put("updated_at", m.getUpdatedAt());
        return x;
    }

    private Map<String, List<Map<String, Object>>> assigneesByCase(List<BoardMaterial> rows) {
        Map<String, List<Map<String, Object>>> out = new LinkedHashMap<>();
        Set<String> ids = new LinkedHashSet<>();
        for (BoardMaterial m : rows) {
            ids.add(m.getBidCaseId());
        }
        if (ids.isEmpty()) {
            return out;
        }
        for (BoardMaterialAssignee a : mapper.selectAssignees(new ArrayList<>(ids))) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("emp_no", a.getEmpNo());
            p.put("name", a.getName());
            List<Map<String, Object>> l = out.get(a.getBidCaseId());
            if (l == null) {
                l = new ArrayList<>();
                out.put(a.getBidCaseId(), l);
            }
            l.add(p);
        }
        return out;
    }

    private static Map<String, Object> snapView(BoardMaterialSnap s, boolean withValues) {
        Map<String, Object> x = new LinkedHashMap<>();
        x.put("snap_no", s.getSnapNo());
        x.put("note", s.getNote());
        x.put("saved_by", s.getSavedBy());
        x.put("saved_by_name", s.getSavedByName());
        x.put("saved_at", s.getSavedAt());
        if (withValues) {
            x.put("tables", tablesOf(s.getValuesJson()));
        }
        return x;
    }

    /** 저장 JSON → [{ref, cells:{칸키:값}}]. 읽을 수 없으면 서버 결함(500). */
    private static List<Map<String, Object>> tablesOf(String json) {
        List<Map<String, Object>> out = new ArrayList<>();
        try {
            java.util.Iterator<Map.Entry<String, JsonNode>> it = JSON.readTree(json).path("tables").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                Map<String, Object> cells = new LinkedHashMap<>();
                java.util.Iterator<Map.Entry<String, JsonNode>> ci = e.getValue().fields();
                while (ci.hasNext()) {
                    Map.Entry<String, JsonNode> c = ci.next();
                    cells.put(c.getKey(), c.getValue().asText());
                }
                Map<String, Object> table = new LinkedHashMap<>();
                table.put("ref", e.getKey());
                table.put("cells", cells);
                out.add(table);
            }
        } catch (IOException e) {
            throw new IllegalStateException("stored board material is not valid");
        }
        return out;
    }

    /**
     * 저장할 값 검증·정규화: 표 수·칸 수 한도 → 칸 길이(개인정보 정규식은 길이에 비례해 느리므로 먼저, 400) → 개인정보(422, {@link Pii#scanLoose} —
     * NFKC·비ASCII 숫자·대시류·서식 문자 우회까지) → 숫자 칸 검증(연결 칸: {@link #canonNumber}, 400) → 양식 구조 대조(BoardDocSpec.withValues:
     * 값 칸이 아닌 키·모르는 표는 거부, 제어문자·trim·100자) → 값이 있는 칸만 추출 → <b>저장할 최종값으로 개인정보 한 번 더</b>(쉼표 제거로 생기는
     * 주민번호 모양, security 하-1). 400/422 는 문제 칸 위치(ref·key, 값 없음, 최대 {@value #MAX_MARKS}개)와 총수를 detail 에 싣는다.
     * 칸 값은 다른 담당자·결재자 화면에 그려지므로 화면은 esc 만 써야 한다.
     */
    private Map<String, Map<String, String>> checkedValues(String empNo, BoardMaterial m, List<BoardWriteIn.TableIn> tables) {
        if (tables == null || tables.size() > MAX_TABLES) {
            throw coded(400, "BAD_REQUEST", "표 목록(tables)이 올바르지 않습니다.");
        }
        Map<String, Map<String, String>> raw = new LinkedHashMap<>();
        Marks tooLong = new Marks();
        for (BoardWriteIn.TableIn t : tables) {
            if (t == null || t.getRef() == null || raw.containsKey(t.getRef())
                    || (t.getCells() != null && t.getCells().size() > MAX_CELLS)) {
                throw coded(400, "BAD_REQUEST", "표 목록(tables)이 올바르지 않습니다.");
            }
            Map<String, String> cells = t.getCells() == null ? new LinkedHashMap<String, String>() : t.getCells();
            for (Map.Entry<String, String> e : cells.entrySet()) {
                if (e.getValue() != null && e.getValue().length() > BoardDocSpec.MAX_CELL) {
                    tooLong.add(t.getRef(), e.getKey());
                }
            }
            raw.put(t.getRef(), new LinkedHashMap<>(cells));
        }
        if (tooLong.total > 0) {
            throw badCells("칸 값은 " + BoardDocSpec.MAX_CELL + "자 이하로 입력해 주세요.", tooLong);
        }
        Map<String, Integer> kinds = new LinkedHashMap<>();
        Marks pii = new Marks();
        scanPii(raw, kinds, pii);
        if (!kinds.isEmpty()) {
            throw piiDetected(kinds, pii);
        }
        BoardDocSpec.Doc base = forms.docForStoredAny(m.getFormId(), m.getFormVer());   // 팀 범위 없음 — form 구조 조회와 같다(담당자 자격은 이미 통과)
        Marks badNum = new Marks();
        for (BoardDocSpec.Table t : base.getTables()) {    // 연결(숫자) 칸은 숫자 검증·정규화 — 틀린 칸을 전부 모아 알린다
            Map<String, String> cells = raw.get(t.getId());
            if (cells == null) {
                continue;
            }
            for (List<BoardDocSpec.Cell> row : t.getRows()) {
                for (BoardDocSpec.Cell c : row) {
                    String v = c.isMapped() ? cells.get(c.getKey()) : null;
                    if (v != null && !v.trim().isEmpty()) {
                        if (isNumber(v)) {
                            cells.put(c.getKey(), canonNumber(v));
                        } else {
                            badNum.add(t.getId(), c.getKey());
                        }
                    }
                }
            }
        }
        if (badNum.total > 0) {
            throw badCells(NUM_MSG, badNum);
        }
        BoardDocSpec.Doc filled;
        try {
            filled = BoardDocSpec.withValues(base, raw);
        } catch (BoardDocSpec.EditException e) {
            throw coded(400, "BAD_VALUE", e.getMessage());
        }
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (BoardDocSpec.Table t : filled.getTables()) {
            for (List<BoardDocSpec.Cell> row : t.getRows()) {
                for (BoardDocSpec.Cell c : row) {
                    if ((c.isMapped() || c.isInput()) && c.getText() != null && !c.getText().isEmpty()) {
                        Map<String, String> cells = out.get(t.getId());
                        if (cells == null) {
                            cells = new LinkedHashMap<>();
                            out.put(t.getId(), cells);
                        }
                        cells.put(c.getKey(), c.getText());
                    }
                }
            }
        }
        Map<String, Integer> kinds2 = new LinkedHashMap<>();   // 숫자 정규화(쉼표 제거)·trim 뒤 저장값으로 재검사 — security 하-1
        Marks pii2 = new Marks();
        scanPii(out, kinds2, pii2);
        if (!kinds2.isEmpty()) {
            throw piiDetected(kinds2, pii2);
        }
        return out;
    }

    /** 칸 값 전체를 {@link Pii#scanLoose} 로 훑어 종류별 건수와 검출된 칸 위치를 모은다(값은 모으지 않는다). */
    private static void scanPii(Map<String, Map<String, String>> byRef, Map<String, Integer> kinds, Marks marks) {
        for (Map.Entry<String, Map<String, String>> t : byRef.entrySet()) {
            for (Map.Entry<String, String> c : t.getValue().entrySet()) {
                List<Pii.Finding> found = Pii.scanLoose(c.getValue());
                if (found.isEmpty()) {
                    continue;
                }
                marks.add(t.getKey(), c.getKey());
                for (Pii.Finding f : found) {
                    Integer n = kinds.get(f.getKind());
                    kinds.put(f.getKind(), n == null ? 1 : n + 1);
                }
            }
        }
    }

    private static ApiException piiDetected(Map<String, Integer> kinds, Marks marks) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "PII_DETECTED");
        d.put("message", "개인정보로 보이는 값이 있어 저장하지 않았습니다. 해당 칸을 지우고 다시 저장해 주세요.");
        List<Map<String, Object>> ks = new ArrayList<>();
        for (Map.Entry<String, Integer> e : kinds.entrySet()) {
            Map<String, Object> k = new LinkedHashMap<>();
            k.put("kind", e.getKey());
            k.put("count", e.getValue());
            ks.add(k);
        }
        d.put("kinds", ks);          // 종류·건수만 — 검출된 값은 싣지 않는다
        d.put("count", marks.total); // 검출된 칸 수(cells 는 알려진 칸만, 최대 MAX_MARKS)
        d.put("cells", marks.cells);
        return ApiException.withDetail(422, d);
    }

    private static ApiException badCells(String message, Marks marks) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "BAD_VALUE");
        d.put("message", message);
        d.put("count", marks.total);
        d.put("cells", marks.cells);
        return ApiException.withDetail(400, d);
    }

    /** 문제 칸 위치 모음 — 총수는 세고, 목록은 안전한 식별자(SAFE_ID, 개인정보 모양 아님)만 최대 MAX_MARKS 개. */
    private static final class Marks {
        final List<Map<String, Object>> cells = new ArrayList<>();
        int total;

        void add(String ref, String key) {
            total++;
            if (cells.size() < MAX_MARKS && safe(ref) && safe(key)) {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("ref", ref);
                c.put("key", key);
                cells.add(c);
            }
        }

        private static boolean safe(String s) {
            return s != null && SAFE_ID.matcher(s).matches() && Pii.scanLoose(s).isEmpty();
        }
    }

    private static boolean isNumber(String raw) {
        return NUM.matcher(raw.trim()).matches();
    }

    /** 숫자 칸 정규화: 앞뒤 공백 제거 → 천 단위 쉼표 허용(올바른 묶음만) → 정수부 13자리·소수 2자리 → 쉼표 없는 표준형. 아니면 400(입력값 비노출). */
    static String canonNumber(String raw) {
        String v = raw.trim();
        if (!NUM.matcher(v).matches()) {
            throw coded(400, "BAD_VALUE", NUM_MSG);
        }
        BigDecimal d = new BigDecimal(v.replace(",", ""));
        if (d.signum() == 0) {
            return "0";
        }
        return d.stripTrailingZeros().toPlainString();
    }

    /** 메모·사유: trim, 제어·서식·방향 문자 거부(security P5), 길이, 개인정보(NFKC 뒤 검사, 422·값 비노출). 비면 null(required 면 400). */
    static String checkedText(String raw, int max, String label, boolean required) {
        String t = raw == null ? "" : raw.trim();
        if (t.isEmpty()) {
            if (required) {
                throw coded(400, "BAD_VALUE", label + "를 입력하세요.");
            }
            return null;
        }
        for (int i = 0; i < t.length(); ) {
            int cp = t.codePointAt(i);
            i += Character.charCount(cp);
            int ty = Character.getType(cp);
            if (cp != '\n' && (ty == Character.CONTROL || ty == Character.FORMAT || ty == Character.SURROGATE
                    || ty == Character.LINE_SEPARATOR || ty == Character.PARAGRAPH_SEPARATOR
                    || (cp >= 0x2066 && cp <= 0x2069) || cp == 0x061C)) {
                throw coded(400, "BAD_VALUE", label + "에 쓸 수 없는 문자가 있습니다.");
            }
        }
        if (t.length() > max) {
            throw coded(400, "BAD_VALUE", label + "는 " + max + "자 이하로 입력해 주세요.");
        }
        if (!Pii.scanLoose(t).isEmpty()) {
            throw coded(422, "PII_DETECTED", label + "에 개인정보로 보이는 값이 있어 저장하지 않았습니다.");
        }
        return t;
    }

    private static JsonNode readPayload(String s) {
        try {
            return JSON.readTree(s == null ? "{}" : s);
        } catch (IOException e) {
            throw new ApiException(500, "요청 내용을 읽을 수 없습니다.");
        }
    }

    private static String toJson(Map<String, Map<String, String>> values) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("v", 1);
        root.put("tables", values);
        try {
            return JSON.writeValueAsString(root);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("board material json failed");
        }
    }

    static int verified(Actor actor) {
        return actor != null && actor.isVerified() ? 1 : 0;
    }

    private static String blankToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s;
    }

    /** LIKE 검색어 — 앞뒤 공백 제거, 80자 상한(초과 400), ! % _ 를 '!' 로 이스케이프. 비면 null. */
    private static String like(String s) {
        String t = blankToNull(s) == null ? null : s.trim();
        if (t == null) {
            return null;
        }
        if (t.length() > 80) {
            throw new ApiException(400, "검색어는 80자 이하로 입력해 주세요.");
        }
        return t.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private static Integer parseYear(String s, boolean required) {
        if (blankToNull(s) == null) {
            if (required) {
                throw new ApiException(400, "연도를 입력하세요.");
            }
            return null;
        }
        Long n = parseId(s.trim());
        if (n == null || n < YEAR_MIN || n > YEAR_MAX) {
            throw new ApiException(400, "연도는 " + YEAR_MIN + "~" + YEAR_MAX + " 사이여야 합니다.");
        }
        return n.intValue();
    }

    /** yyyy-MM-dd 만(실재하는 날짜, 2000~2100). 비면 null. */
    private static String optDate(String s) {
        if (blankToNull(s) == null) {
            return null;
        }
        String t = s.trim();
        try {
            LocalDate d = LocalDate.parse(t);
            if (t.length() != 10 || d.getYear() < YEAR_MIN || d.getYear() > YEAR_MAX) {
                throw new DateTimeParseException("range", t, 0);
            }
        } catch (DateTimeParseException e) {
            throw new ApiException(400, "날짜는 yyyy-MM-dd 형식이어야 합니다.");
        }
        return t;
    }

    static Long parseId(String s) {
        if (s == null || s.isEmpty() || s.length() > 15) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) < '0' || s.charAt(i) > '9') {
                return null;
            }
        }
        return Long.valueOf(s);
    }

    static ApiException coded(int status, String code, String message) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", code);
        d.put("message", message);
        return ApiException.withDetail(status, d);
    }
}
