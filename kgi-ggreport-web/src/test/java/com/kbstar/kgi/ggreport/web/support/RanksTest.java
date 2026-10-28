package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 직급 체계와 결재 방향 규칙. */
public class RanksTest {

    private static SysUser u(String emp, String position, String role, String grade) {
        SysUser s = new SysUser();
        s.setEmpNo(emp);
        s.setPositionTitle(position);
        s.setRole(role);
        s.setApprovalGrade(grade);
        s.setStatus("ACTIVE");
        return s;
    }

    @Test
    public void 직급_순서는_회사_체계를_따른다() {
        assertEquals("[계장, 대리, 과장, 차장, 수석차장, 팀장, 부장, 대표]", Ranks.LIST.toString());
        assertEquals(1, Ranks.ofPosition("계장"));
        assertEquals(8, Ranks.ofPosition("대표"));
        assertEquals(0, Ranks.ofPosition("사원"));
        assertEquals(0, Ranks.ofPosition(null));
    }

    @Test
    public void 직위를_모르면_결재_등급과_역할로_추정한다() {
        assertEquals(1, Ranks.of(u("1", null, "영업팀", "NONE")));
        assertEquals(6, Ranks.of(u("1", "사원", "영업팀장", "TEAM_LEAD")));
        assertEquals(7, Ranks.of(u("1", null, "영업부장", "DEPT_HEAD")));
        assertEquals(8, Ranks.of(u("1", null, "영업부장", "EXECUTIVE")));
        // 직위가 과장이어도 팀장 역할이면 팀장급으로 본다
        assertEquals(6, Ranks.of(u("1", "과장", "영업팀장", "TEAM_LEAD")));
        assertEquals(3, Ranks.of(u("1", "과장", "영업팀", "NONE")));
    }

    @Test
    public void 상위_직급자의_요청을_하위_직급자가_결재할_수는_없다() {
        SysUser daeri = u("1", "대리", "영업팀", "NONE");
        SysUser gwajang = u("2", "과장", "영업팀", "NONE");
        SysUser teamLead = u("3", "팀장", "영업팀장", "TEAM_LEAD");
        SysUser teamLead2 = u("4", "팀장", "전산팀장", "TEAM_LEAD");
        SysUser head = u("5", "부장", "영업부장", "DEPT_HEAD");
        assertTrue(Ranks.mayDecide(daeri, gwajang));          // 위로 올리는 것
        assertTrue(Ranks.mayDecide(daeri, teamLead));
        assertTrue(Ranks.mayDecide(teamLead, head));
        assertFalse(Ranks.mayDecide(teamLead, daeri));        // 상위가 하위에게 올리는 것
        assertFalse(Ranks.mayDecide(head, teamLead));
        assertTrue(Ranks.mayDecide(teamLead, teamLead2));     // 같은 직급(부장 대결을 다른 팀장이)은 막지 않는다
        assertFalse(Ranks.mayDecide(daeri, daeri));           // 본인
    }
}
