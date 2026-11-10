package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidAssignCase;
import com.kbstar.kgi.ggreport.web.domain.BidAssignLogView;
import com.kbstar.kgi.ggreport.web.domain.BidAssignMine;
import com.kbstar.kgi.ggreport.web.domain.BidAssigneeView;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.BidAssignmentMapper;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Teams;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 입찰 건 담당자 배정(019, S2-a) — 최초 배정·조회·이력·내 담당 건·쓰기 판정.
 *
 * <p>규칙(사용자 확정 2026-11-10): 담당자는 한 건에 1~10명, 영업팀·영업팀장만 지정 가능(영업부장·디자이너·타 팀 불가).
 * 최초 배정은 영업팀장만 하고(관리자·영업부장 403) 자기 자신을 넣어도 된다(이력에 표시). 열람은 영업팀 전원
 * (영업팀·영업팀장·영업부장 — 관리자·디자이너 403). 담당자 변경 결재(ASSIGNEE_CHANGE)는 S2-b 다.
 *
 * <p>⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다({@link Actor}). 이 역할 검사는 <b>업무 규칙(실수 방지)</b>이지
 * 사칭 방지가 아니다. 이력의 {@code emp_verified} 는 "앞단 인증 주체였나"의 사실만 적는다.
 * 모든 쓰기는 한 트랜잭션이라 중간 실패 시 머리·배정·이력이 함께 되돌아간다.
 */
@Service
public class BidAssignmentService {

    public static final int MIN_ASSIGNEES = 1;
    public static final int MAX_ASSIGNEES = 10;

    static final String MEMBER_ROLE = Teams.DESIGNER_HOME_TEAM + Teams.TEAM_SUFFIX;   // 영업팀
    static final String LEAD_ROLE = Teams.leadOf(Teams.DESIGNER_HOME_TEAM);            // 영업팀장
    static final String HEAD_ROLE = Teams.FINAL_APPROVER;                              // 영업부장

    static final String ACTION_ASSIGN = "ASSIGN";
    static final String SELF_REASON = "팀장 자기 포함 배정";

    private final BidAssignmentMapper mapper;
    private final SysUserMapper users;

    public BidAssignmentService(BidAssignmentMapper mapper, SysUserMapper users) {
        this.mapper = mapper;
        this.users = users;
    }

    /**
     * 그 사번이 그 입찰 건의 <b>현재</b> 담당자인가 — 쓰기 판정의 단일 자리. 배정 테이블({@code ACTIVE_YN=1})만 본다.
     * 해제되면 다음 요청부터 false 다. 관리자 예외 없음. USERS ACTIVE 확인은 호출하는 쪽(020 BoardAccess)이 더한다.
     */
    @Transactional(readOnly = true)
    public boolean isActiveAssignee(String bidCaseId, String empNo) {
        if (bidCaseId == null || bidCaseId.isEmpty() || !MenuPerms.isEmpNo(empNo)) {
            return false;
        }
        return mapper.countActive(bidCaseId, empNo) > 0;
    }

