package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.docout.InstSummaryTpl;
import com.kbstar.kgi.ggreport.web.mapper.PrepFormMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사전준비 양식 행위 감사(BID_PREP_ACT, 024 + 049 의 FORM_VER 열) — {@link PrepAudit} 의 FORM_VER 판. 같은 결과 코드(OK·DENIED·HIDDEN·BLOCKED·INVALID·ERROR)를 쓰고
 * TASK_CD 는 'T1' 로 고정한다. 행위 코드는 FORM_VIEW·FORM_HISTORY·FORM_PREFILL·FORM_SAVE·FORM_CONFIRM·FORM_UNCONFIRM·FORM_DOCX·FORM_DRAFT_DOCX(접두어 FORM_ 예약).
 * 쓰기 4종(PREFILL·SAVE·CONFIRM·UNCONFIRM)의 성공 줄은 서비스가 <b>업무와 같은 트랜잭션</b>에서 기록하고(security 11-20 중-1), 컨트롤러는 실패 줄과 읽기·내려받기 줄만 기록한다.
 * 값·사유·이름·파일명은 기록하지 않는다. ⚠️ 사번·화면·버튼은 클라이언트 자기신고다.
 */
@Service
public class PrepFormAudit {

    private final PrepFormMapper mapper;

    public PrepFormAudit(PrepFormMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public void record(String bidCaseId, String action, String outcome, String stateCd, Integer formVer,
                       Actor actor, BoardUiIds.Ui ui) {
        String bid = bidCaseId == null ? "" : bidCaseId;
        if (bid.length() > 64) {
            bid = bid.substring(0, 64);
        }
        mapper.insertFormAct(bid, action, outcome, stateCd == null ? "NONE" : stateCd, InstSummaryTpl.TASK_CD,
                actor != null && actor.isKnown() ? actor.getEmpNo() : null,
                actor != null && actor.isVerified() ? 1 : 0,
                ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, Times.nowIso(), formVer);
    }
}
