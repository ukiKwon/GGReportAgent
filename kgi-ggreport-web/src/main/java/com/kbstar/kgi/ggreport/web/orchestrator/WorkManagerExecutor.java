package com.kbstar.kgi.ggreport.web.orchestrator;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * CommonJ WorkManager 로 백그라운드 실행 — 설계 §2·§4의 "WAS 에서 앱이 raw thread 를
 * 만드는 것은 금지".
 *
 * <h3>⚠️ 왜 리플렉션인가</h3>
 * {@code commonj.work.WorkManager}·{@code commonj.work.Work} 는 <b>WebLogic 이 제공하는
 * API</b>다. 이 리포는 <b>오프라인 빌드가 합격 기준</b>이고({@code mvn -o}) 그 jar 는
 * 로컬 {@code .m2} 에 <b>없다</b>(실측 2026-08-27). 컴파일 의존성으로 넣으면
 * ⓐ 오프라인 빌드가 깨지고 ⓑ 폐쇄망 반입 목록이 늘어난다.
 *
 * <p>그래서 JNDI 로 받은 객체의 {@code schedule(Work)} 를 <b>리플렉션으로</b> 부르고,
 * {@code Work} 는 그 인터페이스를 <b>동적 프록시</b>로 만들어 넘긴다. 컴파일 시점에
 * {@code commonj} 를 몰라도 되고, WebLogic 위에서는 진짜 API 를 그대로 쓴다.
 *
 * <p>⚠️ <b>이 클래스는 WebLogic 에서만 실검증된다.</b> 로컬·테스트에서는 JNDI 조회가
 * 실패해 {@link CallerRunsExecutor} 로 떨어지므로 여기 코드가 아예 안 돈다 — 내부망
 * 첫 배포에서 처음 실행되는 자리다(설계 §8 의 "Oracle 과 같은 취급").
 *
 * <h3>Work 인터페이스가 요구하는 것</h3>
 * <ul>
 *   <li>{@code void run()} — 실제 일(부모 {@code Runnable})</li>
 *   <li>{@code boolean isDaemon()} — 오래 도는 일인가. <b>false</b> 다: 한 번의
 *       {@code advance} 는 게이트까지만 가고 끝난다(데몬이면 WAS 종료를 붙잡는다)</li>
 *   <li>{@code void release()} — 서버가 중단을 요청할 때. 여기서는 <b>아무것도 안 한다</b>
 *       — 중간에 끊긴 실행은 {@code ORCH_RUN} 이 {@code RUNNING} 인 채로 남고, 그게
 *       "재기동 뒤 손봐야 할 것"의 표시다(조용히 되돌리는 것보다 낫다)</li>
 * </ul>
 */
public class WorkManagerExecutor implements BackgroundExecutor {

    private static final Logger log = LoggerFactory.getLogger(WorkManagerExecutor.class);

    private final Object workManager;
    private final String jndiName;
    private final Class<?> workInterface;
    private final Method scheduleMethod;

    /**
     * @param workManager JNDI 로 받은 {@code commonj.work.WorkManager}
     * @throws IllegalStateException {@code commonj} 클래스가 없거나 규격이 다르면
     */
    public WorkManagerExecutor(Object workManager, String jndiName) {
        this.workManager = workManager;
        this.jndiName = jndiName;
        try {
            ClassLoader loader = workManager.getClass().getClassLoader();
            this.workInterface = Class.forName("commonj.work.Work", true, loader);
            this.scheduleMethod = workManager.getClass().getMethod("schedule", workInterface);
        } catch (ClassNotFoundException | NoSuchMethodException e) {
            throw new IllegalStateException(
                    "JNDI(" + jndiName + ")에서 받은 객체가 CommonJ WorkManager 가 아니다: "
                            + workManager.getClass().getName(), e);
        }
    }

    @Override
    public void execute(String name, Runnable work) {
        Object proxy = Proxy.newProxyInstance(
                workInterface.getClassLoader(), new Class<?>[]{workInterface},
                new WorkInvocationHandler(name, work));
        try {
            scheduleMethod.invoke(workManager, proxy);
            log.debug("WorkManager 에 제출했다: {}", name);
        } catch (Exception e) {
            // 제출 실패는 삼키지 않는다 — 삼키면 "시작했다"고 202 를 돌려준 뒤
            // 아무 일도 일어나지 않고, 화면은 영원히 대기로 남는다.
            throw new IllegalStateException("WorkManager 제출에 실패했다: " + name, e);
        }
    }

    @Override
    public String describe() {
        return "CommonJ WorkManager (" + jndiName + ")";
    }

    /** {@code commonj.work.Work} 의 세 메서드를 부모 {@link Runnable} 위에 얹는다. */
    private static final class WorkInvocationHandler implements InvocationHandler {

        private final String name;
        private final Runnable work;

        WorkInvocationHandler(String name, Runnable work) {
            this.name = name;
            this.work = work;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            switch (method.getName()) {
                case "run":
                    try {
                        work.run();
                    } catch (RuntimeException e) {
                        // ⚠️ 여기서 예외가 밖으로 나가면 WAS 로그에만 남고 아무도 못 본다.
                        //    엔진이 이미 RUN 을 FAILED 로 적으므로 여기서는 로그만 남긴다.
                        log.warn("백그라운드 실행이 예외로 끝났다: {}", name, e);
                    }
                    return null;
                case "isDaemon":
                    return Boolean.FALSE;
                case "release":
                    return null;
                case "toString":
                    return "Work(" + name + ")";
                case "hashCode":
                    return Integer.valueOf(System.identityHashCode(proxy));
                case "equals":
                    return Boolean.valueOf(proxy == (args == null ? null : args[0]));
                default:
                    throw new UnsupportedOperationException(
                            "commonj.work.Work 규격이 바뀌었다: " + method.getName());
            }
        }
    }
}
