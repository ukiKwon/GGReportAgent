package com.kbstar.kgi.ggreport.web.orchestrator;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 호출 스레드에서 그대로 돌린다 — WorkManager 가 없는 곳(외부망 로컬·테스트)의 폴백.
 *
 * <p>⚠️ <b>응답이 게이트까지 붙잡힌다.</b> {@code POST /run} 이 202 를 돌려주기까지
 * 첫 게이트에 닿는 시간이 걸린다는 뜻이다 — 노드가 LLM 을 부르기 시작하면 수십 초가
 * 될 수 있다. <b>운영(WebLogic)에서는 이 구현이 쓰이면 안 된다.</b>
 * 그래서 선택 시점에 경고를 남긴다({@link OrchestratorExecutorConfig}).
 *
 * <p>대신 얻는 것: 호출자의 트랜잭션·보안 컨텍스트를 그대로 물려받아, 테스트가
 * {@code @Transactional} 롤백으로 뒷정리를 할 수 있다.
 */
public class CallerRunsExecutor implements BackgroundExecutor {

    private static final Logger log = LoggerFactory.getLogger(CallerRunsExecutor.class);

    @Override
    public void execute(String name, Runnable work) {
        log.debug("호출 스레드에서 실행한다: {}", name);
        work.run();
    }

    @Override
    public String describe() {
        return "caller-runs (WorkManager 없음)";
    }
}
