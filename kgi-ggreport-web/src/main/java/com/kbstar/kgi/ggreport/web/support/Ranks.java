package com.kbstar.kgi.ggreport.web.support;

import com.kbstar.kgi.ggreport.web.domain.SysUser;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 회사 직급 체계와 <b>결재 방향 규칙</b>.
 *
 * <p>직급(낮은 쪽부터): 계장 &lt; 대리 &lt; 과장 &lt; 차장 &lt; 수석차장 &lt; 팀장 &lt; 부장 &lt; 대표.
 * 팀장 아래는 모두 '팀원'급이다. 직위가 목록에 없거나 비어 있으면 결재 등급·역할로 추정한다
 * ({@link ApproverRules#levelByGradeRole}).
 *
 * <p>규칙은 <b>하나만 고정</b>한다 — 상신자의 직급이 처리자(결재자·대결자)보다 높으면 결재할 수 없다
 * (상위 직급자가 하위 직급자에게 결재를 올리는 결과가 되기 때문). 같은 직급끼리는 가능하다(예: 부장 대신
 * 다른 팀장이 대결). 그 밖의 대결자 자격은 업무에 맡긴다.
 */
public final class Ranks {

    private Ranks() {
    }

    public static final List<String> LIST = Collections.unmodifiableList(
            Arrays.asList("계장", "대리", "과장", "차장", "수석차장", "팀장", "부장", "대표"));

    /** 대결자로 "보통" 기대하는 최소 직급(과장). 강제하지 않고 화면에 알리기만 한다. */
    public static final int USUAL_DEPUTY_MIN = 3;

    /** 직급상 결재 자격이 생기는 최소 직급(팀장) — {@link #LIST} 에서 도출한다. */
    public static final int APPROVER_MIN = LIST.indexOf("팀장") + 1;

    /** 직위 문자열의 직급(1~8). 목록에 없으면 0. */
    public static int ofPosition(String position) {
        int i = position == null ? -1 : LIST.indexOf(position.trim());
        return i + 1;
    }

    public static int of(SysUser u) {
        int fromLevel = new int[]{1, 6, 7, 8}[ApproverRules.levelByGradeRole(u)];
        return Math.max(ofPosition(u.getPositionTitle()), fromLevel);
    }

    /** 직급상 팀장 이상인가(결재 자격). 메뉴 권한과는 별개 값이다. */
    public static boolean isApproverRank(SysUser u) {
        return of(u) >= APPROVER_MIN;
    }

    /** {@code processor} 가 {@code requester} 의 요청을 결재(또는 대결)할 수 있는 방향인가. */
    public static boolean mayDecide(SysUser requester, SysUser processor) {
        return !requester.getEmpNo().equals(processor.getEmpNo()) && of(processor) >= of(requester);
    }
}
