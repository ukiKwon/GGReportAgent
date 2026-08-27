package commonj.work;

/**
 * ⚠️ <b>테스트 전용 스텁이다.</b> 진짜 {@code commonj.work.Work} 는 WebLogic 이 준다.
 *
 * <p>{@code WorkManagerExecutor} 는 이 인터페이스를 <b>이름으로</b> 찾아
 * ({@code Class.forName("commonj.work.Work")}) 동적 프록시를 만든다 — 그 리플렉션
 * 규약을 WebLogic 없이 검증하려고 여기 같은 이름으로 둔다.
 *
 * <p><b>운영 WAR 에는 들어가지 않는다</b>({@code src/test/java} 다). WebLogic 위에서는
 * 컨테이너가 주는 진짜 인터페이스가 잡힌다 — {@code weblogic.xml} 의
 * {@code prefer-application-packages} 에 {@code commonj} 를 <b>넣지 말 것</b>.
 *
 * <p>메서드 시그니처는 CommonJ(JSR 237) 규격 그대로다. 여기가 규격과 어긋나면
 * 테스트는 통과하고 내부망에서만 터진다.
 */
public interface Work extends Runnable {

    /** 오래 도는 일인가. 우리 실행은 게이트까지만 가므로 false 다. */
    boolean isDaemon();

    /** 서버가 중단을 요청한다. */
    void release();
}
