package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BidPrep;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.support.Teams;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

/** 확정 취소·중단 판정 함수 하나(viewer 와 입찰 없음 알림이 같이 쓴다, security 11-19 중-1) — 영업부장·디자이너는 어느 상태에서도 없다. */
public class PrepServiceRulesTest {

    private static final String[] STATES = {PrepService.CONFIRMED, PrepService.OPEN_PENDING, PrepService.IN_PROGRESS,
            PrepService.APPROVAL_PENDING, PrepService.WRITABLE, PrepService.WRITING, PrepService.CANCELLED};

    private static SysUser user(String emp, String role) {
        SysUser u = new SysUser();
        u.setEmpNo(emp);
        u.setRole(role);
        u.setStatus("ACTIVE");
        return u;
    }

    private static BidPrep prep(String state, String confirmer) {
        BidPrep p = new BidPrep();
        p.setBidCaseId("rule-case");
        p.setStateCd(state);
        p.setConfirmedBy(confirmer);
        return p;
    }

    @Test
    public void 영업부장과_디자이너는_자기가_확정했어도_확정취소도_중단도_없다() {
        for (String role : new String[]{BidAssignmentService.HEAD_ROLE, Teams.DESIGNER_TEAM}) {
            SysUser u = user("1000001", role);
            for (String st : STATES) {
                assertFalse(role + "/" + st, PrepService.canUnconfirm(u, prep(st, "1000001")));
                assertFalse(role + "/" + st, PrepService.canCancel(u, prep(st, "1000001")));
            }
            assertFalse(PrepService.hasUnconfirmAuthority(u, prep(PrepService.CONFIRMED, "1000001")));
            assertFalse(PrepService.hasCancelAuthority(u));
        }
    }

    @Test
    public void 확정취소는_CONFIRMED에서_확정한_영업팀이나_영업팀장만() {
        SysUser member = user("1000002", BidAssignmentService.MEMBER_ROLE);
        SysUser lead = user("1000003", BidAssignmentService.LEAD_ROLE);
        for (String st : STATES) {
            boolean confirmed = PrepService.CONFIRMED.equals(st);
            assertEquals(st, confirmed, PrepService.canUnconfirm(member, prep(st, "1000002")));
            assertFalse(st, PrepService.canUnconfirm(member, prep(st, "9999999")));
            assertEquals(st, confirmed, PrepService.canUnconfirm(lead, prep(st, "9999999")));
        }
    }

    @Test
    public void 중단은_개설_뒤_세_상태에서_영업팀장만() {
        SysUser member = user("1000002", BidAssignmentService.MEMBER_ROLE);
        SysUser lead = user("1000003", BidAssignmentService.LEAD_ROLE);
        for (String st : STATES) {
            boolean open = PrepService.IN_PROGRESS.equals(st) || PrepService.WRITABLE.equals(st) || PrepService.WRITING.equals(st);
            assertEquals(st, open, PrepService.canCancel(lead, prep(st, "1000002")));
            assertFalse(st, PrepService.canCancel(member, prep(st, "1000002")));
        }
    }
}
