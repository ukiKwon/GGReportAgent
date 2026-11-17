package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.dto.BidTargetCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BidTargetIn;
import com.kbstar.kgi.ggreport.web.service.BidTargetService;
import com.kbstar.kgi.ggreport.web.support.TargetUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 올해 목표 기관(043)·연도별 금고 은행(039 계산). 조회 = map 조회 권한(전 역할 기본 켬, 디자이너는 보기만),
 * 쓰기 = 기관 레코드 수정 권한 AND 영업 계열({@link BidTargetService#canEdit}). 401/403 은 DENIED(본문·쿼리값 없음).
 * 접근 이력 DETAIL 에는 건수·번호·REV·오류 코드·other(뺀 사람 ≠ 처음 넣은 사람, 사번 없이)만(메모·연도·사번 금지).
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다 — 앞단 인증 전에는 권한 검사도 보안 경계가 아니다.
 * 전 기관 요약({@code GET /bank-contracts/summary})은 {@link BankContractSummaryController} 에 둔다.
 */
@RestController
public class BidTargetController {

    static final String VIEW_MENU = "map";   // 메뉴 키 8개 동결 — 새 키 만들지 않음
    private static final Pattern CODE = Pattern.compile("[A-Z_]{1,40}");

    private final BidTargetService targets;
    private final MenuGuard guard;

    public BidTargetController(BidTargetService targets, MenuGuard guard) {
        this.targets = targets;
        this.guard = guard;
    }

    @GetMapping("/bid-targets")
    public Map<String, Object> list(@RequestParam(name = "year", required = false) String year, HttpServletRequest req) {
        Actor actor = guard.require(req, VIEW_MENU);
        Map<String, Object> out = targets.list(year, actor.getEmpNo());
        req.setAttribute(AccessLogInterceptor.DETAIL, "bid-target list n=" + ((List<?>) out.get("items")).size());
        return out;
    }

    @GetMapping("/institutions/{institutionId}/bid-targets/history")
    public Map<String, Object> history(@PathVariable String institutionId, HttpServletRequest req) {
        guard.require(req, VIEW_MENU);
        Map<String, Object> out = targets.history(institutionId);
        req.setAttribute(AccessLogInterceptor.DETAIL, "bid-target history n=" + ((List<?>) out.get("items")).size());
        return out;
    }

    @PostMapping("/institutions/{institutionId}/bid-targets")
    public ResponseEntity<Map<String, Object>> save(@PathVariable String institutionId,
                                                    @RequestBody(required = false) BidTargetIn body, HttpServletRequest req) {
        Actor actor = requireEditor(req);
        Map<String, Object> out;
        try {
            out = targets.save(institutionId, body, actor,
                    TargetUiIds.of(req, body != null && body.getTargetNo() != null ? TargetUiIds.EDIT : TargetUiIds.ADD));
        } catch (ApiException e) {
            req.setAttribute(AccessLogInterceptor.DETAIL, failDetail("save", e));
            throw e;
        }
        boolean saved = Boolean.TRUE.equals(out.get("saved"));
        req.setAttribute(AccessLogInterceptor.DETAIL, saved
                ? "bid-target save no=" + out.get("target_no") + " rev=" + out.get("rev_no") : "bid-target save no-change");
        return ResponseEntity.status(saved ? HttpStatus.CREATED : HttpStatus.OK).body(out);
    }

    @PostMapping("/institutions/{institutionId}/bid-targets/{targetNo}/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable String institutionId, @PathVariable String targetNo,
                                                      @RequestBody(required = false) BidTargetCancelIn body, HttpServletRequest req) {
        Actor actor = requireEditor(req);
        Map<String, Object> out;
        try {
            out = targets.cancel(institutionId, targetNo, body, actor, TargetUiIds.of(req, TargetUiIds.CANCEL));
        } catch (ApiException e) {
            req.setAttribute(AccessLogInterceptor.DETAIL, failDetail("cancel", e));
            throw e;
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "bid-target cancel no=" + out.get("target_no") + " rev=" + out.get("rev_no")
                + " other=" + (Boolean.TRUE.equals(out.get("edited_by_other")) ? "1" : "0"));   // S2 — 남의 것을 뺐는지(사번 없이)
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    @GetMapping("/institutions/{institutionId}/bank-years")
    public Map<String, Object> bankYears(@PathVariable String institutionId,
                                         @RequestParam(name = "from", required = false) String from,
                                         @RequestParam(name = "to", required = false) String to, HttpServletRequest req) {
        guard.require(req, VIEW_MENU);
        Map<String, Object> out = targets.bankYears(institutionId, from, to);
        req.setAttribute(AccessLogInterceptor.DETAIL, "bank-years n=" + ((List<?>) out.get("years")).size());
        return out;
    }

    /** 401/403(수정 권한) → DENIED, 그다음 영업 계열 아니면 403 DENIED. 서비스 트랜잭션(잠금) 전에 거른다. */
    private Actor requireEditor(HttpServletRequest req) {
        Actor actor = guard.requireInstitutionEdit(req);
        if (!targets.canEdit(actor.getEmpNo())) throw guard.denied(req, new ApiException(403, BidTargetService.DENIED_MSG));
        return actor;
    }

    private static String failDetail(String op, ApiException e) {
        String code = null;
        Object d = e.getDetailObject();
        if (d instanceof Map) {
            Object c = ((Map<?, ?>) d).get("code");
            if (c instanceof String && CODE.matcher((String) c).matches()) code = (String) c;
        }
        return "bid-target " + op + " " + e.getStatus() + (code == null ? "" : " " + code);
    }
}
