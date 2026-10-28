package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.support.MenuPerms;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사번 로그인 확인.
 *
 * <p>⚠️ <b>비밀번호가 없다(프로토타입).</b> 사번이 등록돼 있고 활성이면 통과한다 — 이건 인증이 아니라
 * "어느 등록 사용자로 들어왔는지 기록하는 입구"다. SSO/앞단 인증을 붙이기 전까지 보안 경계가 아니다.
 * 그래서 로그인 실패 횟수 잠금도 아직 의미가 없다(맞춰 볼 비밀이 없다) — {@code FAILED_LOGINS} 열은
 * 비밀번호가 생길 때를 위해 비워 둔다.
 *
 * <p>실패는 모두 접근 이력에 남긴다. 알 수 없는 사번은 응답으로 "있는 사번인지" 알려 주지 않는다
 * (퇴직·미등록 모두 같은 401). 잠긴 계정만 403 으로 구분해 안내한다.
 */
@Service
public class AuthService {

    private final SysUserMapper users;
    private final AccessLogService accessLog;

    public AuthService(SysUserMapper users, AccessLogService accessLog) {
        this.users = users;
        this.accessLog = accessLog;
    }

    @Transactional
    public SysUser login(String empNoRaw, String ip, String userAgent) {
        String empNo = empNoRaw == null ? null : empNoRaw.trim();
        boolean wellFormed = MenuPerms.isEmpNo(empNo);
        Actor claimed = Actor.claimed(empNo);
        SysUser u = wellFormed ? users.selectByEmpNo(empNo) : null;
        if (u == null || "RETIRED".equals(u.getStatus())) {
            accessLog.record(claimed, "LOGIN_FAIL", "POST", "/auth/login", 401, ip, userAgent, null,
                    !wellFormed ? "bad format" : (u == null ? "unknown employee" : "retired"));
            throw new ApiException(401, "사번을 확인해 주세요.");
        }
        if ("LOCKED".equals(u.getStatus())) {
            accessLog.record(claimed, "LOGIN_FAIL", "POST", "/auth/login", 403, ip, userAgent, null, "locked");
            throw new ApiException(403, "잠긴 계정입니다. 시스템 관리자에게 문의하세요.");
        }
        users.recordLoginOk(empNo, Times.nowIso());
        accessLog.record(claimed, "LOGIN_OK", "POST", "/auth/login", 200, ip, userAgent, null, null);
        return users.selectByEmpNo(empNo);
    }
}
