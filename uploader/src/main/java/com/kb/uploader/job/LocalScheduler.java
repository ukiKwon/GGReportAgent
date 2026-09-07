package com.kb.uploader.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

/**
 * 자바 표준 스케줄러로 예약 — TimerManager 가 없는 곳(외부망 로컬·테스트)의 폴백.
 *
 * <p>⚠️ <b>이것도 스레드를 만든다.</b> 그게 원래 문제였다는 점에서 모순처럼 보이지만,
 * 이 구현은 <b>WAS 밖에서만</b> 쓰인다 — 컨테이너가 없으니 맡길 곳도 없다.
 * <b>운영(WebLogic)에서 이 구현이 쓰이면 설정이 잘못된 것</b>이고, 그래서 선택 시점에
 * 경고를 남긴다({@code SchedulerConfig}).
 *
 * <p>스레드는 <b>데몬</b>이다. 로컬에서 Ctrl+C 로 껐을 때 JVM 이 안 죽는 일을 막는다.
 * 컨텍스트가 닫히면 {@link #shutdown()} 이 불려 정리된다.
 */
public class LocalScheduler implements BackgroundScheduler {

    private static final Logger log = LoggerFactory.getLogger(LocalScheduler.class);

    private final ScheduledExecutorService executor;

    public LocalScheduler() {
        this.executor = Executors.newSingleThreadScheduledExecutor(new ThreadFactory() {
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "uploader-local-scheduler");
                t.setDaemon(true);
                return t;
            }
        });
    }

    @Override
    public void scheduleOnce(String name, long delayMillis, Runnable work) {
        long delay = Math.max(0L, delayMillis);
        if (executor.isShutdown()) {
            log.debug("스케줄러가 이미 닫혀 예약하지 않는다: {}", name);
            return;
        }
        executor.schedule(new Runnable() {
            @Override
            public void run() {
                try {
                    work.run();
                } catch (RuntimeException e) {
                    // ScheduledExecutorService 는 예외가 나가면 그 작업을 버린다.
                    // TimerManagerScheduler 와 같은 이유로 여기서 끊는다.
                    log.warn("예약 작업이 예외로 끝났다: {}", name, e);
                }
            }
        }, delay, TimeUnit.MILLISECONDS);
        log.debug("로컬 스케줄러에 예약했다: {} ({}ms 뒤)", name, delay);
    }

    @Override
    public String describe() {
        return "local ScheduledExecutorService (TimerManager 없음)";
    }

    /** 컨텍스트 종료 시 스레드를 정리한다. */
    public void shutdown() {
        executor.shutdownNow();
    }
}
