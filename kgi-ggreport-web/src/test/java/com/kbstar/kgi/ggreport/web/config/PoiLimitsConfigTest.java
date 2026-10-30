package com.kbstar.kgi.ggreport.web.config;

import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class PoiLimitsConfigTest {

    @Test
    public void 시작_시_ZipSecureFile_한도를_건다() {
        new PoiLimitsConfig().apply();
        assertEquals(0.01d, ZipSecureFile.getMinInflateRatio(), 0.0);
        assertEquals(100L * 1024 * 1024, ZipSecureFile.getMaxEntrySize());
    }
}
