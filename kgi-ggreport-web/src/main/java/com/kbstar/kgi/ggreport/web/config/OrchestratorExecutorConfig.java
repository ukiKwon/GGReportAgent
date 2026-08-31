package com.kbstar.kgi.ggreport.web.config;

import com.kbstar.kgi.ggreport.web.orchestrator.BackgroundExecutor;
import com.kbstar.kgi.ggreport.web.orchestrator.CallerRunsExecutor;
import com.kbstar.kgi.ggreport.web.orchestrator.WorkManagerExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.naming.InitialContext;

/**
 * 백그라운드 실행 방식을 고른다 — WorkManager 가 있으면 그것, 없으면 호출 스레드.
 *
 * <p><b>JNDI 조회 성공 여부로 정한다.</b> 환경 이름(prod/local/…)으로 가르지 않는 이유:
 * 설정 파일은 복사해서 쓰는 물건이라({@code config/application.properties}) 잘못된 것을
 * 복사한 채 뜨는 일이 실제로 있다. 있으면 쓰고 없으면 폴백이 <b>사실에 더 가깝다.</b>
 *
 * <p>⚠️ <b>폴백을 조용히 쓰지 않는다.</b> 운영에서 폴백으로 떨어지면 요청 스레드가
 * 게이트까지 붙잡히고 WAS 스레드 풀이 마른다 — 증상이 "가끔 느리다"로만 보여 원인을
 * 찾기 어렵다. 그래서 <b>WARN 으로 크게 남긴다.</b>
 */
@Configuration
public class OrchestratorExecutorConfig {

    private static final Logger log = LoggerFactory.getLogger(OrchestratorExecutorConfig.class);

    /**
     * WebLogic 콘솔에서 만드는 Work Manager 의 JNDI 이름 — {@code web.xml} 의
     * {@code resource-ref} 와 같아야 한다(README §6).
     */
    @Value("${ggreport.work-manager-jndi:java:comp/env/wm/ggreportWM}")
    private String jndiName;

    @Bean
    public BackgroundExecutor backgroundExecutor() {
        if (jndiName == null || jndiName.trim().isEmpty()) {
            log.info("WorkManager JNDI 이름이 비어 있다 — 호출 스레드에서 실행한다.");
            return new CallerRunsExecutor();
        }
        try {
            Object workManager = new InitialContext().lookup(jndiName);
            BackgroundExecutor executor = new WorkManagerExecutor(workManager, jndiName);
            log.info("백그라운드 실행: {}", executor.describe());
            return executor;
        } catch (Exception e) {
            // WAS 밖(외부망 로컬·테스트)에서는 여기로 온다 — 정상이다.
            log.warn("WorkManager({})를 못 찾아 **호출 스레드에서 실행한다**."
                    + " WebLogic 운영에서 이 줄이 보이면 설정이 잘못된 것이다"
                    + " — 요청 스레드가 게이트까지 붙잡혀 WAS 스레드 풀이 마른다. 사유: {}",
                    jndiName, e.toString());
            return new CallerRunsExecutor();
        }
    }
}
