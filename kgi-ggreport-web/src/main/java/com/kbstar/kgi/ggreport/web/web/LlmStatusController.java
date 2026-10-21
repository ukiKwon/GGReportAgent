package com.kbstar.kgi.ggreport.web.web;

import com.kbstar.kgi.ggreport.web.llm.LlmProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * LLM 상태 — 대화 탭의 🧠 모델 배지. Task 5B.6.
 * Python {@code server/routers/llm_status.py} ({@code agent.llm.model_info}).
 *
 * <p>⚠️ <b>{@code reachable} 은 {@code ?probe=1} 일 때만 붙는다 — 거짓으로 채워
 * 넣지 않는다.</b> 조회하지 않은 것과 조회해서 못 닿은 것은 다르다. {@code false} 로
 * 두면 엔드포인트가 멀쩡한데도 죽은 것처럼 보인다(이 리포가 실제로 한 번 겪은 오진).
 * 화면 배지는 이 필드를 쓰지 않으므로 기본값으로 왕복을 붙이지도 않는다.
 */
@RestController
@RequestMapping("/llm")
public class LlmStatusController {

    private final LlmProperties llm;

    public LlmStatusController(LlmProperties llm) {
        this.llm = llm;
    }

    /**
     * ⚠️ <b>{@code installed} 는 아직 항상 빈 목록이다.</b> 파이썬은 Ollama 를 찔러
     * 설치된 모델을 받아 오는데, 자바 어댑터는 <b>구현 자체가 보류</b>다
     * ({@code NotYetMigratedLlmClient} — 문의 1-2 서버 사양 대기).
     *
     * <p>그래서 {@code probe=1} 이어도 {@code reachable} 은 <b>항상 false</b> 가 된다.
     * 이것은 사실이다 — 지금은 실제로 부를 런타임이 없다. 어댑터가 붙으면 여기서
     * 목록 조회를 실제로 하도록 바꾸면 되고, <b>응답 모양은 그대로다.</b>
     */
    @GetMapping("/status")
    public Map<String, Object> status(@RequestParam(name = "probe", defaultValue = "false") boolean probe) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("model", llm.getModel());
        info.put("fallback_model", llm.getFallbackModel());
        info.put("base_url", llm.getBaseUrl());
        List<String> installed = Collections.emptyList();
        info.put("installed", installed);
        if (probe) {
            info.put("reachable", !installed.isEmpty());
        }
        return info;
    }
}
