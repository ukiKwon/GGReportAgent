package com.kb.uploader.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * CommonJ TimerManager 로 예약 — 설계 §2·§4의 "WAS 에서 앱이 raw thread 를 만드는 것은
 * 금지".
 *
 * <h3>⚠️ 왜 리플렉션인가</h3>
 * {@code commonj.timers.TimerManager}·{@code TimerListener} 는 <b>WebLogic 이 제공하는
 * API</b>다. 이 리포는 <b>오프라인 빌드가 합격 기준</b>이고({@code mvn -o}) 그 jar 는
 * 로컬 {@code .m2} 에 <b>없다</b>. 컴파일 의존성으로 넣으면 ⓐ 오프라인 빌드가 깨지고
 * ⓑ 폐쇄망 반입 목록이 늘어난다. 본체({@code kgi-ggreport-web})의
 * {@code WorkManagerExecutor} 와 같은 이유·같은 방식이다.
 *
 * <p>그래서 JNDI 로 받은 객체의 {@code schedule(TimerListener, long)} 을 리플렉션으로
 * 부르고, {@code TimerListener} 는 그 인터페이스를 <b>동적 프록시</b>로 만들어 넘긴다.
 *
 * <p>⚠️ <b>이 클래스는 WebLogic 에서만 실검증된다.</b> 로컬·테스트에서는 JNDI 조회가
 * 실패해 {@link LocalScheduler} 로 떨어지므로 여기 코드가 아예 안 돈다 — 내부망 첫
 * 배포에서 처음 실행되는 자리다. 그 공백을 조금이라도 메우려고
 * {@code src/test/java/commonj/timers/} 에 같은 이름의 스텁을 두고 리플렉션 규약만
 * 미리 밟아 본다({@code TimerManagerSchedulerTest}).
 */
public class TimerManagerScheduler implements BackgroundScheduler {

    private static final Logger log = LoggerFactory.getLogger(TimerManagerScheduler.class);

    private final Object timerManager;
    private final String jndiName;
    private final Class<?> listenerInterface;
    private final Method scheduleMethod;

    /**
     * @param timerManager JNDI 로 받은 {@code commonj.timers.TimerManager}
     * @throws IllegalStateException {@code commonj} 클래스가 없거나 규격이 다르면
     */
    public TimerManagerScheduler(Object timerManager, String jndiName) {
        this.timerManager = timerManager;
        this.jndiName = jndiName;
        try {
            ClassLoader loader = timerManager.getClass().getClassLoader();
            this.listenerInterface = Class.forName("commonj.timers.TimerListener", true, loader);
            // schedule(TimerListener, long delay) — 1회성. 주기는 우리가 다시 예약한다.
            this.scheduleMethod = timerManager.getClass()
                    .getMethod("schedule", listenerInterface, long.class);
        } catch (ClassNotFoundException | NoSuchMethodException e) {
            throw new IllegalStateException(
                    "JNDI(" + jndiName + ")에서 받은 객체가 CommonJ TimerManager 가 아니다: "
                            + timerManager.getClass().getName(), e);
        }
    }

    @Override
    public void scheduleOnce(String name, long delayMillis, Runnable work) {
        long delay = Math.max(0L, delayMillis);
        Object proxy = Proxy.newProxyInstance(
                listenerInterface.getClassLoader(), new Class<?>[]{listenerInterface},
                new TimerListenerInvocationHandler(name, work));
        try {
            scheduleMethod.invoke(timerManager, proxy, Long.valueOf(delay));
            log.debug("TimerManager 에 예약했다: {} ({}ms 뒤)", name, delay);
        } catch (Exception e) {
            // 예약 실패를 삼키면 그 뒤로 **영원히 아무 일도 일어나지 않는다** —
            // 재분류가 조용히 멈추고, 미분류 파일이 쌓이는 것으로만 드러난다.
            throw new IllegalStateException("TimerManager 예약에 실패했다: " + name, e);
        }
    }

    @Override
    public String describe() {
        return "CommonJ TimerManager (" + jndiName + ")";
    }

    /** {@code commonj.timers.TimerListener} 의 {@code timerExpired(Timer)} 를 얹는다. */
    private static final class TimerListenerInvocationHandler implements InvocationHandler {

        private final String name;
        private final Runnable work;

        TimerListenerInvocationHandler(String name, Runnable work) {
            this.name = name;
            this.work = work;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            switch (method.getName()) {
                case "timerExpired":
                    try {
                        work.run();
                    } catch (RuntimeException e) {
                        // ⚠️ 예외가 밖으로 나가면 WAS 가 이 타이머를 취소할 수 있다.
                        //    한 번 실패했다고 재분류를 영영 멈추면 안 되므로 여기서 끊는다
                        //    — 다음 예약은 ReclassificationTrigger 의 finally 가 건다.
                        log.warn("예약 작업이 예외로 끝났다: {}", name, e);
                    }
                    return null;
                case "toString":
                    return "TimerListener(" + name + ")";
                case "hashCode":
                    return Integer.valueOf(System.identityHashCode(proxy));
                case "equals":
                    return Boolean.valueOf(proxy == (args == null ? null : args[0]));
                default:
                    throw new UnsupportedOperationException(
                            "commonj.timers.TimerListener 규격이 바뀌었다: " + method.getName());
            }
        }
    }
}
