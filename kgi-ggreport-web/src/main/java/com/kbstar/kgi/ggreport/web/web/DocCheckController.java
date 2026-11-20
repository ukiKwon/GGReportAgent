package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.DocCheckAckIn;
import com.kbstar.kgi.ggreport.web.service.DocCheckService;
import com.kbstar.kgi.ggreport.web.support.DocCheckUiIds;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 작업함 파일 점검(NEXT 106). 요약·상세(문맥 없음)는 파일 목록과 같은 공개 수준이고 사번·파일 글을 싣지 않는다(S11).
 * 문맥 보기·다시 점검·표시는 등록된 활성 사용자만(401·403 은 접근 이력 DENIED). ⚠️ X-Emp-No 자기신고 — 사칭 방지가 아니다.
 */
@RestController
@RequestMapping("/tasks")
public class DocCheckController {

    private final DocCheckService checks;
    private final MenuGuard guard;
    private final DesignGate gate;

    public DocCheckController(DocCheckService checks, MenuGuard guard, DesignGate gate) {
        this.checks = checks;
        this.guard = guard;
        this.gate = gate;
    }

    @GetMapping("/{taskId}/doc-check")
    public Map<String, Object> summary(@PathVariable String taskId) {
        return checks.summary(taskId);
    }

    @GetMapping("/{taskId}/files/{name}/doc-check")
    public Map<String, Object> detail(@PathVariable String taskId, @PathVariable String name,
                                      @RequestParam(name = "with_context", required = false, defaultValue = "false") boolean withContext,
                                      HttpServletRequest req) {
        if (withContext) {
            guard.requireActiveUser(req);   // S2 — 인증 없이 파일 재추출을 일으키지 못하게
        }
        return checks.detail(taskId, name, withContext);
    }

    @PostMapping("/{taskId}/files/{name}/doc-check")
    public Map<String, Object> recheck(@PathVariable String taskId, @PathVariable String name, HttpServletRequest req) {
        guard.requireActiveUser(req);
        return checks.recheck(taskId, name);
    }

    @PostMapping("/{taskId}/files/{name}/doc-check/ack")
    public Map<String, Object> ack(@PathVariable String taskId, @PathVariable String name,
                                   @RequestBody(required = false) DocCheckAckIn body, HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        gate.designerWriteActor(req, taskId);   // 디자이너 작업이면 디자이너 역할 + 담당 본인(403 DENIED 는 여기서 남긴다)
        try {
            return checks.ack(taskId, name, me, Actor.of(req), DocCheckUiIds.of(req), body);
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        }
    }
}
