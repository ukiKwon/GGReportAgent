package com.kbstar.kgi.ggreport.web.config;

import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;

/**
 * POI(OOXML=zip) 폭탄 방어 — 앱 시작 시 한 번 전역으로 건다.
 *
 * <p>업로드를 읽는 곳: 이사회 자료 작성(BoardWriteService → XlsxBook). 그쪽은 POI 로 열기 전에 ZipGuard 로
 * 실제 압축 해제량(entry 20MB·합계 40MB)과 중복 entry 를 먼저 검사한다 — 이 전역값은 그 뒤의 2차 방어다.
 */
@Configuration
public class PoiLimitsConfig {

    /** 압축 비율 하한 — 이보다 심하게 부풀어 오르는 entry 는 폭탄으로 보고 거부한다(POI 기본과 같게 고정). */
    static final double MIN_INFLATE_RATIO = 0.01d;
    /** entry 하나가 풀려서 가질 수 있는 최대 크기 — 100MB (POI 기본 4GB 는 과하다). */
    static final long MAX_ENTRY_SIZE = 100L * 1024 * 1024;

    @PostConstruct
    public void apply() {
        ZipSecureFile.setMinInflateRatio(MIN_INFLATE_RATIO);
        ZipSecureFile.setMaxEntrySize(MAX_ENTRY_SIZE);
    }
}
