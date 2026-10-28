package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.mapper.SysUserMapper;
import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 호출자 확인 — 사번이 있고 등록된 <b>활성</b> 사용자여야 한다. 결재 API 의 공통 문지기다.
 * ⚠️ 사번은 앞단 인증이 없으면 자기신고다(Actor). 이 확인은 "등록된 사람인가"까지다.
 */
@Service
public class CallerService {

    private final SysUserMapper users;

    public CallerService(SysUserMapper users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public SysUser require(Actor actor) {
        if (actor == null || !actor.isKnown()) {
            throw new ApiException(401, "로그인이 필요합니다.");
        }
        SysUser u = users.selectByEmpNo(actor.getEmpNo());
        if (u == null || !"ACTIVE".equals(u.getStatus())) {
            throw new ApiException(403, "사용할 수 없는 계정입니다.");
        }
        return u;
    }
}
