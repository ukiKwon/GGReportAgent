package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.ApprovalItem;
import com.kbstar.kgi.ggreport.web.dto.ApprovalsResponse;
import com.kbstar.kgi.ggreport.web.service.ApprovalsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;

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
 * <p>⚠️ <b>{@code role} 파라미터는 무시된다.</b> 결재함의 역할은 X-Emp-No 의 USERS.ROLE 로 서버가
 * 정한다(남의 결재함 조회 방지, 2026-11-10). 사번이 없으면(둘러보기) 빈 목록이다.
 */
@RestController
@RequestMapping("/approvals")
public class ApprovalController {

    private final ApprovalsService approvals;
    private final MenuGuard guard;

    public ApprovalController(ApprovalsService approvals, MenuGuard guard) {
        this.approvals = approvals;
        this.guard = guard;
    }

    @GetMapping
    public ApprovalsResponse list(@RequestParam(name = "role", required = false) String ignoredRole,
                                  HttpServletRequest req) {
        // role 파라미터는 호환용으로만 받고 무시한다 — 결재함은 X-Emp-No 의 USERS.ROLE 로 정한다.
        // 둘러보기(사번 없음)는 빈 목록이다(화면이 오류 문구를 띄우지 않게 200).
        if (!Actor.of(req).isKnown()) {
            return new ApprovalsResponse("", Collections.<ApprovalItem>emptyList());
        }
        SysUser me = guard.requireUser(req, "approvals");
        return approvals.forRole(me.getRole() == null ? "" : me.getRole().trim());
    }
}
