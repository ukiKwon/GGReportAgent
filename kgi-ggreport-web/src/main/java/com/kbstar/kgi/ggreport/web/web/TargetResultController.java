package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.TargetResultService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 협약 성과(NEXT 104). 조회 전용. 메뉴 키 8개 동결 — map 보기 권한 + 역할 허용 목록({@link TargetResultService#canView}).
 * 401/403 은 DENIED(본문·쿼리값 없음). 접근 이력 DETAIL 은 건수만(연도·기관·사번 금지).
 * ⚠️ X-Emp-No 자기신고라 이 역할 검사는 보안 경계가 아니다. 403 은 이 모아 보기만 막는다 — map 보기 사용자는 기존 API 로 같은 원자료를 읽는다(원자료 차단이 아님).
 */
@RestController
public class TargetResultController {
    static final String VIEW_MENU = "map";
    private final TargetResultService service;
    private final MenuGuard guard;

    public TargetResultController(TargetResultService service, MenuGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/bid-targets/results")
    public Map<String, Object> results(@RequestParam(name = "year", required = false) String year, HttpServletRequest req) {
        SysUser u = guard.requireUser(req, VIEW_MENU);   // 401/403 DENIED
        if (!TargetResultService.canView(u.getRole())) throw guard.denied(req, new ApiException(403, TargetResultService.DENIED_MSG));
        Map<String, Object> out = service.report(year);
        Object removed = out.get("removed_items");
        req.setAttribute(AccessLogInterceptor.DETAIL, "target-result n=" + ((List<?>) out.get("items")).size()
                + " removed=" + (removed == null ? "na" : String.valueOf(((List<?>) removed).size())));
        return out;
    }
}
