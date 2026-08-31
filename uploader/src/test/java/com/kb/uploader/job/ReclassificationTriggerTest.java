package com.kb.uploader.job;

import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.ClassificationService;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * "한 번 돌고 다음을 다시 예약"하는 반복 규약을 본다 — 시계를 기다리지 않고 검증한다.
 *
 * <p>여기서 지키려는 것은 하나다: <b>한 번 실패했다고 반복이 멈추면 안 된다.</b>
 * 그러면 증상이 "미분류 파일이 계속 쌓인다"로만 나타나 원인을 찾기 어렵다.
 */
public class ReclassificationTriggerTest {

    /** 예약을 받아 두기만 하고 돌리지는 않는 스케줄러. */
    private static final class RecordingScheduler implements BackgroundScheduler {
        final List<Long> delays = new ArrayList<Long>();
        final List<Runnable> works = new ArrayList<Runnable>();

        @Override
        public void scheduleOnce(String name, long delayMillis, Runnable work) {
            delays.add(Long.valueOf(delayMillis));
            works.add(work);
        }

        @Override
        public String describe() {
            return "recording";
        }
    }

    private static ReclassificationJob jobThatWorks() {
        UploadedFileMapper mapper = mock(UploadedFileMapper.class);
        when(mapper.findByStatus("UNCLASSIFIED")).thenReturn(Collections.emptyList());
        return new ReclassificationJob(mapper, mock(ClassificationService.class));
    }

    private static ReclassificationJob jobThatThrows() {
        UploadedFileMapper mapper = mock(UploadedFileMapper.class);
        when(mapper.findByStatus("UNCLASSIFIED"))
                .thenThrow(new IllegalStateException("DB 가 죽었다"));
        return new ReclassificationJob(mapper, mock(ClassificationService.class));
    }

    @Test
    public void 기동하면_다음_cron_시각으로_한_번_예약한다() {
        RecordingScheduler scheduler = new RecordingScheduler();
        new ReclassificationTrigger(scheduler, jobThatWorks(), "0 */5 * * * *").start();

        assertEquals("기동 직후 예약이 하나 있어야 한다", 1, scheduler.works.size());
        long delay = scheduler.delays.get(0).longValue();
        assertTrue("지연이 음수다: " + delay, delay >= 0);
        assertTrue("5분 주기인데 지연이 너무 크다: " + delay, delay <= 5 * 60 * 1000L);
    }

    @Test
    public void 한_번_돌면_다음을_다시_예약한다() {
        RecordingScheduler scheduler = new RecordingScheduler();
        new ReclassificationTrigger(scheduler, jobThatWorks(), "0 */5 * * * *").start();

        scheduler.works.get(0).run();

        assertEquals("실행 뒤 다음 예약이 없다 — 반복이 한 번에 끝난다",
                2, scheduler.works.size());
    }

    @Test
    public void 작업이_실패해도_다음을_예약한다() {
        RecordingScheduler scheduler = new RecordingScheduler();
        new ReclassificationTrigger(scheduler, jobThatThrows(), "0 */5 * * * *").start();

        scheduler.works.get(0).run();

        assertEquals("실패했다고 반복이 멈추면 미분류가 영영 쌓인다",
                2, scheduler.works.size());
    }

    @Test
    public void 종료된_뒤에는_다시_예약하지_않는다() {
        RecordingScheduler scheduler = new RecordingScheduler();
        ReclassificationTrigger trigger =
                new ReclassificationTrigger(scheduler, jobThatWorks(), "0 */5 * * * *");
        trigger.start();
        trigger.stop();

        scheduler.works.get(0).run();

        assertEquals("컨텍스트가 닫혔는데 예약이 늘었다", 1, scheduler.works.size());
    }

    @Test
    public void cron_이_비면_아무것도_예약하지_않는다() {
        RecordingScheduler scheduler = new RecordingScheduler();
        new ReclassificationTrigger(scheduler, jobThatWorks(), "  ").start();

        assertTrue("끄기로 했는데 예약이 걸렸다", scheduler.works.isEmpty());
    }

    @Test
    public void 잘못된_cron_은_기동_때_죽는다() {
        try {
            new ReclassificationTrigger(new RecordingScheduler(), jobThatWorks(), "매 5분").start();
            fail("해석 불가한 cron 인데 예외가 안 났다");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("매 5분"));
        }
    }
}
