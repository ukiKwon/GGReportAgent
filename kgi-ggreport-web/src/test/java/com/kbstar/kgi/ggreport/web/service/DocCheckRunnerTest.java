package com.kbstar.kgi.ggreport.web.service;

import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/** 작업함 파일 추출 문지기(NEXT 106, security S4) — 자리 제한·기다리지 않음·자리 반납. */
public class DocCheckRunnerTest {

    @Test
    public void 자리가_없으면_기다리지_않고_BUSY이고_자리는_새지_않는다() {
        final DocCheckRunner r = new DocCheckRunner(1);
        final TaskDocExtractor.Extracted[] inner = new TaskDocExtractor.Extracted[1];
        r.run("pptx", () -> {
            inner[0] = r.run("pdf", () -> new byte[0]);
            return new byte[]{1};
        });
        assertEquals("BUSY", inner[0].reason);
        assertEquals(1, r.available());
        r.shutdown();
    }

    @Test
    public void 파싱하지_않는_형식은_자리도_loader도_쓰지_않는다() {
        DocCheckRunner r = new DocCheckRunner(1);
        assertEquals("IMAGE_ONLY", r.run("png", () -> {
            throw new AssertionError("loader 불림");
        }).reason);
        assertEquals(1, r.available());
        r.shutdown();
    }

    @Test
    public void pdf가_깨져도_자리를_돌려준다() throws Exception {
        DocCheckRunner r = new DocCheckRunner(1);
        TaskDocExtractor.Extracted ex = r.run("pdf", () -> "%PDF-1.4 broken".getBytes(StandardCharsets.ISO_8859_1));
        assertEquals("BROKEN", ex.reason);
        long until = System.currentTimeMillis() + 3000;
        while (r.available() != 1 && System.currentTimeMillis() < until) {
            Thread.sleep(20);   // 자리는 PDF 스레드가 끝날 때 돌려준다
        }
        if (r.available() != 1) {
            fail("자리가 돌아오지 않았다");
        }
        r.shutdown();
    }

    @Test
    public void loader가_실패하면_BROKEN이고_자리를_돌려준다() {
        DocCheckRunner r = new DocCheckRunner(1);
        assertEquals("BROKEN", r.run("pptx", () -> {
            throw new java.io.IOException("읽기 실패");
        }).reason);
        assertEquals(1, r.available());
        r.shutdown();
    }
}
