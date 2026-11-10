package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.domain.BoardMaterial;
import com.kbstar.kgi.ggreport.web.domain.BoardMaterialAct;
import com.kbstar.kgi.ggreport.web.mapper.BoardMaterialMapper;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.Times;
import com.kbstar.kgi.ggreport.web.web.Actor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 확정(CONFIRMED)된 이사회 자료에 대한 모든 행위의 감사 기록(사용자 지시 2026-11-10 "잊지마"): 누가·어느 화면·어느 버튼·언제·어느 자료.
 * 읽기·거부(403)·은닉(404)·충돌(409)·입력 오류(400)도 모두 남긴다 — 확정 자료를 들여다보려는 시도까지 기록하기 위해서다.
 *
 * <p>컨트롤러가 서비스 호출 <b>전에</b> {@link #before} 로 자료의 확정 여부와 상태를 잡고(재작성 요구처럼 호출이 상태를 바꾸는 경우를 위해),
 * 호출이 끝난 뒤 {@link #record} 한다. 컨트롤러에는 트랜잭션이 없으므로 이 기록은 서비스 실패와 무관하게 따로 커밋된다.
 * 성공한 읽기는 응답을 돌려주기 <b>전에</b> 기록한다 — 기록이 실패하면 500 이고 데이터는 나가지 않는다(fail-closed).
 * 쓰기는 이미 커밋된 뒤라 기록 실패가 쓰기를 되돌리지 못한다(서버 로그에는 값 없이 남긴다) — §5 위험 참고.
 * ⚠️ 사번·화면·버튼은 모두 클라이언트 자기신고다. 값·메모·사유·본문은 기록하지 않는다.
 */
@Service
public class BoardMaterialAudit {

    private final BoardMaterialMapper mapper;

    public BoardMaterialAudit(BoardMaterialMapper mapper) {
        this.mapper = mapper;
    }

    /** 행위 직전의 자료 상태 — 확정 자료가 아니면(또는 없으면) null. */
    public static final class Ctx {
        private final Long materialId;
        private final String bidCaseId;
        private final String resultCd;
        private final Integer snapNo;

        Ctx(Long materialId, String bidCaseId, String resultCd, Integer snapNo) {
            this.materialId = materialId;
            this.bidCaseId = bidCaseId;
            this.resultCd = resultCd;
            this.snapNo = snapNo;
        }
    }

    @Transactional(readOnly = true)
    public Ctx before(String id) {
        Long n = BoardMaterialService.parseId(id);
        BoardMaterial m = n == null ? null : mapper.selectOne(n);
        if (m == null || !BoardMaterialService.CONFIRMED.equals(m.getStatusCd())) {
            return null;
        }
        return new Ctx(m.getMaterialId(), m.getBidCaseId(), m.getResultCd(), m.getConfirmedSnap());
    }

    /** ctx 가 null 이면 아무것도 하지 않는다. outcome: OK/DENIED/HIDDEN/BLOCKED/INVALID/ERROR. */
    @Transactional
    public void record(Ctx ctx, String action, String outcome, Actor actor, BoardUiIds.Ui ui) {
        if (ctx == null) {
            return;
        }
        BoardMaterialAct a = new BoardMaterialAct();
        a.setMaterialId(ctx.materialId);
        a.setBidCaseId(ctx.bidCaseId);
        a.setActionCd(action);
        a.setOutcome(outcome);
        a.setStatusCd(BoardMaterialService.CONFIRMED);
        a.setResultCd(ctx.resultCd);
        a.setSnapNo(ctx.snapNo);
        a.setActorEmpNo(actor != null && actor.isKnown() ? actor.getEmpNo() : null);
        a.setEmpVerified(actor != null && actor.isVerified() ? 1 : 0);
        a.setScreenId(ui.getScreen());
        a.setButtonId(ui.getButton());
        a.setUiValid(ui.isValid() ? 1 : 0);
        a.setLoggedAt(Times.nowIso());
        mapper.insertAct(a);
    }
}
