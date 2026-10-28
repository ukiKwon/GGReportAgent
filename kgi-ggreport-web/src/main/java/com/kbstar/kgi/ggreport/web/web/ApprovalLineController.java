package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.ApprovalIn;
import com.kbstar.kgi.ggreport.web.service.ApprovalDeputyService;
import com.kbstar.kgi.ggreport.web.service.ApprovalRequestService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 결재라인 — 결재 요청(상신·결재·취소)과 대결 지정. 기존 {@code /approvals}(제안서 작업물 결재)와는 별개다.
 * 호출자 확인은 서비스({@code CallerService})가 한다 — 등록된 활성 사용자여야 한다.
 */
@RestController
public class ApprovalLineController {

    private final ApprovalRequestService requests;
    private final ApprovalDeputyService deputies;

    public ApprovalLineController(ApprovalRequestService requests, ApprovalDeputyService deputies) {
        this.requests = requests;
        this.deputies = deputies;
    }

    @GetMapping("/approval-requests/types")
    public Map<String, Object> types() {
        return Collections.<String, Object>singletonMap("types", requests.types());
    }

    @GetMapping("/approval-requests")
    public Map<String, Object> list(@RequestParam(name = "box", defaultValue = "mine") String box,
                                    HttpServletRequest req) {
        return Collections.<String, Object>singletonMap("items", requests.list(box, Actor.of(req)));
    }

    @PostMapping("/approval-requests/perm")
    public Map<String, Object> submitPerm(@RequestBody ApprovalIn.PermRequest in, HttpServletRequest req) {
        return requests.submitPerm(in, Actor.of(req));
    }

    @PostMapping("/approval-requests/{id}/decide")
    public Map<String, Object> decide(@PathVariable("id") Long id, @RequestBody ApprovalIn.Decision in,
                                      HttpServletRequest req) {
        return requests.decide(id, in, Actor.of(req));
    }

    @PostMapping("/approval-requests/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable("id") Long id, HttpServletRequest req) {
        return requests.cancel(id, Actor.of(req));
    }

    @GetMapping("/approval-deputies")
    public Map<String, Object> deputyList(@RequestParam(name = "all", defaultValue = "false") boolean all,
                                          HttpServletRequest req) {
        List<Map<String, Object>> items = deputies.list(Actor.of(req), all);
        return Collections.<String, Object>singletonMap("items", items);
    }

    @GetMapping("/approval-deputies/candidates")
    public Map<String, Object> deputyCandidates(HttpServletRequest req) {
        return Collections.<String, Object>singletonMap("users", deputies.candidates(Actor.of(req)));
    }

    @PostMapping("/approval-deputies")
    public Map<String, Object> deputyCreate(@RequestBody ApprovalIn.DeputyForm in, HttpServletRequest req) {
        return deputies.create(in, Actor.of(req));
    }

    @DeleteMapping("/approval-deputies/{id}")
    public Map<String, Object> deputyCancel(@PathVariable("id") Long id, HttpServletRequest req) {
        deputies.cancel(id, Actor.of(req));
        return Collections.<String, Object>singletonMap("cancelled", true);
    }
}
