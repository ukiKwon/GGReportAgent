package com.kb.uploader.job;

import commonj.timers.Timer;
import commonj.timers.TimerListener;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * TimerManager 배선의 <b>리플렉션 규약</b>을 WebLogic 없이 검증한다.
 *
 * <p>{@code commonj.timers.*} 는 WAS 가 주는 인터페이스라 컴파일 의존성으로 넣을 수
 * 없다(오프라인 빌드가 합격 기준이고 {@code .m2} 에 없다). 그래서 스케줄러는 이름으로
 * 찾아 동적 프록시를 만드는데, <b>그 규약이 틀리면 내부망 첫 배포에서야 터진다.</b>
 * 여기서는 같은 이름의 테스트 스텁({@code src/test/java/commonj/timers/})을 두어
 * 그 경로를 미리 밟아 본다. 본체 {@code WorkManagerExecutorTest} 와 같은 방식이다.
 *
 * <p>⚠️ 이 테스트가 통과한다고 <b>WebLogic 에서 도는 것이 증명되지는 않는다</b> —
 * 스텁의 시그니처가 진짜 규격과 같다는 전제 위에 있다. 여기서 잡는 것은
 * "메서드 이름·프록시 생성·지연 전달·예외 처리"까지다.
 */
public class TimerManagerSchedulerTest {

    /** {@code schedule(TimerListener, long)} 하나만 가진 가짜 TimerManager. */
    public static final class FakeTimerManager {
        final List<TimerListener> listeners = new ArrayList<TimerListener>();
        final List<Long> delays = new ArrayList<Long>();

        public Timer schedule(TimerListener listener, long delay) {
            listeners.add(listener);
            delays.add(Long.valueOf(delay));
            return null;
        }
    }

    /** 제출은 받지만 언제나 실패하는 것 — 삼키면 안 되는 경로다. */
    public static final class BrokenTimerManager {
        public Timer schedule(TimerListener listener, long delay) {
            throw new IllegalStateException("타이머 큐가 가득 찼다");
        }
    }

    /** {@code schedule} 이 아예 없는 것 — JNDI 이름을 잘못 걸었을 때다. */
    public static final class NotATimerManager {
    }

    @Test
    public void 예약하면_TimerListener_프록시가_TimerManager로_간다() {
        FakeTimerManager manager = new FakeTimerManager();
        BackgroundScheduler scheduler = new TimerManagerScheduler(manager, "timer/test");

        final List<String> ran = new ArrayList<String>();
        scheduler.scheduleOnce("reclassification", 5000L, new Runnable() {
            @Override
            public void run() {
                ran.add("일했다");
            }
        });

        assertEquals("예약이 안 됐다", 1, manager.listeners.size());
        assertEquals("지연이 그대로 전달돼야 한다", Long.valueOf(5000L), manager.delays.get(0));
        assertTrue("예약만 하고 아직 실행 전이어야 한다", ran.isEmpty());

        // 컨테이너가 시각이 됐다고 부르는 시점.
        manager.listeners.get(0).timerExpired(null);
        assertEquals("실행돼야 한다", 1, ran.size());
    }

    @Test
    public void 음수_지연은_0으로_보정한다() {
        FakeTimerManager manager = new FakeTimerManager();
        BackgroundScheduler scheduler = new TimerManagerScheduler(manager, "timer/test");

        scheduler.scheduleOnce("reclassification", -1L, new Runnable() {
            @Override
            public void run() {
            }
        });

        assertEquals(Long.valueOf(0L), manager.delays.get(0));
    }

    @Test
    public void 작업이_던진_예외는_컨테이너로_새지_않는다() {
        FakeTimerManager manager = new FakeTimerManager();
        BackgroundScheduler scheduler = new TimerManagerScheduler(manager, "timer/test");

        scheduler.scheduleOnce("reclassification", 0L, new Runnable() {
            @Override
            public void run() {
                throw new IllegalStateException("분류 중 터졌다");
            }
        });

        // 예외가 밖으로 나가면 WAS 가 타이머를 취소할 수 있다 — 재분류가 영영 멈춘다.
        manager.listeners.get(0).timerExpired(null);
    }

    @Test
    public void 예약_실패는_삼키지_않는다() {
        BackgroundScheduler scheduler =
                new TimerManagerScheduler(new BrokenTimerManager(), "timer/test");
        try {
            scheduler.scheduleOnce("reclassification", 0L, new Runnable() {
                @Override
                public void run() {
                }
            });
            fail("예약 실패인데 예외가 안 났다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("reclassification"));
        }
    }

    @Test
    public void TimerManager_가_아니면_생성_시점에_죽는다() {
        try {
            new TimerManagerScheduler(new NotATimerManager(), "timer/wrong");
            fail("schedule 이 없는 객체인데 예외가 안 났다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("timer/wrong"));
        }
    }

    @Test
    public void 진단_이름에_JNDI_가_들어간다() {
        BackgroundScheduler scheduler =
                new TimerManagerScheduler(new FakeTimerManager(), "timer/uploaderTM");
        assertTrue(scheduler.describe().contains("timer/uploaderTM"));
    }
}
