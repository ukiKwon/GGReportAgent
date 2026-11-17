package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.domain.SysUser;
import com.kbstar.kgi.ggreport.web.service.InstitutionPlanService;
import com.kbstar.kgi.ggreport.web.service.PlanAudit;
import com.kbstar.kgi.ggreport.web.service.PlanCollectService;
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

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * 사업계획 수집 요청(045). 요청·취소 = map 조회 권한 + 영업부서·개발부서(디자이너·재무부서 제외, 403 + DENIED 감사).
 * 처리 화면(목록·내보내기·수집 중 표시·실행·제외·실패) = {@link AdminGuard}(전산팀원·팀장·마스터). requireInstitutionEdit 는 쓰지 않는다(영업 계열 통과).
 * 쓰기 POST 의 본문은 JSON 만(@RequestBody — 다른 Content-Type 은 415, 다른 사이트 폼 전송 방어).
 * ⚠️ 사번은 X-Emp-No 자기신고다. 앞단 인증 전에는 이 권한 검사도 보안 경계가 아니다.
 */
@RestController
public class PlanCollectController {

    private final PlanCollectService collect;
    private final MenuGuard guard;
    private final AdminGuard admin;
    private final PlanAudit audit;

    public PlanCollectController(PlanCollectService collect, MenuGuard guard, AdminGuard admin, PlanAudit audit) {
        this.collect = collect;
        this.guard = guard;
        this.admin = admin;
        this.audit = audit;
    }

    // ── 요청하는 쪽(기관 사업계획 화면) ──
    @PostMapping("/institutions/{institutionId}/plan-collect")
    public ResponseEntity<Map<String, Object>> request(@PathVariable String institutionId, HttpServletRequest req) {
        Actor actor = requireRequester(req, institutionId, PlanCollectService.ACTION_REQUEST, PlanUiIds.collectRequest());
        Map<String, Object> out = collect.request(institutionId, actor);
        req.setAttribute(AccessLogInterceptor.DETAIL, "plan-collect request outcome=" + out.get("outcome"));
        return ResponseEntity.status(Boolean.TRUE.equals(out.get("created")) ? HttpStatus.CREATED : HttpStatus.OK).body(out);
    }

    @PostMapping("/institutions/{institutionId}/plan-collect/cancel")
    public Map<String, Object> cancel(@PathVariable String institutionId, HttpServletRequest req) {
        Actor actor = requireRequester(req, institutionId, PlanCollectService.ACTION_CANCEL, PlanUiIds.collectCancel());
        Map<String, Object> out = collect.cancel(institutionId, actor);
        req.setAttribute(AccessLogInterceptor.DETAIL, "plan-collect cancel status=" + out.get("status_cd"));
        return out;
    }

    /** 기관 사업계획 화면 표시용(열린 요청만). map 조회 권한이면 누구나 — 요청 가능 여부는 can_request 로 알려 준다. */
    @GetMapping("/plan-collect/status")
    public Map<String, Object> status(HttpServletRequest req) {
        SysUser u = guard.requireUser(req, InstitutionPlanController.VIEW_MENU);
        return collect.status(u.getEmpNo(), PlanCollectService.canRequest(u.getRole()));
    }

    // ── 처리 화면(개발부서 = admin 키) ──
    @GetMapping("/plan-collect/requests")
    public Map<String, Object> list(@RequestParam(name = "scope", required = false) String scope, HttpServletRequest req) {
        admin.require(req);   // 조회 거부는 접근 이력 DENIED(감사 표는 쓰기 동작만)
        Map<String, Object> out = collect.adminList(scope);
        req.setAttribute(AccessLogInterceptor.DETAIL, "plan-collect list n=" + ((List<?>) out.get("items")).size());
        return out;
    }

    @GetMapping("/plan-collect/admin/status")
    public Map<String, Object> adminStatus(HttpServletRequest req) {
        admin.require(req);
        return collect.adminStatus();
    }

