package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.ApprovalsResponse;
import com.kbstar.kgi.ggreport.web.service.ApprovalsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 결재함 — Task 5B.2. Python {@code server/routers/approvals.py}.
 *
 * <p>{@code POST /tasks/{id}/approve} 는 진작 있었는데 <b>누를 화면이 없어</b> 팀 작업이
 * 영원히 {@code 1차완료} 에 머물렀다. 여기서 결재 대상을 역할별로 뽑아 준다.
 *
 * <p>⚠️ <b>경로에 후행 슬래시를 두지 않는다.</b> 원본이
 * {@code APIRouter(prefix="/approvals")} + {@code @router.get("")} 라 정확히
 * {@code /approvals} 이고, 화면이 그 주소로 부른다.
 *
 * <p>⚠️ <b>{@code role} 은 필수다.</b> 없이 열면 남의 결재함까지 보이는 전체 조회가 된다
 * ({@code GET /tasks} 의 {@code team}, {@code GET /notifications} 의 {@code recipient} 와
 * 같은 이유).
 */
@RestController
@RequestMapping("/approvals")
public class ApprovalController {

    private final ApprovalsService approvals;

    public ApprovalController(ApprovalsService approvals) {
        this.approvals = approvals;
    }

    @GetMapping
    public ApprovalsResponse list(@RequestParam("role") String role) {
        if (role.trim().isEmpty()) {
            throw ApiException.badRequest("role이 비어 있습니다");
        }
        return approvals.forRole(role);
    }
}
