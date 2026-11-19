package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.DesignReviewService;
import com.kbstar.kgi.ggreport.web.service.PrepAudit;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.DesignUiIds;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;

/**
 * 디자인 검토 흐름(051)의 컨트롤러 쪽 문지기 — {@link DesignReviewController}·{@link TaskController} 가 같이 쓴다.
 * 컨트롤러에는 트랜잭션이 없으므로 여기서 남기는 실패 감사(BID_PREP_ACT)는 서비스 실패와 무관하게 따로 커밋된다. 성공 줄(OK)은 서비스가 같은 트랜잭션에서 쓴다.
 * 403 은 접근 이력에 DENIED 로도 남는다(MenuGuard). ⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다.
 */
@Component
public class DesignGate {

    /** 서비스 호출 본문 — 호출자(USERS 행)·자기신고 신원·화면/버튼 식별자를 받는다. */
    public interface Body<T> {
        T apply(SysUser me, Actor actor, BoardUiIds.Ui ui);
    }

    private final MenuGuard guard;
    private final DesignReviewService design;

    public DesignGate(MenuGuard guard, DesignReviewService design) {
        this.guard = guard;
        this.design = design;
    }

    /**
     * 등록된 활성 사용자만(401·403 은 DENIED) → 본문 실행 → 실패는 BID_PREP_ACT 에 결과 코드(DENIED·HIDDEN·BLOCKED·INVALID·ERROR)로.
     * taskId 는 형식이 맞는 값만 넘긴다(감사 칸에 자유 문구를 넣지 않는다). 사번이 없는 401 은 접근 이력에만 남는다.
     */
    public <T> T run(HttpServletRequest req, String action, String taskId, String bidHint, Body<T> body) {
        Actor actor = Actor.of(req);
        BoardUiIds.Ui ui = DesignUiIds.of(req);
        SysUser me;
        try {
            me = guard.requireActiveUser(req);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                design.auditFailure(actor, ui, action, "DENIED", taskId, bidHint);
            }
            throw e;
        }
        try {
            return body.apply(me, actor, ui);
        } catch (ApiException e) {
            if (e.getStatus() != 401) {
                design.auditFailure(actor, ui, action, PrepAudit.outcomeOf(e.getStatus()), taskId, bidHint);
            }
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        } catch (RuntimeException e) {
            design.auditFailure(actor, ui, action, "ERROR", taskId, bidHint);
            throw e;
        }
    }

    /**
     * 디자이너 작업의 쓰기(임시저장·파일 올리기·지우기) 문지기(security M2). 디자이너 작업이 아니면 null(세 팀 경로는 그대로).
     * 디자이너 작업이면 등록된 활성 사용자(401·403 DENIED) + 디자이너 역할 + 담당 본인(미배정이면 선점)만 통과시키고,
     * 담당 비교·선점에 쓸 서버 결정 문자열을 돌려준다(클라이언트가 보낸 by 는 쓰지 않는다). 담당 이름이 ACTIVE 디자이너 중 유일할 때만 본인으로 본다(M5).
     */
    public String designerWriteActor(HttpServletRequest req, String taskId) {
        if (!design.isDesignerTask(taskId)) {
            return null;
        }
        SysUser me = guard.requireActiveUser(req);
        try {
            return design.requireDesignerOwnerOf(me, taskId);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        }
    }

    /** 결재 실패를 디자이너 작업이면 DSN_* 로 남긴다(세 팀 작업은 S6-c). 403 은 던지는 쪽이 DENIED 로 남긴다. */
    public void auditApproveFailure(HttpServletRequest req, String taskId, boolean approved, ApiException e) {
        if (e.getStatus() == 401) {
            return;
        }
        String action = design.approveAction(taskId, approved);
        if (action != null) {
            design.auditFailure(Actor.of(req), DesignUiIds.of(req), action, PrepAudit.outcomeOf(e.getStatus()), taskId, null);
        }
    }

    /** 경로의 작업·건 번호가 형식([A-Za-z0-9._-]{1,64})이면 그 값, 아니면 null — 감사 칸용. */
    public static String key(String v) {
        String t = v == null ? "" : v.trim();
        return t.matches("[A-Za-z0-9._-]{1,64}") ? t : null;
    }
}
