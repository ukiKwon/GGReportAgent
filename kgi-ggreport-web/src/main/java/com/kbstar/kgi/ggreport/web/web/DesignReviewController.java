package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.DesignIn;
import com.kbstar.kgi.ggreport.web.service.DesignReviewService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 디자인 검토 흐름(051, NEXT 100 ⑥) API. 권한·상태 규칙은 {@link DesignReviewService} 에 있다. 오류 본문은 {@code {"detail": {"code","message"}}} 이고
 * 이름·사번·의견 내용을 싣지 않는다. 실패 시도는 {@link DesignGate} 가 BID_PREP_ACT 에 남긴다(DSN_*).
 * 결재(부장께 올림·제출본 확정·돌려보내기)는 기존 {@code POST /tasks/{id}/approve} 를 그대로 쓴다(TaskController).
 * ⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다.
 */
@RestController
public class DesignReviewController {

    private final DesignReviewService design;
    private final DesignGate gate;
    private final MenuGuard guard;

    public DesignReviewController(DesignReviewService design, DesignGate gate, MenuGuard guard) {
        this.design = design;
        this.gate = gate;
        this.guard = guard;
    }

    /** [디자인 작업 시작] 후보 건. 디자이너·영업팀장·영업부장. */
    @GetMapping("/design-tasks/ready")
    public List<Map<String, Object>> ready(HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        try {
            return design.ready(me);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        }
    }

    /** 디자인 작업 자리 열기 — 새로 만들면 201 {@code created:true}, 이미 있으면 200 {@code created:false}. */
    @PostMapping("/bidcases/{bidCaseId}/design-task")
    public ResponseEntity<Map<String, Object>> open(@PathVariable String bidCaseId, HttpServletRequest req) {
        final String bid = DesignGate.key(bidCaseId);
        Map<String, Object> out = gate.run(req, DesignReviewService.A_OPEN, null, bid, (me, actor, ui) -> {
            if (bid == null) {
                throw ApiException.notFound("not found");
            }
            return design.open(me, actor, ui, bid);
        });
        return ResponseEntity.status(Boolean.TRUE.equals(out.get("created")) ? HttpStatus.CREATED : HttpStatus.OK).body(out);
    }

    /** 검토 화면 재료 — 담당 디자이너·받는 사람·영업팀장·영업부장. */
    @GetMapping("/tasks/{taskId}/design-review")
    public Map<String, Object> view(@PathVariable String taskId, HttpServletRequest req) {
        final String id = DesignGate.key(taskId);
        return gate.run(req, DesignReviewService.A_VIEW, id, null, (me, actor, ui) -> design.view(me, actor, ui, requireKey(id)));
    }

    /** [디자인 작업 완료] — 디자이너 본인. */
    @PostMapping("/tasks/{taskId}/design/complete")
    public Map<String, Object> complete(@PathVariable String taskId, HttpServletRequest req) {
        final String id = DesignGate.key(taskId);
        return gate.run(req, DesignReviewService.A_COMPLETE, id, null, (me, actor, ui) -> design.complete(me, actor, ui, requireKey(id)));
    }

    /** [다시 수정] — 디자이너 본인. */
    @PostMapping("/tasks/{taskId}/design/revise")
    public Map<String, Object> revise(@PathVariable String taskId, HttpServletRequest req) {
        final String id = DesignGate.key(taskId);
        return gate.run(req, DesignReviewService.A_REVISE, id, null, (me, actor, ui) -> design.revise(me, actor, ui, requireKey(id)));
    }

    /** 의견 남기기 — 그 회차 받는 사람. 201. */
    @PostMapping("/tasks/{taskId}/design/comments")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> comment(@PathVariable String taskId, @RequestBody(required = false) DesignIn.Comment body,
                                       HttpServletRequest req) {
        final String id = DesignGate.key(taskId);
        return gate.run(req, DesignReviewService.A_COMMENT, id, null, (me, actor, ui) -> design.comment(me, actor, ui, requireKey(id),
                body == null ? null : body.getRoundNo(), body == null ? null : body.getBody()));
    }

    /** 확인함 — 그 회차 받는 사람. 이미 했으면 {@code saved:false}. */
    @PostMapping("/tasks/{taskId}/design/ack")
    public Map<String, Object> ack(@PathVariable String taskId, @RequestBody(required = false) DesignIn.Ack body,
                                   HttpServletRequest req) {
        final String id = DesignGate.key(taskId);
        return gate.run(req, DesignReviewService.A_ACK, id, null, (me, actor, ui) -> design.ack(me, actor, ui, requireKey(id),
                body == null ? null : body.getRoundNo()));
    }

    /** 경로의 작업 번호가 형식 밖이면 없는 작업과 같은 404 다. */
    private static String requireKey(String id) {
        if (id == null) {
            throw ApiException.notFound("task not found");
        }
        return id;
    }
}
