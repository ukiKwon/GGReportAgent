package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.ExtCheckQueryService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;

/**
 * 외부 확인 열람(NEXT 90 3단계) — 영업팀·영업팀장·영업부장만({@link InboxController} 와 같은 집합). 디자이너·마스터·전산팀·관리자는 403.
 * 사번 없음 401, 미등록·비활성 403 — 모두 접근 이력 DENIED(고정 문구, 본문·질의 값 없음).
 * 성공·404 는 AccessLogInterceptor 가 API 로 남긴다(경로 = check_key·seq 만, 쿼리의 institution_id 값은 남기지 않는다).
 * ⚠️ 사번은 X-Emp-No 자기신고다 — 업무 규칙이지 사칭 방지가 아니다.
 */
@RestController
@RequestMapping("/ext-checks")
public class ExtCheckController {

    static final String DENIED_MESSAGE = "외부 확인 자료를 볼 권한이 없습니다.";

    private final ExtCheckQueryService service;
    private final MenuGuard guard;

    public ExtCheckController(ExtCheckQueryService service, MenuGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(name = "institution_id", required = false) String institutionId,
                                    HttpServletRequest req) {
        requireSalesTeam(req);
        Map<String, Object> out = service.list(institutionId);
        req.setAttribute(AccessLogInterceptor.DETAIL, "ext_check list n=" + ((List<?>) out.get("history")).size());
        return out;
    }

    @GetMapping("/{checkKey}/files/{seq}")
    public ResponseEntity<byte[]> download(@PathVariable String checkKey, @PathVariable String seq,
                                           HttpServletRequest req, HttpServletResponse res) {
        requireSalesTeam(req);
        req.setAttribute(AccessLogInterceptor.DETAIL, "ext_check file");
        ExtCheckQueryService.Download d = service.download(checkKey, seq);
        res.setHeader("Content-Disposition", "attachment; filename=\"" + d.getName() + "\"");   // 서버 생성명(영숫자·_-.)
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        res.setHeader("X-Download-Options", "noopen");
        req.setAttribute(AccessLogInterceptor.DETAIL, "ext_check file bytes=" + d.getBytes().length);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(d.getBytes());
    }

    private void requireSalesTeam(HttpServletRequest req) {
        SysUser me = guard.requireActiveUser(req);
        String role = me.getRole() == null ? null : me.getRole().trim();
        if (role == null || !InboxController.SALES_TEAM_ROLES.contains(role)) {
            throw guard.denied(req, new ApiException(403, DENIED_MESSAGE));
        }
    }
}
