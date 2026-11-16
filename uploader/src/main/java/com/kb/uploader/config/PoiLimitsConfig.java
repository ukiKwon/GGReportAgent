package com.kb.uploader.config;

import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;

/** POI 압축 폭탄 2차 방어(출처: kgi-ggreport-web config/PoiLimitsConfig, NEXT 39). 1차는 parse/ZipGuard. */
@Configuration
public class PoiLimitsConfig {
    static final double MIN_INFLATE_RATIO = 0.01d;
    static final long MAX_ENTRY_SIZE = 100L * 1024 * 1024;

    @PostConstruct
    public void apply() {
        ZipSecureFile.setMinInflateRatio(MIN_INFLATE_RATIO);
        ZipSecureFile.setMaxEntrySize(MAX_ENTRY_SIZE);
    }
}
