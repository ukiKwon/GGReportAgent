package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.mapper.InstitutionEditLogMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * 기관 편집 이력(INST_EDIT_LOG) 기록기 — 화면 저장·CSV 반입·inbox 반입이 같이 쓴다.
 * 호출하는 쪽의 트랜잭션에 참여한다(값 갱신과 이력이 같은 트랜잭션). 값은 날짜·코드·출처 링크·번호와 사번뿐이다.
 * ⚠️ 사번·화면·버튼은 자기신고다({@code EMP_VERIFIED=0} 이면 '검증됨' 아님).
 */
@Component
class InstitutionEditLogger {

    private final InstitutionEditLogMapper editLog;

    InstitutionEditLogger(InstitutionEditLogMapper editLog) {
        this.editLog = editLog;
    }

    /** 바뀐 칸마다 1행. 한 번의 저장은 같은 BATCH_KEY 로 묶는다. actor 가 null 이면 사번 없음(inbox 배치). */
    void log(String institutionId, List<InstitutionEditRules.Change> changes, Actor actor, BoardUiIds.Ui ui) {
        if (changes.isEmpty()) {
            return;
        }
        String batch = UUID.randomUUID().toString();
        String emp = actor != null && actor.isKnown() ? actor.getEmpNo() : null;
        int verified = actor != null && actor.isVerified() ? 1 : 0;
        String now = Times.nowIso();
        for (InstitutionEditRules.Change c : changes) {
            editLog.insert(batch, institutionId, c.field, c.oldVal, c.newVal, c.srcUrl, c.srcNo, emp, verified,
                    ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, now);
        }
    }
}
