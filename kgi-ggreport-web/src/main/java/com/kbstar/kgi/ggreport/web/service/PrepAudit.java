package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사전준비 행위 감사(BID_PREP_ACT, 024) — 누가·어느 화면·어느 버튼·언제·어느 건. 상세 열람(VIEW)·거부(DENIED)·은닉(HIDDEN)·충돌(BLOCKED)·
 * 입력 오류(INVALID)도 남긴다. 컨트롤러에는 트랜잭션이 없으므로 이 기록은 서비스 실패와 무관하게 따로 커밋된다.
 * 성공한 읽기는 응답 전에 기록한다(실패하면 500, 데이터 안 나감). 본문·값·사유·파일명은 기록하지 않는다.
 * ⚠️ 사번·화면·버튼은 모두 클라이언트 자기신고다.
 */
@Service
public class PrepAudit {

    private final PrepMapper mapper;

    public PrepAudit(PrepMapper mapper) {
        this.mapper = mapper;
    }

    /** outcome: OK / DENIED / HIDDEN / BLOCKED / INVALID / ERROR. stateCd 는 행위 직전 건 상태(건이 없으면 NONE). */
    @Transactional
    public void record(String bidCaseId, String action, String outcome, String stateCd, String taskCd,
                       Actor actor, BoardUiIds.Ui ui) {
        record(bidCaseId, action, outcome, stateCd, taskCd, null, actor, ui);
    }

    /** 첨부 행위(올리기·목록·내려받기·무효 처리·확정본 지정)는 첨부 번호도 남긴다(파일명은 남기지 않는다). attachId 는 형식이 맞는 숫자일 때만 넘긴다. */
    @Transactional
    public void record(String bidCaseId, String action, String outcome, String stateCd, String taskCd,
                       Long attachId, Actor actor, BoardUiIds.Ui ui) {
        String bid = bidCaseId == null ? "" : bidCaseId;
        if (bid.length() > 64) {
            bid = bid.substring(0, 64);
        }
        mapper.insertAct(bid, action, outcome, stateCd == null ? "NONE" : stateCd, taskCd, attachId,
                actor != null && actor.isKnown() ? actor.getEmpNo() : null,
                actor != null && actor.isVerified() ? 1 : 0,
                ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, Times.nowIso());
    }

    /** HTTP 상태 → 결과 코드. */
    public static String outcomeOf(int status) {
        if (status == 401 || status == 403) {
            return "DENIED";
        }
        if (status == 404) {
            return "HIDDEN";
        }
        if (status == 409) {
            return "BLOCKED";
        }
        if (status == 400 || status == 422) {
            return "INVALID";
        }
        return "ERROR";
    }
}
