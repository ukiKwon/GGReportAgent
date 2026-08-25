package com.kb.uploader.job;

import com.kb.uploader.domain.UploadedFile;
import com.kb.uploader.mapper.UploadedFileMapper;
import com.kb.uploader.service.ClassificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

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

    @Scheduled(cron = "${reclassification.cron}")
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
