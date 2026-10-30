package com.kbstar.kgi.ggreport.web.config;

import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;

/**
 * POI(OOXML=zip) 폭탄 방어 — 앱 시작 시 한 번 전역으로 건다.
 *
 * <p>현재 POI 로 <b>업로드를 읽는 곳은 없다</b>(docfill 은 미연결, PptxBuilder 는 생성 전용). 이 설정은 업로드에
 * 연결될 때를 대비한 선제 방어다. 값은 정적(전역)이라 한 번 걸면 JVM 전체에 적용된다.
 * <p>boarddoc 쪽에 별도 한도가 필요하면 그쪽 세션이 끝난 뒤 이 값을 같이 본다.
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
