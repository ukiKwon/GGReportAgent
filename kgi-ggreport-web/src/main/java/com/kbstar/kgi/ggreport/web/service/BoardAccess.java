package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이사회 자료 접근 판정(020). 쓰기 = 그 입찰 건의 현재 담당자(배정 ACTIVE_YN=1) ∧ USERS ACTIVE ∧ 영업 계열(영업팀·영업팀장).
 * 열람 = 쓰기 자격자 + 활성 영업부장(모든 상태, 읽기 전용 — 사용자 확정 2026-11-10).
 * 읽기({@link #canReadCase}) = 열람 + 그 건의 자기 팀 영업팀장(사용자 11-27 안 A 확정 — 팀원은 넓히지 않음, 담당이 풀린 끝난 건 포함).
 * 같은 팀 읽기는 읽기 전용이다 — 쓰기·제출·회수·결과는 canWriteCase, 결재는 결재선, AI 초안 자격은 canViewCase 그대로.
 * 관리자·마스터·다른 팀 영업팀장 예외 없음 — 메뉴 권한(CAN_WRITE)은 보지 않는다.
 * 결재선 영업팀장의 결재 중 열람은 이 클래스가 아니라 BoardMaterialService.review 경로(020b)다.
 *
 * <p>⚠️ 호출자 사번은 X-Emp-No 자기신고일 수 있다(Actor). 이 판정은 업무 규칙(실수 방지)이지 사칭 방지가 아니다.
 * 담당이 해제되면 다음 요청부터 바로 false 다.
 */
@Component
public class BoardAccess {

    private final SysUserMapper users;
    private final BidAssignmentService assignments;

    public BoardAccess(SysUserMapper users, BidAssignmentService assignments) {
        this.users = users;
        this.assignments = assignments;
    }

    @Transactional(readOnly = true)
    public boolean canWriteCase(String empNo, String bidCaseId) {
        SysUser u = activeUser(empNo);
        return u != null && isSalesLine(u) && assignments.isActiveAssignee(bidCaseId, empNo);
    }

    /**
     * 열람 = 그 입찰 건의 담당자, 또는 활성 영업부장(읽기 전용, 모든 상태 — 사용자 확정 2026-11-10).
     * 비담당 영업팀장·관리자·디자이너는 불가(같은 팀 팀장의 읽기는 {@link #canReadCase}). 쓰기는 {@link #canWriteCase} 만(부장은 쓰기 불가).
     */
    @Transactional(readOnly = true)
    public boolean canViewCase(String empNo, String bidCaseId) {
        SysUser u = activeUser(empNo);
        if (u == null) {
            return false;
        }
        return isHead(u) || (isSalesLine(u) && assignments.isActiveAssignee(bidCaseId, empNo));
    }

    /**
     * 이사회 자료 읽기(상세·판·이력·목록·회의록의 자료 연결·대본 숫자) = {@link #canViewCase} ∪ 그 건의 자기 팀 영업팀장(사용자 11-27 안 A).
     * 팀 판정 = {@link BidAssignmentService#leadsAssignedTeam}(활성 담당의 팀, 모두 풀렸으면 옛 담당의 팀). 감사 줄(acts)은 넓히지 않는다 — canViewCase.
     */
    @Transactional(readOnly = true)
    public boolean canReadCase(String empNo, String bidCaseId) {
        SysUser u = activeUser(empNo);
        if (u == null) {
            return false;
        }
        if (isHead(u) || (isSalesLine(u) && assignments.isActiveAssignee(bidCaseId, empNo))) {
            return true;
        }
        return isTeamReader(u) && assignments.leadsAssignedTeam(u, bidCaseId);
    }

    /** 같은 팀 읽기 자격 — 안 A: 영업팀장만(사용자 11-27 확정). */
    static boolean isTeamReader(SysUser u) {
        return BidAssignmentService.LEAD_ROLE.equals(role(u));
    }

    /** 이사회 자료 목록의 같은 팀 읽기 대상인가(활성 영업팀장) — 목록은 넓게 가져와 행마다 canReadCase 로 거른다. */
    @Transactional(readOnly = true)
    public boolean isTeamReaderUser(String empNo) {
        SysUser u = activeUser(empNo);
        return u != null && isTeamReader(u);
    }

    /** 그 건의 자기 팀 영업팀장인가(회의록 기본 열람 — BoardMinutesAccess 가 쓴다). */
    public boolean leadsAssignedTeam(SysUser u, String bidCaseId) {
        return u != null && assignments.leadsAssignedTeam(u, bidCaseId);
    }

    /** 목록 SQL 용 팀 사번 — 같은 팀 읽기 자격이 아니거나 팀을 못 정하면 null(내 담당만). */
    @Transactional(readOnly = true)
    public java.util.Set<String> listTeam(String empNo) {
        SysUser u = activeUser(empNo);
        return u == null || !isTeamReader(u) ? null : assignments.salesTeamEmpNos(u);
    }

    /** 목록이 전체를 보여도 되는 사람 = 활성 영업부장(읽기 전용). */
    @Transactional(readOnly = true)
    public boolean isViewAll(String empNo) {
        SysUser u = activeUser(empNo);
        return u != null && isHead(u);
    }

    /** 목록을 조회할 수 있는 사람(활성 영업 계열). 아니면 SQL 을 부르지 않고 빈 목록을 돌려준다(security P6). */
    @Transactional(readOnly = true)
    public boolean isSalesWriter(String empNo) {
        SysUser u = activeUser(empNo);
        return u != null && isSalesLine(u);
    }

    /** 화면 '이 양식으로 작성' 버튼 표시용 — 쓸 수 있는 입찰 건이 하나라도 있는가. */
    @Transactional(readOnly = true)
    public boolean hasAnyWriteCase(String empNo) {
        return isSalesWriter(empNo) && !assignments.mine(empNo).isEmpty();
    }

    SysUser activeUser(String empNo) {
        if (!MenuPerms.isEmpNo(empNo)) {
            return null;
        }
        SysUser u = users.selectByEmpNo(empNo);
        return u != null && "ACTIVE".equals(u.getStatus()) ? u : null;
    }

    static String role(SysUser u) {
        return u.getRole() == null ? "" : u.getRole().trim();
    }

    static boolean isSalesLine(SysUser u) {
        return BidAssignmentService.MEMBER_ROLE.equals(role(u)) || BidAssignmentService.LEAD_ROLE.equals(role(u));
    }

    static boolean isHead(SysUser u) {
        return BidAssignmentService.HEAD_ROLE.equals(role(u));
    }
}
