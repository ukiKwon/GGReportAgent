package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.web.Actor;
import com.kbstar.kgi.ggreport.web.web.ApiException;

/**
 * 관리자(서비스 운영 담당자)는 자기 자신의 정보·상태·결재자·권한을 바꾸지 않는다 — 다른 관리자가 바꾼다(2026-11-16 사용자 결정 ⓑ).
 * 관리자가 한 명뿐이어도 예외 없음: 먼저 다른 사용자에게 권한관리를 주고 그 사람이 바꾼다.
 * ⚠️ actor 는 X-Emp-No 자기신고일 수 있다 — 다른 관리자 사번을 사칭하면 통과한다(실수·혼자 처리 방지이지 사칭 방지가 아니다).
 */
final class SelfChange {

    private SelfChange() {
    }

    static void refuse(Actor actor, String targetEmpNo, String message) {
        if (actor != null && actor.isKnown() && actor.getEmpNo().equals(targetEmpNo)) {
            throw new ApiException(400, message);
        }
    }
}
