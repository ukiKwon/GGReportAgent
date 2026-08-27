package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.dto.ConsistencyResponse;
import com.kbstar.kgi.ggreport.web.service.ConsistencyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 정합성 점검 조회 — 규칙으로 어긋난 상태를 찾는다. 골든 {@code 07}·{@code 28}.
 *
 * <p>{@code POST /run} 가드가 <b>앞으로</b>를 막고, 이 엔드포인트는 <b>이미 어긋나
 * 있는</b> 것을 보여준다.
 */
@RestController
@RequestMapping("/consistency")
public class ConsistencyController {

    private final ConsistencyService consistency;

    public ConsistencyController(ConsistencyService consistency) {
        this.consistency = consistency;
    }

    @GetMapping
    public ConsistencyResponse get(
            @RequestParam(name = "institution_id", required = false) String institutionId) {
        return consistency.check(institutionId);
    }
}
