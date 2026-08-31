package com.kbstar.kgi.ggreport.web.orchestrator;

/**
 * 오케스트레이터를 <b>요청 스레드 밖에서</b> 돌리는 자리 — 설계 §2·§4.
 *
 * <p>원본은 {@code threading.Thread} 였다. <b>WAS 에서 앱이 raw thread 를 만드는 것은
 * 금지 사항</b>이라(컨테이너가 그 스레드의 생명주기·보안 컨텍스트·트랜잭션을 모른다)
 * WebLogic 에서는 CommonJ WorkManager 로 옮긴다({@link WorkManagerExecutor}).
 *
 * <p>WAS 밖(외부망 로컬·테스트)에는 WorkManager 가 없다. 그때는 <b>호출 스레드에서
 * 그대로 돈다</b>({@link CallerRunsExecutor}) — 동작은 같고 응답이 늦을 뿐이다.
 */
public interface BackgroundExecutor {

    /**
     * @param name 무엇을 돌리는지 — 로그·WorkManager 진단에 쓰인다
     */
    void execute(String name, Runnable work);

    /** 진단용 이름. {@code /status} 나 로그에서 "지금 어느 방식으로 도는가"를 본다. */
    String describe();
}
