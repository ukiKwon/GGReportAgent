package com.kb.uploader.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * {@code reclassification.cron} 에 따라 {@link ReclassificationJob} 을 반복 실행한다.
 *
 * <p><b>왜 {@code @Scheduled} 가 아닌가.</b> {@code @EnableScheduling} 은 Spring 이
 * <b>자기 타이머 스레드 풀을 직접 만들게</b> 한다 — WAS 금지 사항이다(설계 §2·§4,
 * {@link BackgroundScheduler} 의 설명 참조).
 *
 * <p><b>왜 "한 번 돌고 다시 예약"인가.</b> CommonJ TimerManager 는 고정 주기(밀리초)를
 * 받지 cron 을 모른다. 밀리초 주기를 따로 두면 {@code reclassification.cron} 과
 * <b>두 벌</b>이 되어 조용히 갈린다. 그래서 주기의 근거를 cron 한 곳으로 두고, 매 실행
 * 뒤 <b>다음 cron 시각까지의 지연</b>을 계산해 1회성 예약을 다시 건다.
 *
 * <p>⚠️ <b>다음 예약은 {@code finally} 에서 건다.</b> 한 번의 재분류가 실패했다고
 * 반복이 영영 멈추면, 증상이 "미분류 파일이 계속 쌓인다"로만 나타나 원인을 찾기 어렵다.
 *
 * <p>⚠️ <b>고정 주기(fixed-rate)가 아니라 실행 후 재계산이다.</b> 한 번이 cron 간격보다
 * 오래 걸리면 그 주기는 건너뛴다 — 재분류가 겹쳐 도는 것보다 낫다(같은 파일을 두
 * 스레드가 옮기면 경로가 어긋난다).
 */
@Component
public class ReclassificationTrigger {

    private static final Logger log = LoggerFactory.getLogger(ReclassificationTrigger.class);

    private static final String NAME = "reclassification";

    private final BackgroundScheduler scheduler;
    private final ReclassificationJob job;
    private final String cron;

    /** 컨텍스트가 닫힌 뒤에 다음 예약을 걸지 않기 위한 스위치. */
    private final AtomicBoolean running = new AtomicBoolean(false);

    private CronExpression expression;

    public ReclassificationTrigger(BackgroundScheduler scheduler,
                                   ReclassificationJob job,
                                   @Value("${reclassification.cron:}") String cron) {
        this.scheduler = scheduler;
        this.job = job;
        this.cron = cron;
    }

    @PostConstruct
    public void start() {
        if (cron == null || cron.trim().isEmpty()) {
            // 끄는 것을 지원한다 — 내부망에서 재분류를 배치로 돌리기로 하면 이 값을 비운다.
            log.warn("reclassification.cron 이 비어 있다 — 자동 재분류를 하지 않는다.");
            return;
        }
        try {
            this.expression = CronExpression.parse(cron.trim());
        } catch (IllegalArgumentException e) {
            // 기동 때 소리 내어 죽는다. 조용히 넘기면 "왜 재분류가 안 되지"로 남는다.
            throw new IllegalStateException(
                    "reclassification.cron 을 해석하지 못했다: '" + cron + "'", e);
        }
        running.set(true);
        log.info("자동 재분류: cron='{}' · 실행 방식={}", cron.trim(), scheduler.describe());
        scheduleNext();
    }

    @PreDestroy
    public void stop() {
        running.set(false);
    }

    /** 다음 cron 시각까지의 지연으로 1회성 예약을 건다. */
    private void scheduleNext() {
        if (!running.get()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime next = expression.next(now);
        if (next == null) {
            // 예: 지나간 날짜만 가리키는 식. 더 돌 일이 없다.
            log.warn("cron '{}' 에 다음 실행 시각이 없다 — 자동 재분류를 멈춘다.", cron);
            running.set(false);
            return;
        }
        long delay = Duration.between(now, next).toMillis();
        scheduler.scheduleOnce(NAME, delay, this::runOnce);
    }

    /** 한 번 돌고, 성패와 무관하게 다음을 예약한다. */
    void runOnce() {
        try {
            job.reclassify();
        } catch (RuntimeException e) {
            log.warn("자동 재분류가 예외로 끝났다 — 다음 주기에 다시 시도한다.", e);
        } finally {
            scheduleNext();
        }
    }
}
