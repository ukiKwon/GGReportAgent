package com.kbstar.kgi.ggreport.web.orchestrator;

import commonj.work.Work;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * WorkManager 배선의 <b>리플렉션 규약</b>을 WebLogic 없이 검증한다 — Task 4.2.
 *
 * <p>{@code commonj.work.Work} 는 WAS 가 주는 인터페이스라 컴파일 의존성으로 넣을 수
 * 없다(오프라인 빌드가 합격 기준이고 {@code .m2} 에 없다). 그래서 실행기는 이름으로
 * 찾아 동적 프록시를 만드는데, <b>그 규약이 틀리면 내부망 첫 배포에서야 터진다.</b>
 * 여기서는 같은 이름의 테스트 스텁({@code src/test/java/commonj/work/Work.java})을 두어
 * 그 경로를 미리 밟아 본다.
 *
 * <p>⚠️ 이 테스트가 통과한다고 <b>WebLogic 에서 도는 것이 증명되지는 않는다</b> —
 * 스텁의 시그니처가 진짜 규격과 같다는 전제 위에 있다(설계 §8 의 H2↔Oracle 과 같은
 * 취급). 여기서 잡는 것은 "메서드 이름·프록시 생성·예외 처리"까지다.
 */
public class WorkManagerExecutorTest {

    /** {@code schedule(Work)} 하나만 가진 가짜 WorkManager. */
    public static final class FakeWorkManager {
        private final List<Work> scheduled = new ArrayList<Work>();

        public void schedule(Work work) {
            scheduled.add(work);
        }
    }

    /** 제출은 되지만 언제나 실패하는 것 — 삼키면 안 되는 경로다. */
    public static final class BrokenWorkManager {
        public void schedule(Work work) {
            throw new IllegalStateException("큐가 가득 찼다");
        }
    }

    @Test
    public void 제출하면_Work_프록시가_WorkManager로_간다() {
        FakeWorkManager manager = new FakeWorkManager();
        BackgroundExecutor executor = new WorkManagerExecutor(manager, "wm/test");

        final List<String> ran = new ArrayList<String>();
        executor.execute("orch:run-1", new Runnable() {
            @Override
            public void run() {
                ran.add("일했다");
            }
        });

        assertEquals("제출이 안 됐다", 1, manager.scheduled.size());
        assertTrue("제출만 하고 아직 실행 전이어야 한다", ran.isEmpty());

        Work work = manager.scheduled.get(0);
        work.run();
        assertEquals(java.util.Collections.singletonList("일했다"), ran);
    }

    /**
     * ⚠️ <b>데몬이 아니다.</b> 한 번의 실행은 게이트까지만 가고 끝난다 — 데몬으로
     * 표시하면 WAS 종료를 붙잡는다.
     */
    @Test
    public void 데몬이_아니고_release는_아무것도_안_한다() {
        FakeWorkManager manager = new FakeWorkManager();
        new WorkManagerExecutor(manager, "wm/test").execute("orch:run-1", noop());

        Work work = manager.scheduled.get(0);
        assertFalse("데몬으로 표시하면 WAS 종료를 붙잡는다", work.isDaemon());
        work.release();   // 예외가 나면 안 된다 — 중단 요청은 무시하는 것이 설계다
    }

    /**
     * 일이 예외로 끝나도 <b>WorkManager 쪽으로는 안 던진다.</b> 엔진이 이미 RUN 을
     * {@code FAILED} 로 적었고, 여기서 더 던지면 WAS 로그에만 남아 아무도 못 본다.
     */
    @Test
    public void 일이_실패해도_밖으로_던지지_않는다() {
        FakeWorkManager manager = new FakeWorkManager();
        new WorkManagerExecutor(manager, "wm/test").execute("orch:run-1", new Runnable() {
            @Override
            public void run() {
                throw new IllegalStateException("노드가 죽었다");
            }
        });

        manager.scheduled.get(0).run();   // 예외가 새어 나오면 이 줄에서 실패한다
    }

    /**
     * <b>제출 실패는 삼키지 않는다.</b> 삼키면 "시작했다"고 202 를 돌려준 뒤 아무 일도
     * 일어나지 않고, 화면은 영원히 대기로 남는다.
     */
    @Test
    public void 제출_실패는_소리내어_죽는다() {
        BackgroundExecutor executor = new WorkManagerExecutor(new BrokenWorkManager(), "wm/test");
        try {
            executor.execute("orch:run-1", noop());
            fail("제출 실패를 삼켰다 — 화면이 영원히 대기로 남는다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage(), expected.getMessage().contains("WorkManager 제출"));
        }
    }

    /** JNDI 가 엉뚱한 것을 돌려주면 기동 때 드러나야 한다(조용히 폴백하지 않는다). */
    @Test
    public void WorkManager가_아니면_만들_때_죽는다() {
        try {
            new WorkManagerExecutor("이건 문자열이다", "wm/test");
            fail("schedule(Work) 도 없는 객체를 받아들였다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage(),
                    expected.getMessage().contains("CommonJ WorkManager 가 아니다"));
        }
    }

    @Test
    public void 폴백은_호출_스레드에서_바로_돈다() {
        final List<String> ran = new ArrayList<String>();
        BackgroundExecutor executor = new CallerRunsExecutor();

        executor.execute("orch:run-1", new Runnable() {
            @Override
            public void run() {
                ran.add("일했다");
            }
        });

        assertEquals("폴백은 제출이 아니라 즉시 실행이다", 1, ran.size());
        assertTrue(executor.describe(), executor.describe().contains("caller-runs"));
    }

    private static Runnable noop() {
        return new Runnable() {
            @Override
            public void run() {
            }
        };
    }
}
