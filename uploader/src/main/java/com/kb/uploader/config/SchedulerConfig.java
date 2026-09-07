package com.kb.uploader.config;

import com.kb.uploader.job.BackgroundScheduler;
import com.kb.uploader.job.LocalScheduler;
import com.kb.uploader.job.TimerManagerScheduler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.naming.InitialContext;

/**
 * 반복 작업의 실행 방식을 고른다 — TimerManager 가 있으면 그것, 없으면 로컬 스케줄러.
 *
 * <p>⚠️ <b>종전에는 여기가 {@code @EnableScheduling} 한 줄이었다</b>(2026-08-31 교체).
 * 그러면 Spring 이 자기 타이머 스레드 풀을 만드는데, <b>WAS 에서 앱이 스레드를 만드는
 * 것은 금지</b>다(설계 §2·§4). 컨테이너가 모르는 스레드는 재배포해도 안 죽어 클래스로더가
 * 새고, 트랜잭션·보안 컨텍스트·JNDI 환경이 안 실리며, WAS 콘솔·스레드 덤프에 안 잡힌다.
 *
 * <p><b>JNDI 조회 성공 여부로 정한다.</b> 환경 이름(prod/local/…)으로 가르지 않는 이유:
 * 설정 파일은 복사해서 쓰는 물건이라({@code config-envs/{env}/} → {@code config/})
 * 잘못된 것을 복사한 채 뜨는 일이 실제로 있다. 있으면 쓰고 없으면 폴백이
 * <b>사실에 더 가깝다.</b> 본체 {@code OrchestratorExecutorConfig} 와 같은 판단이다.
 *
 * <p>⚠️ <b>폴백을 조용히 쓰지 않는다.</b> 운영에서 폴백으로 떨어지면 앱이 WAS 몰래
 * 스레드를 만드는 원래 상태로 돌아간 것이다 — 증상이 없어서 아무도 모른다.
 * 그래서 <b>WARN 으로 크게 남긴다.</b>
 */
@Configuration
public class SchedulerConfig {

    private static final Logger log = LoggerFactory.getLogger(SchedulerConfig.class);

    /**
     * WebLogic 콘솔에서 만드는 Timer Manager 의 JNDI 이름 — {@code web.xml} 의
     * {@code resource-ref} 와 같아야 한다(README §10).
     */
    @Value("${uploader.timer-manager-jndi:java:comp/env/timer/uploaderTM}")
    private String jndiName;

    /**
     * ⚠️ {@code destroyMethod} 를 명시하지 않는다. {@code @Bean} 기본값이 <b>추론</b>
     * 이라 {@code shutdown()} 이 있는 {@link LocalScheduler} 만 종료 때 정리되고,
     * 그런 메서드가 없는 {@link TimerManagerScheduler} 는 건너뛴다. 이름을 박아 두면
     * 후자에서 기동이 깨진다(그리고 그건 내부망에서만 터진다).
     */
    @Bean
    public BackgroundScheduler backgroundScheduler() {
        if (jndiName == null || jndiName.trim().isEmpty()) {
            log.info("TimerManager JNDI 이름이 비어 있다 — 로컬 스케줄러로 돈다.");
            return new LocalScheduler();
        }
        try {
            Object timerManager = new InitialContext().lookup(jndiName);
            BackgroundScheduler scheduler = new TimerManagerScheduler(timerManager, jndiName);
            log.info("반복 작업 실행: {}", scheduler.describe());
            return scheduler;
        } catch (Exception e) {
            // WAS 밖(외부망 로컬·테스트)에서는 여기로 온다 — 정상이다.
            log.warn("TimerManager({})를 못 찾아 **로컬 스케줄러로 돈다**."
                            + " WebLogic 운영에서 이 줄이 보이면 설정이 잘못된 것이다"
                            + " — 앱이 컨테이너 몰래 스레드를 만드는 상태다. 사유: {}",
                    jndiName, e.toString());
            return new LocalScheduler();
        }
    }
}
