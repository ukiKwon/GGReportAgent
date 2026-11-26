package com.kbstar.kgi.ggreport.web.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 이 PC 시범 어댑터 등록 — enabled=true 를 <b>명시</b>했을 때만 빈이 생긴다(키가 없으면 생기지 않는다).
 * LlmClient 빈이 아니다 — NotYetMigratedLlmClient(소리 내어 실패)는 그대로 남는다(security 중-2).
 * 주입 경로는 ScriptDraftService 의 ObjectProvider&lt;OllamaLlmClient&gt; 하나뿐.
 */
@Configuration
public class OllamaRegistration {

    @Bean
    @ConditionalOnProperty(prefix = "ggreport.llm.ollama", name = "enabled", havingValue = "true")
    public OllamaLlmClient ollamaLlmClient(OllamaProperties props,
                                           @Value("${spring.datasource.url:}") String datasourceUrl,
                                           @Value("${spring.datasource.jndi-name:}") String jndiName) {
        return new OllamaLlmClient(props, OllamaGuard.check(props, datasourceUrl, jndiName));
    }
}
