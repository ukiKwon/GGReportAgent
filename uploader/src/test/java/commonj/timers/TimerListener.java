package commonj.timers;

/**
 * ⚠️ <b>테스트 전용 스텁이다.</b> 진짜 {@code commonj.timers.TimerListener} 는
 * WebLogic 이 준다.
 *
 * <p>{@code TimerManagerScheduler} 는 이 인터페이스를 <b>이름으로</b> 찾아
 * ({@code Class.forName("commonj.timers.TimerListener")}) 동적 프록시를 만든다 —
 * 그 리플렉션 규약을 WebLogic 없이 검증하려고 여기 같은 이름으로 둔다.
 *
 * <p>메서드 시그니처는 CommonJ(JSR 236/237) 규격 그대로다. <b>여기가 규격과 어긋나면
 * 테스트는 통과하고 내부망에서만 터진다.</b>
 */
public interface TimerListener {

    /** 예약 시각이 되면 컨테이너가 부른다. */
    void timerExpired(Timer timer);
}
