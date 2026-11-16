package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.service.InstitutionPlanService;
import com.kbstar.kgi.ggreport.web.service.PlanAudit;
import com.kbstar.kgi.ggreport.web.support.BoardUiIds;
import com.kbstar.kgi.ggreport.web.support.PlanUiIds;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * 기관 사업계획(034). 조회 GET 은 모두 {@code map} 조회 권한 필요(보안 조건 1 — 화면 숨김만으로 막지 않는다).
 * 반입·시드는 {@link AdminGuard#require} 만(조건 1 — requireInstitutionEdit 는 영업 계열이 통과하므로 쓰지 않는다).
 * ⚠️ 사번은 X-Emp-No 자기신고다. 앞단 인증 전에는 관리자 검사도 보안 경계가 아니다.
 */
@RestController
public class InstitutionPlanController {

    /**
     * 조회 문지기 메뉴 키 = map(전국 지도). 메뉴 키 8개가 동결이라 새 키를 만들 수 없다.
     * 이 화면은 '기관·입찰 현황 > 기관' 묶음의 고정 id soon 항목이고, 같은 묶음의 입찰 현황판도 map 키로 연다(nav.js:61).
     */
    static final String VIEW_MENU = "map";

    private final InstitutionPlanService plans;
    private final MenuGuard guard;
    private final AdminGuard admin;
    private final PlanAudit audit;

    public InstitutionPlanController(InstitutionPlanService plans, MenuGuard guard, AdminGuard admin, PlanAudit audit) {
        this.plans = plans;
        this.guard = guard;
        this.admin = admin;
        this.audit = audit;
    }

    /**
     * 기관별 최신 판 요약. 화면이 주기적으로 부르므로 AccessLogInterceptor 의 '/status 폴링' 규칙에 따라 ACCESS_LOG 에는 남지 않는다
     * (팀 결정 2026-11-16: 그대로 둔다). 아래 DETAIL 은 그 규칙이 바뀔 때를 위한 것이고 지금은 기록되지 않는다.
     */
    @GetMapping("/institution-plans/status")
    public Map<String, Object> status(HttpServletRequest req) {
        guard.require(req, VIEW_MENU);
        Map<String, Object> out = plans.status();
        req.setAttribute(AccessLogInterceptor.DETAIL, "inst-plan status n=" + ((List<?>) out.get("items")).size());
        return out;
    }

    @GetMapping("/institutions/{institutionId}/plans")
    public Map<String, Object> detail(@PathVariable String institutionId, HttpServletRequest req) {
        guard.require(req, VIEW_MENU);
        return plans.detail(institutionId);
    }

    /** multipart {@code file}(이름 {기관ID}_{YYYYMMDD}_plan.csv), {@code batch_id?}. 본문 상한은 BoardWriteLimitFilter + 서비스 이중 검사. */
    @PostMapping("/institutions/{institutionId}/plans/import")
    public ResponseEntity<Map<String, Object>> importCsv(@PathVariable String institutionId,
                                                         @RequestParam(name = "file", required = false) MultipartFile file,
                                                         @RequestParam(name = "batch_id", required = false) String batchId,
                                                         HttpServletRequest req) {
        Actor actor = requireAdmin(req, institutionId, InstitutionPlanService.ACTION_IMPORT, PlanUiIds.upload());
        Map<String, Object> out = plans.importUpload(institutionId, file, batchId, actor);
        req.setAttribute(AccessLogInterceptor.DETAIL, "inst-plan import items=" + out.get("item_count"));
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    /** 서울 25구 시드 — 서버 고정 위치(ggreport.plan-seed.location)의 파일만 읽는다. 요청 본문 없음. */
    @PostMapping("/institutions/{institutionId}/plans/seed")
    public ResponseEntity<Map<String, Object>> seed(@PathVariable String institutionId, HttpServletRequest req) {
        Actor actor = requireAdmin(req, institutionId, InstitutionPlanService.ACTION_SEED, PlanUiIds.seed());
        Map<String, Object> out = plans.importSeed(institutionId, actor);
        req.setAttribute(AccessLogInterceptor.DETAIL, "inst-plan seed items=" + out.get("item_count"));
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    /** '자료 없음' 목록 CSV. 본문 {"institution_ids": [...]}(화면의 임박 순서, 최대 1,000). 응답 전에 감사를 남긴다(실패하면 500, 파일 안 나감). */
    @PostMapping("/institution-plans/missing.csv")
    public ResponseEntity<byte[]> missing(@RequestBody(required = false) MissingIn body, HttpServletRequest req) {
        Actor actor = guard.require(req, VIEW_MENU);
        InstitutionPlanService.CsvOut out = plans.missingCsv(body == null ? null : body.getInstitutionIds());
        audit.record(null, null, InstitutionPlanService.ACTION_MISSING, "OK", out.rows, null, actor, PlanUiIds.missing());
        req.setAttribute(AccessLogInterceptor.DETAIL, "inst-plan missing rows=" + out.rows);
        String day = LocalDate.now(ZoneId.of("Asia/Seoul")).toString().replace("-", "");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"plan_missing_" + day + ".csv\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(out.body);
    }

    private Actor requireAdmin(HttpServletRequest req, String inst, String action, BoardUiIds.Ui ui) {
        try {
            return admin.require(req);   // 401/403 은 AdminGuard 가 DENIED 로 접근 이력에 남긴다
        } catch (ApiException e) {
            Actor a = Actor.of(req);
            if (a.isKnown()) {   // 사번 없는 401 은 감사 표를 늘리지 않는다(Head 선례)
                try {
                    audit.record(inst, null, action, "DENIED", null, null, a, ui);
                } catch (RuntimeException ignored) {
                    // 감사 실패가 원래 응답을 덮지 않게
                }
            }
            throw e;
        }
    }

    public static class MissingIn {
        @JsonProperty("institution_ids")
        private List<String> institutionIds;

        public List<String> getInstitutionIds() { return institutionIds; }
        public void setInstitutionIds(List<String> v) { this.institutionIds = v; }
    }
}
