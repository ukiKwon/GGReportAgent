package commonj.timers;

/**
 * ⚠️ <b>테스트 전용 스텁이다.</b> 진짜 {@code commonj.timers.Timer} 는 WebLogic 이 준다.
 *
 * <p>{@code TimerManager.schedule(...)} 의 반환형이자 {@code TimerListener.timerExpired}
 * 의 인자라 규격을 맞추려고 둔다. 우리 코드는 이 객체를 <b>쓰지 않는다</b> — 취소를
 * 하지 않기 때문이다(반복은 매번 새로 예약하는 방식이라 취소할 핸들이 필요 없다).
 *
 * <p><b>운영 WAR 에는 들어가지 않는다</b>({@code src/test/java} 다). WebLogic 위에서는
 * 컨테이너가 주는 진짜 인터페이스가 잡힌다 — {@code weblogic.xml} 의
 * {@code prefer-application-packages} 에 {@code commonj} 를 <b>넣지 말 것</b>.
 */
public interface Timer {

    /** 예약을 취소한다. */
    boolean cancel();

    /** 마지막으로 실행된 시각(epoch millis). */
    long getScheduledExecutionTime();

    /** 이 타이머에 걸린 리스너. */
    TimerListener getTimerListener();
}
