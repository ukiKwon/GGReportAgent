package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.dto.BidAssignIn;
import com.kbstar.kgi.ggreport.web.service.BidAssignmentService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 입찰 건 담당자 배정(019 S2-a). 경로는 {@code /bidcases/{id}/assignments}(하이픈 없는 {@code /bidcases}).
 *
 * <p>호출자 확인은 {@link MenuGuard#requireActiveUser}(401/403 DENIED, 메뉴 무관 — 영업부장은 tasks 메뉴가 꺼져 있다).
 * 역할 검사 403 은 서비스가 던지고 여기서 DENIED 로 남긴다. 접근 이력에는 본문·사번 목록·사유·이름을 넣지 않고
 * 성공한 최초 배정에 한해 {@code assign case=… n=… code=ASSIGN} 만 남긴다.
 * ⚠️ X-Emp-No 자기신고 위의 업무 규칙이다 — 사칭 방지가 아니다.
 */
@RestController
public class BidAssignmentController {

    private final BidAssignmentService assignments;
    private final MenuGuard guard;

    public BidAssignmentController(BidAssignmentService assignments, MenuGuard guard) {
        this.assignments = assignments;
        this.guard = guard;
    }

    @GetMapping("/bidcases/{bidCaseId}/assignments")
    public Map<String, Object> view(@PathVariable String bidCaseId, HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        return denyLogged(req, () -> assignments.view(bidCaseId, me));
    }

    @PostMapping("/bidcases/{bidCaseId}/assignments")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@PathVariable String bidCaseId, @RequestBody BidAssignIn body,
                                      HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        Actor actor = Actor.of(req);
        Map<String, Object> out = denyLogged(req,
                () -> assignments.create(bidCaseId, body == null ? null : body.getEmpNos(), me, actor));
        int n = ((List<?>) out.get("assignees")).size();
        req.setAttribute(AccessLogInterceptor.DETAIL, "assign case=" + bidCaseId + " n=" + n + " code=ASSIGN");
        return out;
    }

    @GetMapping("/bidcases/{bidCaseId}/assignments/history")
    public List<Map<String, Object>> history(@PathVariable String bidCaseId, HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        return denyLogged(req, () -> assignments.history(bidCaseId, me));
    }

    /** 내가 현재 담당인 입찰 건 — 로그인한 누구나(자기 것만). */
    @GetMapping("/me/assignments")
    public List<Map<String, Object>> mine(HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        return assignments.mine(me.getEmpNo());
    }

    /** 서비스의 역할 403 을 DENIED 로 접근 이력에 남긴다(TaskController.approve 와 같은 방식). */
    private <T> T denyLogged(HttpServletRequest req, Supplier<T> action) {
        try {
            return action.get();
        } catch (ApiException e) {
            if (e.getStatus() == 403) {
                throw guard.denied(req, e);
            }
            throw e;
        }
    }
}
