package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 상위 결재자 자동 결정·검증 규칙(DB 없이). */
public class ApproverRulesTest {

    private static SysUser u(String emp, String role, String grade, String status) {
        SysUser s = new SysUser();
        s.setEmpNo(emp);
        s.setName("n" + emp);
        s.setRole(role);
        s.setApprovalGrade(grade);
        s.setStatus(status);
        return s;
    }

    private static SysUser u(String emp, String role, String grade) {
        return u(emp, role, grade, "ACTIVE");
    }

    private static Map<String, SysUser> index(SysUser... all) {
        Map<String, SysUser> m = new LinkedHashMap<>();
        for (SysUser s : all) {
            m.put(s.getEmpNo(), s);
        }
        return m;
    }

    @Test
    public void 팀원은_같은_팀의_팀장() {
        SysUser member = u("1000001", "예산팀", "NONE");
        SysUser lead = u("1000002", "예산팀장", "TEAM_LEAD");
        SysUser otherLead = u("1000003", "전산팀장", "TEAM_LEAD");
        ApproverRules.Result r = ApproverRules.resolve(member, Arrays.asList(member, lead, otherLead));
        assertEquals(ApproverRules.State.OK, r.getState());
        assertEquals("1000002", r.getEmpNo());
    }

    @Test
    public void 디자이너는_영업팀장() {
        SysUser designer = u("1000001", "디자이너", "NONE");
        SysUser salesLead = u("1000002", "영업팀장", "TEAM_LEAD");
        SysUser budgetLead = u("1000003", "예산팀장", "TEAM_LEAD");
        assertEquals("1000002",
                ApproverRules.resolve(designer, Arrays.asList(designer, salesLead, budgetLead)).getEmpNo());
    }

    @Test
    public void 후보가_둘이면_추측하지_않는다() {
        SysUser member = u("1000001", "영업팀", "NONE");
        List<SysUser> all = Arrays.asList(member, u("1000002", "영업팀장", "TEAM_LEAD"),
                u("1000003", "영업팀장", "TEAM_LEAD"));
        ApproverRules.Result r = ApproverRules.resolve(member, all);
        assertEquals(ApproverRules.State.AMBIGUOUS, r.getState());
        assertNull(r.getEmpNo());
        assertEquals(2, r.getCandidates().size());
    }

    @Test
    public void 후보가_없으면_NONE이고_잠긴_퇴직한_사람은_후보가_아니다() {
        SysUser member = u("1000001", "예산팀", "NONE");
        List<SysUser> all = Arrays.asList(member, u("1000002", "예산팀장", "TEAM_LEAD", "RETIRED"),
                u("1000003", "예산팀장", "TEAM_LEAD", "LOCKED"));
        assertEquals(ApproverRules.State.NONE, ApproverRules.resolve(member, all).getState());
    }

    @Test
    public void 팀장은_부장_부장은_대표급_대표급은_최상위() {
        SysUser lead = u("1000001", "전산팀장", "TEAM_LEAD");
        SysUser head = u("1000002", "영업부장", "DEPT_HEAD");
        SysUser exec = u("1000003", "영업부장", "EXECUTIVE");
        List<SysUser> all = Arrays.asList(lead, head, exec);
        assertEquals("1000002", ApproverRules.resolve(lead, all).getEmpNo());
        assertEquals("1000003", ApproverRules.resolve(head, all).getEmpNo());
        assertEquals(ApproverRules.State.TOP, ApproverRules.resolve(exec, all).getState());
    }

    @Test
    public void 등급이_비어도_역할로_단계를_안다() {
        assertEquals(1, ApproverRules.level(u("1000001", "영업팀장", "NONE")));
        assertEquals(2, ApproverRules.level(u("1000001", "영업부장", "NONE")));
        assertEquals(0, ApproverRules.level(u("1000001", "영업팀", "NONE")));
    }

    @Test
    public void 순환_판정() {
        SysUser a = u("1000001", "영업팀장", "TEAM_LEAD");
        SysUser b = u("1000002", "영업팀장", "TEAM_LEAD");
        SysUser c = u("1000003", "영업부장", "DEPT_HEAD");
        a.setApproverEmpNo("1000003");
        c.setApproverEmpNo("1000002");
        Map<String, SysUser> by = index(a, b, c);
        assertTrue(ApproverRules.wouldCycle("1000002", "1000001", by));   // b → a → c → b
        assertFalse(ApproverRules.wouldCycle("1000001", "1000002", by));  // a → b (b 위는 없음)
        assertTrue(ApproverRules.wouldCycle("1000001", "1000001", by));
    }

    @Test
    public void 체인은_고리에서_멈춘다() {
        SysUser a = u("1000001", "영업팀", "NONE");
        SysUser b = u("1000002", "영업팀장", "TEAM_LEAD");
        a.setApproverEmpNo("1000002");
        b.setApproverEmpNo("1000001");   // 이미 고리가 있는 잘못된 데이터
        List<SysUser> chain = ApproverRules.chain(a, index(a, b));
        assertEquals(1, chain.size());
        assertEquals("1000002", chain.get(0).getEmpNo());
        assertEquals(new ArrayList<SysUser>(), ApproverRules.chain(u("1000009", "영업팀", "NONE"), index()));
    }
}
