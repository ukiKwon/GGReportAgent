package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.mapper.PrepMapper;
import com.kbstar.kgi.ggreport.web.support.ApprovalTypes;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 사전준비 행위 감사(BID_PREP_ACT, 024) — 누가·어느 화면·어느 버튼·언제·어느 건. 상세 열람(VIEW)·거부(DENIED)·은닉(HIDDEN)·충돌(BLOCKED)·
 * 입력 오류(INVALID)도 남긴다. 컨트롤러에는 트랜잭션이 없으므로 컨트롤러가 부른 기록은 서비스 실패와 무관하게 따로 커밋된다.
 * 예외: 개설·기획승인 결재(BID_OPEN·PREP_APPROVAL)의 회수·승인·반려 성공 줄은 ApprovalRequestService 가 결재와 <b>같은 트랜잭션</b>에서 쓴다
 * (결재가 되돌아가면 감사 줄도 함께 되돌아간다). 그 실패 시도는 ApprovalLineController 가 따로 커밋해 남긴다.
 * 성공한 읽기는 응답 전에 기록한다(실패하면 500, 데이터 안 나감). 본문·값·사유·파일명은 기록하지 않는다.
 * 성공 줄 기록이 실패하면 호출한 쪽(컨트롤러·결재 서비스)이 ERROR 한 줄(action·건 번호·예외 종류만)을 남기고 예외를 다시 던진다(500, NEXT 70).
 * 컨트롤러 쓰기(확정·과제·업로드)는 저장 뒤 500이 날 수 있어 그 ERROR 줄로 맞춰 본다.
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
        insert(bidCaseId, action, outcome, stateCd, taskCd, attachId, actor, ui, Times.nowIso());
    }

    /**
     * 대시보드 목록 열람(NEXT 102, planner 11-23 P3-3) — 요약 한 줄(건 NONE·상태 NONE, action) + 표에 실린 결재 끝난 건마다 한 줄
     * (rows: {건 번호, 상태}, rowAction). 한 트랜잭션·같은 LOGGED_AT 으로 써서 한 번의 열람으로 묶어 본다. 하나라도 실패하면 모두 되돌아가고
     * 호출한 쪽이 500 을 낸다(데이터 안 나감). 이름·칸 값은 쓰지 않는다.
     */
    @Transactional
    public void recordList(String action, String rowAction, List<String[]> rows, String summaryTaskCd, Actor actor, BoardUiIds.Ui ui) {
        String at = Times.nowIso();
        insert("NONE", action, "OK", "NONE", summaryTaskCd, null, actor, ui, at);   // 요약 줄 TASK_CD = 조회 범위(SCOPE_*), 건 줄은 NULL 그대로
        for (String[] r : rows) {
            insert(r[0], rowAction, "OK", r[1], null, null, actor, ui, at);
        }
    }

    private void insert(String bidCaseId, String action, String outcome, String stateCd, String taskCd,
                        Long attachId, Actor actor, BoardUiIds.Ui ui, String at) {
        String bid = bidCaseId == null ? "" : bidCaseId;
        if (bid.length() > 64) {
            bid = bid.substring(0, 64);
        }
        mapper.insertAct(bid, action, outcome, stateCd == null ? "NONE" : stateCd, taskCd, attachId,
                actor != null && actor.isKnown() ? actor.getEmpNo() : null,
                actor != null && actor.isVerified() ? 1 : 0,
                ui.getScreen(), ui.getButton(), ui.isValid() ? 1 : 0, at);
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

    /** 사전준비 결재의 행위 코드 — BID_OPEN → OPEN_{verb}, PREP_APPROVAL → PLAN_{verb}. 다른 유형이면 null. verb: WITHDRAW·APPROVE·REJECT·DECIDE. */
    public static String approvalAction(String reqType, String verb) {
        if (ApprovalTypes.BID_OPEN.equals(reqType)) {
            return "OPEN_" + verb;
        }
        if (ApprovalTypes.PREP_APPROVAL.equals(reqType)) {
            return "PLAN_" + verb;
        }
        return null;
    }

    /** 결재 본문의 decision → 행위 동사. APPROVE·REJECT 밖의 값(400 이 될 값)은 DECIDE — 본문 원문은 저장하지 않는다. */
    public static String decideVerb(String decision) {
        return "APPROVE".equals(decision) ? "APPROVE" : "REJECT".equals(decision) ? "REJECT" : "DECIDE";
    }
}
