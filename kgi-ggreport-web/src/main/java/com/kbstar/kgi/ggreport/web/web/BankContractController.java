package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.dto.BankContractCancelIn;
import com.kbstar.kgi.ggreport.web.dto.BankContractIn;
import com.kbstar.kgi.ggreport.web.service.BankContractService;
import com.kbstar.kgi.ggreport.web.support.InstUiIds;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 금고 약정 기록(039). 조회 = map 조회 권한, 저장·취소 = 기관 레코드 수정 권한 AND 영업팀 계열({@link BankContractService#canEdit}).
 * 401/403 은 DENIED(본문·쿼리값 없음). 접근 이력 DETAIL 에는 줄 번호·REV·사유 코드만(은행·비고·부서·링크 금지).
 * ⚠️ 사번은 X-Emp-No 자기신고일 수 있다 — 앞단 인증 전에는 권한 검사도 보안 경계가 아니다.
 */
@RestController
public class BankContractController {

    /** 메뉴 키 8개 동결 — 새 키 만들지 않음. nav.js:63·66(입찰 현황판·입찰 공고 현황)과 NoticeRoundController 가 쓰는 map 과 같다. */
    static final String VIEW_MENU = "map";
    private static final Pattern CODE = Pattern.compile("[A-Z_]{1,40}");

    private final BankContractService contracts;
    private final MenuGuard guard;

    public BankContractController(BankContractService contracts, MenuGuard guard) {
        this.contracts = contracts;
        this.guard = guard;
    }

    @GetMapping("/institutions/{institutionId}/bank-contracts")
    public Map<String, Object> current(@PathVariable String institutionId, HttpServletRequest req) {
        Actor actor = guard.require(req, VIEW_MENU);
        Map<String, Object> out = contracts.current(institutionId, actor.getEmpNo());
        req.setAttribute(AccessLogInterceptor.DETAIL, "bank-contract current n=" + ((List<?>) out.get("lines")).size());
        return out;
    }

    @GetMapping("/institutions/{institutionId}/bank-contracts/history")
    public Map<String, Object> history(@PathVariable String institutionId, HttpServletRequest req) {
        guard.require(req, VIEW_MENU);
        Map<String, Object> out = contracts.history(institutionId);
        req.setAttribute(AccessLogInterceptor.DETAIL, "bank-contract history n=" + ((List<?>) out.get("items")).size());
        return out;
    }

    @PostMapping("/institutions/{institutionId}/bank-contracts")
    public ResponseEntity<Map<String, Object>> save(@PathVariable String institutionId,
                                                    @RequestBody(required = false) BankContractIn body,
                                                    HttpServletRequest req) {
        Actor actor = requireEditor(req);
        Map<String, Object> out;
        try {
            out = contracts.save(institutionId, body, actor, InstUiIds.bankContract(req, InstUiIds.BTN_SAVE_BANK_CONTRACT));
        } catch (ApiException e) {
            req.setAttribute(AccessLogInterceptor.DETAIL, failDetail("save", e));
            throw e;
        }
        boolean saved = Boolean.TRUE.equals(out.get("saved"));
        req.setAttribute(AccessLogInterceptor.DETAIL, saved
                ? "bank-contract save no=" + out.get("contract_no") + " rev=" + out.get("rev_no")
                : "bank-contract save no-change");
        return ResponseEntity.status(saved ? HttpStatus.CREATED : HttpStatus.OK).body(out);
    }

    @PostMapping("/institutions/{institutionId}/bank-contracts/{contractNo}/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable String institutionId, @PathVariable String contractNo,
                                                      @RequestBody(required = false) BankContractCancelIn body,
                                                      HttpServletRequest req) {
        Actor actor = requireEditor(req);
        Map<String, Object> out;
        try {
            out = contracts.cancel(institutionId, contractNo, body, actor,
                    InstUiIds.bankContract(req, InstUiIds.BTN_CANCEL_BANK_CONTRACT));
        } catch (ApiException e) {
            req.setAttribute(AccessLogInterceptor.DETAIL, failDetail("cancel", e));
            throw e;
        }
        req.setAttribute(AccessLogInterceptor.DETAIL, "bank-contract cancel no=" + out.get("contract_no") + " rev=" + out.get("rev_no"));
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    /** 401/403(수정 권한) → DENIED, 그다음 영업팀 계열 아니면 403 DENIED. 서비스 트랜잭션(잠금) 전에 거른다. */
    private Actor requireEditor(HttpServletRequest req) {
        Actor actor = guard.requireInstitutionEdit(req);
        if (!contracts.canEdit(actor.getEmpNo())) {
            throw guard.denied(req, new ApiException(403, "이 기능을 쓸 권한이 없습니다."));
        }
        return actor;
    }

    private static String failDetail(String op, ApiException e) {
        String code = null;
        Object d = e.getDetailObject();
        if (d instanceof Map) {
            Object c = ((Map<?, ?>) d).get("code");
            if (c instanceof String && CODE.matcher((String) c).matches()) code = (String) c;
        }
        return "bank-contract " + op + " " + e.getStatus() + (code == null ? "" : " " + code);
    }
}
