package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.service.InstitutionNewsService;
import com.kbstar.kgi.ggreport.web.service.PlanAudit;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 기관 관련 뉴스(060, NEXT 107). 조회 = 사업계획 조회와 같은 권한(map 키, 팀 결정 11-24). 반입 = {@link AdminGuard#require} 만(사업계획 반입과 같음).
 * 거부: 401(사번 없음)·403 은 AdminGuard/MenuGuard 가 접근 이력 DENIED 로 남기고, 반입 403 은 INST_PLAN_ACT 에도 NEWS_IMPORT/DENIED 로 남긴다.
 * ⚠️ 사번은 X-Emp-No 자기신고다. 앞단 인증 전에는 이 권한 검사도 보안 경계가 아니다.
 */
@RestController
public class InstitutionNewsController {

    private final InstitutionNewsService news;
    private final MenuGuard guard;
    private final AdminGuard admin;
    private final PlanAudit audit;

    public InstitutionNewsController(InstitutionNewsService news, MenuGuard guard, AdminGuard admin, PlanAudit audit) {
        this.news = news;
        this.guard = guard;
        this.admin = admin;
        this.audit = audit;
    }

    @GetMapping("/institutions/{institutionId}/news")
    public Map<String, Object> detail(@PathVariable String institutionId, HttpServletRequest req) {
        guard.require(req, InstitutionPlanController.VIEW_MENU);
        return news.detail(institutionId);
    }

    /** multipart {@code file}(이름 {기관ID}_{YYYYMMDD}_news.csv), {@code batch_id?}. 본문 상한은 BoardWriteLimitFilter + 서비스 이중 검사. */
    @PostMapping("/institutions/{institutionId}/news/import")
    public ResponseEntity<Map<String, Object>> importCsv(@PathVariable String institutionId,
                                                         @RequestParam(name = "file", required = false) MultipartFile file,
                                                         @RequestParam(name = "batch_id", required = false) String batchId,
                                                         HttpServletRequest req) {
        Actor actor = requireAdmin(req, institutionId, PlanUiIds.newsUpload());
        Map<String, Object> out = news.importUpload(institutionId, file, batchId, actor);
        req.setAttribute(AccessLogInterceptor.DETAIL, "inst-news import items=" + out.get("item_count"));
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    private Actor requireAdmin(HttpServletRequest req, String inst, BoardUiIds.Ui ui) {
        try {
            return admin.require(req);   // 401/403 은 AdminGuard 가 DENIED 로 접근 이력에 남긴다
        } catch (ApiException e) {
            Actor a = Actor.of(req);
            if (a.isKnown()) {   // 사번 없는 401 은 감사 표를 늘리지 않는다(Plan·Head 선례)
                try {
                    audit.record(inst, null, InstitutionNewsService.ACTION_NEWS_IMPORT, "DENIED", null, null, a, ui);
                } catch (RuntimeException ignored) {
                    // 감사 실패가 원래 응답을 덮지 않게
                }
            }
            throw e;
        }
    }
}