    /** 배정 조회 — 영업팀 전원. 아직 배정 전이면 {@code assigned=false}, 담당자 빈 배열. */
    @Transactional(readOnly = true)
    public Map<String, Object> view(String bidCaseId, SysUser me) {
        requireSalesTeam(me);
        requireBidCase(bidCaseId);
        BidAssignCase head = mapper.selectCase(bidCaseId);
        List<BidAssigneeView> rows = mapper.selectActiveAssignees(bidCaseId);
        boolean assigned = head != null && !rows.isEmpty();
        boolean isAssignee = false;
        for (BidAssigneeView r : rows) {
            if (r.getEmpNo().equals(me.getEmpNo())) {
                isAssignee = true;
            }
        }
        boolean lead = LEAD_ROLE.equals(roleOf(me));
        Map<String, Object> viewer = new LinkedHashMap<>();
        viewer.put("is_assignee", isAssignee);
        viewer.put("can_assign", lead && !assigned);
        // 변경 신청 API 는 S2-b — 그 전에는 화면이 이 값으로 버튼을 만들지 않는다.
        viewer.put("can_request_change", assigned && (isAssignee || lead));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bidCaseId);
        m.put("assigned", assigned);
        m.put("group_ver", head == null ? 0 : head.getGroupVer());
        m.put("assignees", assigneeMaps(rows));
        m.put("pending_change", null);   // S2-b
        m.put("viewer", viewer);
        return m;
    }

    /** 최초 배정 — 영업팀장만. 이미 배정된 건은 409 {@code ASSIGNED_ALREADY}. */
    @Transactional
    public Map<String, Object> create(String bidCaseId, List<String> empNos, SysUser me, Actor actor) {
        if (!LEAD_ROLE.equals(roleOf(me))) {
            throw new ApiException(403, "최초 배정은 영업팀장만 할 수 있습니다.");
        }
        List<String> targets = validateTargets(empNos);
        requireBidCase(bidCaseId);
        if (mapper.selectCase(bidCaseId) != null) {
            throw alreadyAssigned();
        }
        String now = Times.nowIso();
        try {
            mapper.insertCase(bidCaseId, me.getEmpNo(), now);
        } catch (DuplicateKeyException e) {   // 동시 최초 배정 — 한쪽만 성공
            throw alreadyAssigned();
        }
        int verified = actor != null && actor.isVerified() ? 1 : 0;
        for (String emp : targets) {
            mapper.insertAssignment(bidCaseId, emp, me.getEmpNo(), now);
            String reason = emp.equals(me.getEmpNo()) ? SELF_REASON : null;
            mapper.insertLog(bidCaseId, ACTION_ASSIGN, emp, null, reason, me.getEmpNo(), verified, now);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bid_case_id", bidCaseId);
        m.put("group_ver", 1);
        m.put("assignees", assigneeMaps(mapper.selectActiveAssignees(bidCaseId)));
        return m;
    }

    /** 배정·변경 이력(오래된 순) — 영업팀 전원. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(String bidCaseId, SysUser me) {
        requireSalesTeam(me);
        requireBidCase(bidCaseId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidAssignLogView l : mapper.selectLog(bidCaseId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("action_cd", l.getActionCd());
            m.put("action_name", l.getActionName());
            m.put("target_emp_no", l.getTargetEmpNo());
            m.put("target_name", l.getTargetName());
            m.put("req_id", l.getReqId());
            m.put("reason", l.getReason());
            m.put("actor_emp_no", l.getActorEmpNo());
            m.put("actor_name", l.getActorName());
            m.put("emp_verified", l.getEmpVerified() == 1);   // false = 자기신고(위조 가능)
            m.put("logged_at", l.getLoggedAt());
            out.add(m);
        }
        return out;
    }

    /** 내가 현재 담당인 입찰 건 — 자기 사번만(파라미터로 남의 사번을 받지 않는다). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> mine(String empNo) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidAssignMine r : mapper.selectMine(empNo)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("bid_case_id", r.getBidCaseId());
            m.put("assigned_at", r.getAssignedAt());
            out.add(m);
        }
        return out;
    }

    // ── 내부 ───────────────────────────────────────────────────────────

    private static String roleOf(SysUser u) {
        return u.getRole() == null ? "" : u.getRole().trim();
    }

    /** 영업팀 전원(영업팀·영업팀장·영업부장). 디자이너·관리자(전산팀 등)는 403. */
    private static void requireSalesTeam(SysUser me) {
        String role = roleOf(me);
        if (!MEMBER_ROLE.equals(role) && !LEAD_ROLE.equals(role) && !HEAD_ROLE.equals(role)) {
            throw new ApiException(403, "이 기능을 쓸 권한이 없습니다.");
        }
    }

    private void requireBidCase(String bidCaseId) {
        if (bidCaseId == null || bidCaseId.isEmpty() || mapper.countBidCase(bidCaseId) == 0) {
            throw ApiException.notFound("bid case not found");   // BidCaseQueryService 와 같은 문구
        }
    }

    /** 사번 형식·중복·인원 수·ACTIVE·역할을 검사한다. 사번 값은 오류 문구에 싣지 않는다. */
    private List<String> validateTargets(List<String> empNos) {
        if (empNos == null || empNos.size() < MIN_ASSIGNEES || empNos.size() > MAX_ASSIGNEES) {
            throw new ApiException(400, "담당자는 " + MIN_ASSIGNEES + "명 이상 " + MAX_ASSIGNEES + "명 이하로 지정하세요.");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : empNos) {
            String e = raw == null ? null : raw.trim();
            if (!MenuPerms.isEmpNo(e)) {
                throw new ApiException(400, "사번(숫자 7자리) 형식이 아닌 값이 있습니다.");
            }
            if (!seen.add(e)) {
                throw new ApiException(400, "같은 사번이 중복되어 있습니다.");
            }
        }
        for (String e : seen) {
            SysUser u = users.selectByEmpNo(e);
            if (u == null || !"ACTIVE".equals(u.getStatus())) {
                throw new ApiException(400, "등록되지 않았거나 사용 중이 아닌 사용자가 있습니다.");
            }
            String role = roleOf(u);
            if (HEAD_ROLE.equals(role)) {
                throw new ApiException(400, "영업부장은 담당자로 지정할 수 없습니다.");
            }
            if (!MEMBER_ROLE.equals(role) && !LEAD_ROLE.equals(role)) {
                throw new ApiException(400, "담당자는 영업팀·영업팀장 사용자만 지정할 수 있습니다.");
            }
        }
        return new ArrayList<>(seen);
    }

    private static ApiException alreadyAssigned() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("code", "ASSIGNED_ALREADY");
        d.put("message", "이미 담당자가 배정된 입찰 건입니다. 변경은 담당자 변경 신청으로 하세요.");
        return ApiException.withDetail(409, d);
    }

    private static List<Map<String, Object>> assigneeMaps(List<BidAssigneeView> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BidAssigneeView r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("emp_no", r.getEmpNo());
            m.put("name", r.getName());
            m.put("position_title", r.getPositionTitle());
            m.put("assigned_at", r.getAssignedAt());
            out.add(m);
        }
        return out;
    }
}
