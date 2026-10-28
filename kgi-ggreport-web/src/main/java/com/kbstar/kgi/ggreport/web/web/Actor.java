package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.support.MenuPerms;

import javax.servlet.http.HttpServletRequest;

/**
 * 요청한 사람. <b>검증된 신원이 아니다</b> — 서버에 인증이 없어서(설계상 앞단 인증 몫) 두 가지로 갈린다.
 * <ul>
 *   <li>{@code verified=true}: 앞단(WebSphere·SSO·Basic Auth)이 넘긴 인증 주체({@code getRemoteUser()})가
 *       사번 형식일 때. 서버가 위조할 수 없는 값이다.</li>
 *   <li>{@code verified=false}: 화면이 보낸 {@code X-Emp-No} 헤더. <b>누구나 바꿔 보낼 수 있다.</b>
 *       접근 이력에는 남기되 "자기신고"로 표시하고, 이것만으로 보안 경계를 만들었다고 말하지 않는다.</li>
 * </ul>
 */
public final class Actor {

    public static final String HEADER = "X-Emp-No";

    private final String empNo;
    private final boolean verified;

    private Actor(String empNo, boolean verified) {
        this.empNo = empNo;
        this.verified = verified;
    }

    public static Actor of(HttpServletRequest req) {
        String principal = req.getRemoteUser();
        if (MenuPerms.isEmpNo(principal)) {
            return new Actor(principal, true);
        }
        String claimed = req.getHeader(HEADER);
        if (claimed != null && MenuPerms.isEmpNo(claimed.trim())) {
            return new Actor(claimed.trim(), false);
        }
        return new Actor(null, false);
    }

    public static Actor anonymous() {
        return new Actor(null, false);
    }

    public static Actor claimed(String empNo) {
        return new Actor(MenuPerms.isEmpNo(empNo) ? empNo : null, false);
    }

    public String getEmpNo() { return empNo; }
    public boolean isVerified() { return verified; }
    public boolean isKnown() { return empNo != null; }
}
