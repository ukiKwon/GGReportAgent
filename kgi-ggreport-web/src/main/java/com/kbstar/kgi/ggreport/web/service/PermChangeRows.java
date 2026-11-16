package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.PermChange;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.web.Actor;

/** PERM_CHANGE_LOG 1행 — 누가(사번·검증 여부)·어느 화면·어느 버튼(2026-11-16 사용자: 관리자 행위도 다른 사용자처럼 증적). */
final class PermChangeRows {

    private PermChangeRows() {
    }

    static PermChange of(Actor actor, BoardUiIds.Ui ui, String targetEmpNo, String item,
                         String before, String after, String now) {
        BoardUiIds.Ui u = ui == null ? BoardUiIds.unknown() : ui;
        PermChange c = new PermChange();
        c.setChangedAt(now);
        c.setActorEmpNo(actor == null ? null : actor.getEmpNo());
        c.setEmpVerified(actor != null && actor.isVerified());
        c.setTargetEmpNo(targetEmpNo);
        c.setItem(item);
        c.setBeforeValue(before);
        c.setAfterValue(after);
        c.setScreenId(u.getScreen());
        c.setButtonId(u.getButton());
        c.setUiValid(u.isValid());
        return c;
    }
}
