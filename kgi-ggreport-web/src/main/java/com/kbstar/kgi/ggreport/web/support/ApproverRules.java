package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.domain.SysUser;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 상위 결재자 **자동 결정** 규칙과 검증. DB 를 모른다 — 사용자 목록만 받는 순수 규칙이다.
 *
 * <p>직급 단계({@link #level}): 팀원 0 → 팀장급 1 → 부장급 2 → 대표급 3. 한 단계 위의
 * <b>활성</b> 사용자가 결재자다. 팀원은 <b>같은 팀</b>의 팀장급만(디자이너는 영업팀 소속).
 *
 * <p>⚠️ <b>후보가 정확히 한 명일 때만</b> 정한다. 0명이면 {@code NONE}, 2명 이상이면
 * {@code AMBIGUOUS} 로 비워 둔다 — 추측해서 엉뚱한 사람에게 결재가 가는 것보다, 관리자가 지정하게
 * 하는 편이 낫다.
 */
public final class ApproverRules {

    private ApproverRules() {
    }

    public enum State { OK, TOP, NONE, AMBIGUOUS }

    public static final class Result {
        private final State state;
        private final String empNo;
        private final List<String> candidates;

        Result(State state, String empNo, List<String> candidates) {
            this.state = state;
            this.empNo = empNo;
            this.candidates = candidates;
        }

        public State getState() { return state; }
        /** {@code OK} 일 때만 값이 있다. */
        public String getEmpNo() { return empNo; }
        public List<String> getCandidates() { return candidates; }
    }

    /**
     * 대표급 3, 부장급 2, 팀장급 1, 그 밖 0. **직위와 결재 등급·역할 중 더 높은 쪽**을 따른다 — 직위가 과장이어도
     * 역할이 팀장(결재 등급 팀장급)이면 팀장급으로 본다.
     */
    public static int level(SysUser u) {
        int pos = Ranks.ofPosition(u.getPositionTitle());
        int byPosition = pos >= 8 ? 3 : pos == 7 ? 2 : pos == 6 ? 1 : 0;
        return Math.max(byPosition, levelByGradeRole(u));
    }

    /** 결재 등급·역할만으로 본 단계(직위를 모를 때의 근거). */
    public static int levelByGradeRole(SysUser u) {
        String g = u.getApprovalGrade();
        if ("EXECUTIVE".equals(g)) {
            return 3;
        }
        if ("DEPT_HEAD".equals(g) || Teams.FINAL_APPROVER.equals(u.getRole())) {
            return 2;
        }
        if ("TEAM_LEAD".equals(g) || Teams.LEAD_ROLES.contains(u.getRole())) {
            return 1;
        }
        return 0;
    }

    /** 소속 팀. 디자이너는 영업팀 소속이다({@link Teams#DESIGNER_HOME_TEAM}). */
    public static String team(SysUser u) {
        if (Teams.DESIGNER_TEAM.equals(u.getRole())) {
            return Teams.DESIGNER_HOME_TEAM;
        }
        return Teams.teamOf(u.getRole());
    }

    public static boolean active(SysUser u) {
        return "ACTIVE".equals(u.getStatus());
    }

    public static Result resolve(SysUser user, Collection<SysUser> all) {
        int lv = level(user);
        if (lv >= 3) {
            return new Result(State.TOP, null, new ArrayList<String>());
        }
        List<String> found = new ArrayList<>();
        for (SysUser c : all) {
            if (c.getEmpNo().equals(user.getEmpNo()) || !active(c) || level(c) != lv + 1) {
                continue;
            }
            if (lv == 0 && !team(c).equals(team(user))) {
                continue;
            }
            found.add(c.getEmpNo());
        }
        if (found.size() == 1) {
            return new Result(State.OK, found.get(0), found);
        }
        return new Result(found.isEmpty() ? State.NONE : State.AMBIGUOUS, null, found);
    }

    /**
     * {@code empNo} 의 결재자를 {@code approverEmpNo} 로 바꾸면 고리가 생기는가 — 결재자 쪽에서
     * 위로 올라가다 {@code empNo} 를 만나면 고리다. 이미 있는 고리에 갇히지 않게 방문 기록을 둔다.
     */
    public static boolean wouldCycle(String empNo, String approverEmpNo, Map<String, SysUser> byEmp) {
        Set<String> seen = new HashSet<>();
        String cur = approverEmpNo;
        while (cur != null && seen.add(cur)) {
            if (cur.equals(empNo)) {
                return true;
            }
            SysUser u = byEmp.get(cur);
            cur = u == null ? null : u.getApproverEmpNo();
        }
        return false;
    }

    /** 결재 체인(본인 제외, 가까운 결재자부터). 고리·끊김에서 멈춘다. */
    public static List<SysUser> chain(SysUser user, Map<String, SysUser> byEmp) {
        List<SysUser> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        seen.add(user.getEmpNo());
        String cur = user.getApproverEmpNo();
        while (cur != null && seen.add(cur) && out.size() < 8) {
            SysUser u = byEmp.get(cur);
            if (u == null) {
                break;
            }
            out.add(u);
            cur = u.getApproverEmpNo();
        }
        return out;
    }
}
