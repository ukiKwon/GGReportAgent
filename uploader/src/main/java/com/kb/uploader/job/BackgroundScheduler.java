package com.kb.uploader.job;

/**
 * 반복 작업을 <b>WAS 가 관리하는 스레드에서</b> 돌리는 자리.
 *
 * <p><b>왜 있는가.</b> 원래는 {@code @EnableScheduling} + {@code @Scheduled(cron)} 이었다.
 * 그러면 Spring 이 <b>자기 타이머 스레드 풀을 직접 만든다</b> — WAS 에서 앱이 스레드를
 * 만드는 것은 금지 사항이다(설계 §2·§4). 컨테이너가 모르는 스레드는
 * ⓐ 재배포해도 안 죽어 클래스로더가 새고 ⓑ 트랜잭션·보안 컨텍스트·JNDI 환경이
 * 안 실리며 ⓒ WAS 콘솔 모니터링과 스레드 덤프에 안 잡힌다.
 *
 * <p>WebLogic 에서는 CommonJ <b>TimerManager</b> 로 옮긴다
 * ({@link TimerManagerScheduler}). 반복 실행이므로 {@code commonj.work.WorkManager}
 * (1회성 작업용, 본체 오케스트레이터가 쓰는 것)가 아니라 {@code commonj.timers} 쪽이다.
 *
 * <p>WAS 밖(외부망 로컬·테스트)에는 TimerManager 가 없다. 그때는 자바 표준
 * 스케줄러로 떨어진다({@link LocalScheduler}) — 동작은 같고, <b>운영에서 이쪽이
 * 쓰이면 안 된다.</b>
 *
 * <p>⚠️ <b>1회성 예약만 제공한다.</b> 주기 반복은 {@link ReclassificationTrigger} 가
 * "한 번 돌고 다음 시각을 다시 예약"하는 방식으로 만든다 — 그래야 주기의 근거가
 * {@code reclassification.cron} <b>한 곳</b>으로 유지된다(TimerManager 의 고정 주기
 * 파라미터를 쓰면 cron 과 밀리초 주기가 따로 놀아 갈린다).
 */
public interface BackgroundScheduler {

    /**
     * {@code delayMillis} 뒤에 <b>한 번</b> 실행한다.
     *
     * @param name        무엇을 돌리는지 — 로그·WAS 진단에 쓰인다
     * @param delayMillis 지금부터의 지연(밀리초). 음수면 0 으로 본다
     */
    void scheduleOnce(String name, long delayMillis, Runnable work);

    /** 진단용 이름. 기동 로그에서 "지금 어느 방식으로 도는가"를 본다. */
    String describe();
}
