package com.kb.uploader.job;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.ClassificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 미분류로 남은 파일을 다시 분류해 본다. <b>언제 도는지는 여기서 정하지 않는다.</b>
 *
 * <p>⚠️ 종전에는 이 메서드에 {@code @Scheduled(cron = "${reclassification.cron}")} 이
 * 붙어 있었다(2026-08-31 제거). 그러면 Spring 이 자기 타이머 스레드 풀을 만들고,
 * <b>WAS 에서 앱이 스레드를 만드는 것은 금지</b>다(설계 §2·§4). 반복 실행은
 * {@link ReclassificationTrigger} 가 {@link BackgroundScheduler} 를 통해 건다 —
 * WebLogic 에서는 CommonJ TimerManager 가 그 스레드를 준다.
 *
 * <p>덕분에 이 클래스는 <b>"한 번 돌리는 일"만</b> 안다. 수동 실행이 필요해지면
 * 그냥 부르면 된다.
 */
@Component
public class ReclassificationJob {

    private static final Logger log = LoggerFactory.getLogger(ReclassificationJob.class);

    private final UploadedFileMapper fileMapper;
    private final ClassificationService classificationService;

    public ReclassificationJob(UploadedFileMapper fileMapper,
                               ClassificationService classificationService) {
        this.fileMapper = fileMapper;
        this.classificationService = classificationService;
    }

    public void reclassify() {
        List<UploadedFile> unclassified = fileMapper.findByStatus("UNCLASSIFIED");
        if (unclassified.isEmpty()) {
            log.debug("재분류할 파일 없음");
            return;
        }
        int success = 0;
        for (UploadedFile file : unclassified) {
            try {
                if (classificationService.classify(file)) {
                    success++;
                }
            } catch (Exception e) {
                log.warn("재처리 실패: {} — {}", file.getOriginalName(), e.getMessage());
            }
        }
        log.info("재분류 완료: {}건 성공 / {}건 대상", success, unclassified.size());
    }
}
