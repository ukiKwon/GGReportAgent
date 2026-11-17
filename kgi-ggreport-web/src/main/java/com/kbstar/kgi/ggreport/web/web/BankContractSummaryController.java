package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.config.AccessLogInterceptor;
import com.kbstar.kgi.ggreport.web.service.BidTargetService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/** 전 기관 금고 약정 요약(039 읽기 전용, 현황판용). BankContractController(9f 소유)와 분리한 새 컨트롤러. 권한 = map 조회. */
@RestController
public class BankContractSummaryController {

    private final BidTargetService targets;
    private final MenuGuard guard;

    public BankContractSummaryController(BidTargetService targets, MenuGuard guard) {
        this.targets = targets;
        this.guard = guard;
    }

    @GetMapping("/bank-contracts/summary")
    public Map<String, Object> bankSummary(HttpServletRequest req) {
        guard.require(req, BidTargetController.VIEW_MENU);
        Map<String, Object> out = targets.bankSummary();
        req.setAttribute(AccessLogInterceptor.DETAIL, "bank-summary n=" + ((List<?>) out.get("items")).size());
        return out;
    }
}