    @PostMapping("/plan-collect/export.csv")
    public ResponseEntity<byte[]> export(@RequestBody(required = false) KeysIn body, HttpServletRequest req) {
        Actor actor = requireAdmin(req, PlanCollectService.ACTION_EXPORT, PlanUiIds.collectExport());
        InstitutionPlanService.CsvOut out = collect.exportCsv(body == null ? null : body.getReqKeys(), actor);
        req.setAttribute(AccessLogInterceptor.DETAIL, "plan-collect export rows=" + out.rows);
        String day = LocalDate.now(ZoneId.of("Asia/Seoul")).toString().replace("-", "");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"plan_collect_" + day + ".csv\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(out.body);
    }

    @PostMapping("/plan-collect/mark-running")
    public Map<String, Object> markRunning(@RequestBody(required = false) KeysIn body, HttpServletRequest req) {
        Actor actor = requireAdmin(req, PlanCollectService.ACTION_RUN, PlanUiIds.collectMark());
        return detail(req, "mark", collect.markRunning(body == null ? null : body.getReqKeys(), actor));
    }

    @PostMapping("/plan-collect/run")
    public Map<String, Object> run(@RequestBody(required = false) KeysIn body, HttpServletRequest req) {
        Actor actor = requireAdmin(req, PlanCollectService.ACTION_RUN, PlanUiIds.collectRun());
        return detail(req, "run", collect.runAgent(body == null ? null : body.getReqKeys(), actor));
    }

    @PostMapping("/plan-collect/exclude")
    public Map<String, Object> exclude(@RequestBody(required = false) KeysIn body, HttpServletRequest req) {
        Actor actor = requireAdmin(req, PlanCollectService.ACTION_EXCLUDE, PlanUiIds.collectExclude());
        return detail(req, "exclude", collect.close(body == null ? null : body.getReqKeys(), body == null ? null : body.getReason(), true, actor));
    }

    @PostMapping("/plan-collect/fail")
    public Map<String, Object> fail(@RequestBody(required = false) KeysIn body, HttpServletRequest req) {
        Actor actor = requireAdmin(req, PlanCollectService.ACTION_FAIL, PlanUiIds.collectFail());
        return detail(req, "fail", collect.close(body == null ? null : body.getReqKeys(), body == null ? null : body.getReason(), false, actor));
    }

    private static Map<String, Object> detail(HttpServletRequest req, String what, Map<String, Object> out) {
        req.setAttribute(AccessLogInterceptor.DETAIL, "plan-collect " + what + " ok=" + out.get("ok_count"));   // 키·사유 없음
        return out;
    }

    private Actor requireRequester(HttpServletRequest req, String inst, String action, BoardUiIds.Ui ui) {
        SysUser u;
        try {
            u = guard.requireUser(req, InstitutionPlanController.VIEW_MENU);
        } catch (ApiException e) {
            deniedAudit(req, inst, action, ui);
            throw e;
        }
        if (!PlanCollectService.canRequest(u.getRole())) {
            ApiException e = new ApiException(403, "수집 요청은 영업부서·개발부서만 할 수 있습니다.");
            guard.denied(req, e);
            deniedAudit(req, inst, action, ui);
            throw e;
        }
        return Actor.of(req);
    }

    private Actor requireAdmin(HttpServletRequest req, String action, BoardUiIds.Ui ui) {
        try {
            return admin.require(req);   // 401/403 은 AdminGuard 가 DENIED 로 접근 이력에 남긴다
        } catch (ApiException e) {
            deniedAudit(req, null, action, ui);
            throw e;
        }
    }

    private void deniedAudit(HttpServletRequest req, String inst, String action, BoardUiIds.Ui ui) {
        Actor a = Actor.of(req);
        if (!a.isKnown()) return;   // 사번 없는 401 은 감사 표를 늘리지 않는다(InstitutionPlanController 선례)
        try {
            audit.record(inst, null, action, "DENIED", null, null, a, ui);
        } catch (RuntimeException ignored) {
            // 감사 실패가 원래 응답을 덮지 않게
        }
    }

    public static class KeysIn {
        @JsonProperty("req_keys")
        private List<String> reqKeys;
        @JsonProperty("reason")
        private String reason;

        public List<String> getReqKeys() { return reqKeys; }
        public void setReqKeys(List<String> v) { this.reqKeys = v; }
        public String getReason() { return reason; }
        public void setReason(String v) { this.reason = v; }
    }
}
