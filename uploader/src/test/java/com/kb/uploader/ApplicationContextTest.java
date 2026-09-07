package com.kb.uploader;

import com.kb.uploader.job.BackgroundScheduler;
import com.kb.uploader.job.LocalScheduler;
import com.kb.uploader.job.ReclassificationTrigger;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.junit4.SpringRunner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 애플리케이션 컨텍스트가 <b>실제로 뜨는지</b> 본다. 나머지 테스트는 전부 슬라이스
 * ({@code @WebMvcTest})나 순수 단위라 <b>전체 기동 경로를 아무도 밟지 않았다.</b>
 *
 * <p>이 테스트를 넣은 계기: 2026-08-31 에 {@code @EnableScheduling} +
 * {@code @Scheduled} 를 걷어내고 {@code SchedulerConfig} 가 JNDI 조회로 실행 방식을
 * 고르도록 바꿨다. 그 배선이 깨져도 <b>단위 테스트는 전부 통과한다</b> — 기동 때만
 * 터지고, 그 기동은 내부망에서 일어난다.
 *
 * <p>⚠️ 여기서는 TimerManager 가 없으므로 {@link LocalScheduler} 폴백이 잡히는 것이
 * <b>정상</b>이다. WebLogic 에서 이쪽이 잡히면 설정이 잘못된 것이고, 그 판정은 기동
 * 로그의 WARN 이 한다.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
public class ApplicationContextTest {

    @Autowired
    private ApplicationContext context;

    @Autowired
    private BackgroundScheduler scheduler;

    @Test
    public void 컨텍스트가_뜬다() {
        assertNotNull(context);
    }

    @Test
    public void 스케줄러는_TimerManager가_없으면_로컬_폴백이다() {
        assertTrue("폴백이 아니라 " + scheduler.describe(),
                scheduler instanceof LocalScheduler);
    }

    @Test
    public void 재분류_트리거가_빈으로_있다() {
        assertNotNull(context.getBean(ReclassificationTrigger.class));
    }

    @Test
    public void Spring_자체_스케줄러는_더_이상_만들어지지_않는다() {
        // @EnableScheduling 이 남아 있으면 ScheduledAnnotationBeanPostProcessor 가
        // 등록되고, 그게 곧 "앱이 자기 타이머 스레드를 만든다"는 뜻이다.
        assertEquals("Spring 스케줄링이 다시 켜졌다 — WAS 금지 사항이다(설계 §2·§4)",
                0,
                context.getBeanNamesForType(
                        org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor.class)
                        .length);
    }
}
